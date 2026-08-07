/**
 * Division and Assent — deciding a Motion, then enacting it.
 *
 * ADR-0004 draws the line this module implements: **the Division decides, the
 * Assent enacts.** They are separate verbs held by different roles. A Motion
 * can carry and still not take effect, because carrying is an outcome and
 * enacting is an act.
 *
 * Pure, like the rest of the governance layer: these functions produce Hansard
 * entries and next-states. The caller commits them.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import { checkQuorum, type QuorumOverride } from './quorum.ts';
import { createState, type SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Votes                                                                       */
/* -------------------------------------------------------------------------- */

export const VOTES = ['AYE', 'NO', 'ABSTAIN'] as const;

export type Vote = (typeof VOTES)[number];

export const isVote = (v: unknown): v is Vote =>
  typeof v === 'string' && (VOTES as readonly string[]).includes(v);

export interface CastVote {
  readonly actor: string;
  readonly role: Role;
  readonly vote: Vote;
}

export class DivisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DivisionError';
  }
}

/* -------------------------------------------------------------------------- */
/* Calling a Division                                                          */
/* -------------------------------------------------------------------------- */

export interface CallDivisionInput {
  readonly motion: string;
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly reviewers: readonly string[];
  readonly state: SessionStateFile;
}

/** Open a Division on a tabled Motion. */
export const callDivision = (input: CallDivisionInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  if (input.state.state !== 'CONVENED') {
    throw new DivisionError(
      `cannot call a Division while the session is ${input.state.state}`,
    );
  }
  // One Division per Motion. Re-calling would open a second vote on a Motion
  // that may already be decided, letting a settled outcome be overturned. A
  // genuinely new question is a new Motion.
  if (divisionCalled(hansard, input.motion)) {
    throw new DivisionError(`a Division has already been called on ${input.motion}`);
  }

  const entry: HansardEntry = {
    type: 'DIVISION_CALLED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Motion: input.motion,
      Reviewers: input.reviewers.join(', '),
    },
    body: `A Division is called on ${input.motion}.`,
  };

  return { entry, hansard: appendEntry(hansard, entry) };
};

/* -------------------------------------------------------------------------- */
/* Casting a vote                                                              */
/* -------------------------------------------------------------------------- */

export interface CastVoteInput {
  readonly motion: string;
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly vote: Vote;
  readonly state: SessionStateFile;
}

/**
 * Record a vote.
 *
 * OBSERVER is refused: the role is defined as read-only with no floor rights. A
 * protocol that wants an observer-class actor to decide something declares a
 * DOMAIN_VETO instead — that is exactly the power inversion CANON models, and
 * it is declared in the Charter rather than smuggled in through a vote.
 */
export const castVote = (input: CastVoteInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  if (input.state.state !== 'CONVENED') {
    throw new DivisionError(`cannot vote while the session is ${input.state.state}`);
  }
  if (input.role === 'OBSERVER') {
    throw new DivisionError('OBSERVER holds no floor rights and may not vote');
  }
  if (!isVote(input.vote)) {
    throw new DivisionError(`not a valid vote: ${String(input.vote)}`);
  }

  // A vote only exists inside a Division. Without this a vote could be cast on a
  // Motion no Division was ever called on, and enough such phantom votes would
  // let a tally "carry" a Motion that never reached the floor.
  if (!divisionCalled(hansard, input.motion)) {
    throw new DivisionError(`no Division has been called on ${input.motion}`);
  }
  // A decided Division is closed. Without this a late vote could be cast after
  // the outcome was recorded and a re-tally would overturn a settled decision —
  // the record is append-only, but the decision it carries must be final.
  if (divisionDecided(hansard, input.motion)) {
    throw new DivisionError(`the Division on ${input.motion} has closed — its outcome is on the record`);
  }

  // One vote per actor per Motion. A second vote is not an amendment — it is an
  // attempt to rewrite a record that is append-only by construction.
  const already = votesFor(hansard, input.motion).find((v) => v.actor === input.actor);
  if (already !== undefined) {
    throw new DivisionError(
      `${input.actor} has already voted ${already.vote} on ${input.motion}`,
    );
  }

  const entry: HansardEntry = {
    type: 'VOTE_CAST',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: { Motion: input.motion, Vote: input.vote },
  };

  return { entry, hansard: appendEntry(hansard, entry) };
};

/** Whether a Division was ever called on this Motion. */
export const divisionCalled = (hansard: string, motion: string): boolean =>
  parseEntries(hansard).some(
    (e) => e.type === 'DIVISION_CALLED' && e.fields['Motion'] === motion,
  );

/** Whether a Division on this Motion has been decided — its outcome recorded.
 * A DEADLOCK records MOTION_REJECTED, so it too closes the Division. */
export const divisionDecided = (hansard: string, motion: string): boolean =>
  parseEntries(hansard).some(
    (e) =>
      (e.type === 'MOTION_CARRIED' || e.type === 'MOTION_REJECTED') &&
      e.fields['Motion'] === motion,
  );

/** Every vote recorded against a Motion, read back from the Hansard. */
export const votesFor = (hansard: string, motion: string): readonly CastVote[] =>
  parseEntries(hansard)
    .filter((e) => e.type === 'VOTE_CAST' && e.fields['Motion'] === motion)
    .map((e) => ({
      actor: e.actor,
      role: e.role as Role,
      vote: (e.fields['Vote'] ?? 'ABSTAIN') as Vote,
    }));

/* -------------------------------------------------------------------------- */
/* Outcome                                                                     */
/* -------------------------------------------------------------------------- */

export interface DivisionOutcome {
  readonly motion: string;
  readonly ayes: number;
  readonly noes: number;
  readonly abstentions: number;
  /** Did the Motion carry? */
  readonly carried: boolean;
  /** Quorum is counted on votes cast, abstentions excluded. */
  readonly quorum_met: boolean;
  /**
   * The quorum threshold in force when this Division was tallied.
   *
   * Recorded so a Division entry is auditable on its own terms. Without it,
   * "quorum met" only means something to a reader willing to recover the
   * Charter as it stood at that commit — and a record that requires
   * cross-referencing to interpret is doing less work than a record should.
   *
   * Enacted by motion-001 of session clean-001, which observed that the
   * validity of a carried Motion was "unverifiable after the fact".
   */
  readonly quorum_required: number;
  readonly reason: string;
}

/**
 * Tally a Division.
 *
 * Abstentions are recorded but do not count toward quorum: an abstention is a
 * declared non-participation, and counting it would let a Division reach quorum
 * without anyone actually deciding anything.
 *
 * A tie does not carry. Without a majority there is no decision, and a Motion
 * that cannot be decided is a DEADLOCK for AUTHORITY to rule on — not a silent
 * pass.
 */
export const tallyDivision = (
  hansard: string,
  motion: string,
  quorumRequired: number,
  override?: QuorumOverride | null,
): DivisionOutcome => {
  const votes = votesFor(hansard, motion);
  const ayes = votes.filter((v) => v.vote === 'AYE').length;
  const noes = votes.filter((v) => v.vote === 'NO').length;
  const abstentions = votes.filter((v) => v.vote === 'ABSTAIN').length;

  const quorum = checkQuorum({
    required: quorumRequired,
    present: ayes + noes,
    override,
  });

  if (!quorum.met) {
    return {
      motion,
      ayes,
      noes,
      abstentions,
      carried: false,
      quorum_met: false,
      quorum_required: quorumRequired,
      reason: quorum.reason ?? 'quorum not met',
    };
  }

  if (ayes > noes) {
    return {
      motion, ayes, noes, abstentions,
      carried: true,
      quorum_met: true,
      quorum_required: quorumRequired,
      reason: `carried ${ayes} to ${noes}${quorum.degraded ? ' (degraded quorum)' : ''}`,
    };
  }

  return {
    motion, ayes, noes, abstentions,
    carried: false,
    quorum_met: true,
    quorum_required: quorumRequired,
    reason: ayes === noes ? `tied ${ayes} all — no majority, DEADLOCK` : `rejected ${ayes} to ${noes}`,
  };
};

/** Record the outcome of a Division. */
export const recordOutcome = (
  outcome: DivisionOutcome,
  at: string,
  actor: string,
  role: Role,
  hansard: string,
): { readonly entry: HansardEntry; readonly hansard: string } => {
  const entry: HansardEntry = {
    type: outcome.carried ? 'MOTION_CARRIED' : 'MOTION_REJECTED',
    at,
    actor,
    role,
    fields: {
      Motion: outcome.motion,
      Ayes: String(outcome.ayes),
      Noes: String(outcome.noes),
      Abstentions: String(outcome.abstentions),
      Quorum: `${outcome.quorum_met ? 'met' : 'NOT MET'} (${outcome.quorum_required} required)`,
      Outcome: outcome.reason,
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

/* -------------------------------------------------------------------------- */
/* Assent                                                                      */
/* -------------------------------------------------------------------------- */

export interface AssentInput {
  readonly motion: string;
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  /** Role the Charter grants ASSENT. Defaults to AUTHORITY (ADR-0004). */
  readonly assent_role: Role;
  readonly outcome: DivisionOutcome;
  readonly state: SessionStateFile;
  /**
   * Is a veto standing against this Motion? ADR-0004 makes Assent invalid while
   * one is outstanding — the fourth condition, and the one a caller is most
   * likely to forget, so it is explicit rather than inferred.
   */
  readonly veto_outstanding?: boolean;
}

/**
 * Grant Assent — enact a carried Motion.
 *
 * Four conditions, all from ADR-0004. Every one is checked rather than assumed,
 * because Assent is the moment a decision becomes an effect and it is the last
 * point at which the constitution can refuse.
 */
export const grantAssent = (input: AssentInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (input.role !== input.assent_role) {
    throw new DivisionError(
      `ASSENT is held by ${input.assent_role} — ${input.actor} is ${input.role}`,
    );
  }
  if (input.state.state !== 'CONVENED') {
    throw new DivisionError(`cannot grant Assent while the session is ${input.state.state}`);
  }
  if (!input.outcome.carried) {
    throw new DivisionError(
      `${input.motion} did not carry (${input.outcome.reason}) — there is nothing to enact`,
    );
  }
  if (alreadyEnacted(hansard, input.motion)) {
    throw new DivisionError(`${input.motion} has already received Assent`);
  }
  if (input.veto_outstanding === true) {
    throw new DivisionError(
      `a veto stands against ${input.motion} — it may not receive Assent while that veto is outstanding`,
    );
  }

  const entry: HansardEntry = {
    type: 'ASSENT_GRANTED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Motion: input.motion,
      Division: input.outcome.reason,
      Effect: 'enacted',
    },
    body: `Assent granted. ${input.motion} is enacted.`,
  };

  return {
    entry,
    hansard: appendEntry(hansard, entry),
    state: createState({
      session_guid: input.state.session_guid,
      protocol: input.state.protocol,
      state: 'CONVENED',
      quorum: input.state.quorum,
      hansard_head: input.state.hansard_head,
      updated_at: input.at,
    }),
  };
};

/** Has this Motion already been enacted? */
export const alreadyEnacted = (hansard: string, motion: string): boolean =>
  parseEntries(hansard).some(
    (e) => e.type === 'ASSENT_GRANTED' && e.fields['Motion'] === motion,
  );

/* -------------------------------------------------------------------------- */
/* Deadlock                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Suspend a proceeding on an undecidable Division.
 *
 * ADR-0004 Proposal 4 adds `DEADLOCK` to the suspension causes: a Division that
 * yields no valid outcome is a governance failure, not a silent pass. Until
 * this existed the tally wrote the word "DEADLOCK" into free text and the
 * session carried on as though nothing had happened.
 *
 * Suspends rather than rejects, because a tie is not a decision against the
 * Motion — it is the absence of one, and only AUTHORITY can supply what the
 * House could not.
 */
export const suspendForDeadlock = (
  outcome: DivisionOutcome,
  at: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (outcome.carried || outcome.ayes !== outcome.noes || !outcome.quorum_met) {
    throw new DivisionError(
      `${outcome.motion} is not deadlocked — ${outcome.reason}`,
    );
  }
  if (state.state !== 'CONVENED') {
    throw new DivisionError(`cannot declare a deadlock while the session is ${state.state}`);
  }

  const entry: HansardEntry = {
    type: 'DEADLOCK',
    at,
    actor: 'RECORD',
    role: 'OPERATOR',
    fields: {
      Motion: outcome.motion,
      Division: outcome.reason,
      'Session status': 'SUSPENDED — no valid Division outcome',
      Resolution: 'AUTHORITY must rule; the House could not decide',
    },
  };

  return {
    entry,
    hansard: appendEntry(hansard, entry),
    state: createState({
      session_guid: state.session_guid,
      protocol: state.protocol,
      state: 'SUSPENDED',
      quorum: state.quorum,
      hansard_head: state.hansard_head,
      updated_at: at,
      suspension: {
        cause: 'DEADLOCK',
        since: at,
        record_ref: 'HANSARD.md',
        escalation_ref: null,
      },
    }),
  };
};
