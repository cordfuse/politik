/**
 * Actor lifecycle — seating, moving and removing actors.
 *
 * Implements the CANON verbs that change who holds what: HIRE, FIRE, PROMOTE,
 * DEMOTE, EXPEL, VETO, SPAWN and EXIT.
 *
 * The design constraint that shapes everything here is RUNTIME.md § Actor
 * Elimination: an immutable Hansard records *that* an actor was removed but not
 * *why*, or whether the why was legitimate. So every removal must declare an
 * exit type, and the taxonomy deliberately distinguishes forms of leaving that
 * look identical in a naive log — a Minister who conceded on the merits and one
 * who was pressured out record differently, on purpose.
 *
 * Pure, like the rest of the governance layer. These functions produce Hansard
 * entries; the caller commits them.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { ROLE_PRECEDENCE, isRole, type Role } from './canon.ts';
import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import { createState } from './state.ts';
import type { SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Exit taxonomy                                                               */
/* -------------------------------------------------------------------------- */

export const EXIT_TYPES = [
  'EXIT_PERFORMANCE',
  'EXIT_PROTOCOL',
  'EXIT_DIVISION',
  'EXIT_VOLUNTARY_CONCESSION',
  'EXIT_VOLUNTARY_STRATEGIC',
  'EXIT_VOLUNTARY_COERCED',
  'EXIT_DARWINIST',
  'EXIT_SPEAKER',
  'EXIT_DISPUTED',
] as const;

export type ExitType = (typeof EXIT_TYPES)[number];

export const isExitType = (v: unknown): v is ExitType =>
  typeof v === 'string' && (EXIT_TYPES as readonly string[]).includes(v);

/** Exits an actor declares about themselves. */
const VOLUNTARY: readonly ExitType[] = Object.freeze([
  'EXIT_VOLUNTARY_CONCESSION',
  'EXIT_VOLUNTARY_STRATEGIC',
  'EXIT_VOLUNTARY_COERCED',
]);

export const isVoluntary = (type: ExitType): boolean => VOLUNTARY.includes(type);

export class ActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActorError';
  }
}

/* -------------------------------------------------------------------------- */
/* Seat state                                                                  */
/* -------------------------------------------------------------------------- */

export interface Seat {
  readonly actor: string;
  readonly role: Role;
  readonly seated_at: string;
}

/**
 * Who currently holds a seat, read back from the Hansard.
 *
 * The Hansard is the register: there is no separate roster to fall out of sync
 * with the record. An actor is seated if they were admitted and have not since
 * exited, and their role is whatever the most recent PROMOTE or DEMOTE made it.
 */
export const seats = (hansard: string): readonly Seat[] => {
  const held = new Map<string, Seat>();

  for (const entry of parseEntries(hansard)) {
    const subject = entry.fields['Actor affected'];
    if (subject === undefined) continue;

    switch (entry.type) {
      case 'ACTOR_HIRED': {
        const role = entry.fields['Role'];
        if (role !== undefined) {
          held.set(subject, { actor: subject, role: role as Role, seated_at: entry.at });
        }
        break;
      }
      case 'ACTOR_PROMOTED':
      case 'ACTOR_DEMOTED': {
        const to = entry.fields['To'];
        const existing = held.get(subject);
        if (to !== undefined && existing !== undefined) {
          held.set(subject, { ...existing, role: to as Role });
        }
        break;
      }
      case 'ACTOR_EXITED':
        held.delete(subject);
        break;
      default:
        break;
    }
  }

  return [...held.values()];
};

export const seatOf = (hansard: string, actor: string): Seat | null =>
  seats(hansard).find((s) => s.actor === actor) ?? null;

/* -------------------------------------------------------------------------- */
/* Common guards                                                               */
/* -------------------------------------------------------------------------- */

interface ActInput {
  readonly at: string;
  /** Who is performing the act. */
  readonly actor: string;
  readonly role: Role;
  readonly state: SessionStateFile;
}

const requireConvened = (state: SessionStateFile, verb: string): void => {
  if (state.state !== 'CONVENED') {
    throw new ActorError(`cannot ${verb} while the session is ${state.state}`);
  }
};

/**
 * Verbs that move actors between roles are AUTHORITY powers.
 *
 * RUNTIME.md § Constitutional Capture names the abuse directly: AUTHORITY
 * "uses legitimately held powers to remove actors who would check those powers,
 * and promotes actors who will not". Restricting the verb does not prevent
 * that — nothing can, since the power is constitutional — but it keeps every
 * use of it attributed to the one role that can be held responsible.
 */
const requireAuthority = (input: ActInput, verb: string): void => {
  if (input.role !== 'AUTHORITY' && input.role !== 'DELEGATE') {
    throw new ActorError(
      `${verb} is an AUTHORITY power — ${input.actor} is ${input.role}`,
    );
  }
};

const rank = (role: Role): number => ROLE_PRECEDENCE.indexOf(role);

/* -------------------------------------------------------------------------- */
/* HIRE                                                                        */
/* -------------------------------------------------------------------------- */

export interface HireInput extends ActInput {
  readonly subject: string;
  readonly seat: Role;
  readonly reason: string;
}

/** Bring a new actor into a convened proceeding. */
export const hire = (input: HireInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  requireConvened(input.state, 'HIRE');
  requireAuthority(input, 'HIRE');

  if (!isRole(input.seat)) {
    throw new ActorError(`not a CANON role: ${String(input.seat)}`);
  }
  if (input.seat === 'AUTHORITY') {
    throw new ActorError(
      'AUTHORITY cannot be granted by HIRE — the Speaker is constitutional, not appointed',
    );
  }
  if (seatOf(hansard, input.subject) !== null) {
    throw new ActorError(`${input.subject} already holds a seat`);
  }

  const entry: HansardEntry = {
    type: 'ACTOR_HIRED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      'Actor affected': input.subject,
      Role: input.seat,
      Reason: input.reason,
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

/* -------------------------------------------------------------------------- */
/* PROMOTE / DEMOTE                                                            */
/* -------------------------------------------------------------------------- */

export interface MoveInput extends ActInput {
  readonly subject: string;
  readonly to: Role;
  readonly reason: string;
}

const move = (
  input: MoveInput,
  hansard: string,
  direction: 'PROMOTE' | 'DEMOTE',
): { readonly entry: HansardEntry; readonly hansard: string } => {
  requireConvened(input.state, direction);
  requireAuthority(input, direction);

  const seat = seatOf(hansard, input.subject);
  if (seat === null) throw new ActorError(`${input.subject} holds no seat`);

  if (!isRole(input.to)) {
    throw new ActorError(`not a CANON role: ${String(input.to)}`);
  }
  if (input.to === 'AUTHORITY') {
    throw new ActorError('no actor may be promoted into AUTHORITY');
  }
  if (seat.role === input.to) {
    throw new ActorError(`${input.subject} already sits as ${input.to}`);
  }

  const higher = rank(input.to) < rank(seat.role);
  if (direction === 'PROMOTE' && !higher) {
    throw new ActorError(`${input.to} is not above ${seat.role} — that is a DEMOTE`);
  }
  if (direction === 'DEMOTE' && higher) {
    throw new ActorError(`${input.to} is not below ${seat.role} — that is a PROMOTE`);
  }

  const entry: HansardEntry = {
    type: direction === 'PROMOTE' ? 'ACTOR_PROMOTED' : 'ACTOR_DEMOTED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      'Actor affected': input.subject,
      From: seat.role,
      To: input.to,
      Reason: input.reason,
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

export const promote = (input: MoveInput, hansard: string) => move(input, hansard, 'PROMOTE');
export const demote = (input: MoveInput, hansard: string) => move(input, hansard, 'DEMOTE');

/* -------------------------------------------------------------------------- */
/* EXIT — removal and withdrawal                                               */
/* -------------------------------------------------------------------------- */

export interface ExitInput extends ActInput {
  readonly subject: string;
  readonly exit_type: ExitType;
  readonly reason: string;
  /** True when the Charter requires a concession statement for voluntary exits. */
  readonly require_concession?: boolean;
}

/**
 * Remove an actor, or record one withdrawing.
 *
 * Every removal declares an exit type. The taxonomy is the point: FIRE and
 * EXPEL both end a seat, but `EXIT_PERFORMANCE` and `EXIT_PROTOCOL` say
 * different things about why, and a reader of the record months later can tell
 * them apart.
 *
 * A voluntary exit may only be declared by the actor leaving. Letting a third
 * party record someone else's resignation is precisely the "voluntold" pattern
 * RUNTIME.md calls the most dangerous exit type — it produces the outcome of an
 * expulsion while generating none of the evidence one would leave.
 */
export const exitActor = (input: ExitInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  requireConvened(input.state, 'EXIT');

  const seat = seatOf(hansard, input.subject);
  if (seat === null) throw new ActorError(`${input.subject} holds no seat`);
  if (!isExitType(input.exit_type)) {
    throw new ActorError(`not a CANON exit type: ${String(input.exit_type)}`);
  }
  if (seat.role === 'AUTHORITY') {
    throw new ActorError(
      'AUTHORITY cannot be removed from within the session — that is a constitutional crisis, not an exit',
    );
  }

  const selfDeclared = input.actor === input.subject;

  if (isVoluntary(input.exit_type) && !selfDeclared) {
    throw new ActorError(
      `a voluntary exit may only be declared by the actor leaving — ${input.actor} cannot record it for ${input.subject}`,
    );
  }
  if (!isVoluntary(input.exit_type) && !selfDeclared) {
    requireAuthority(input, 'removal');
  }
  if (input.require_concession === true && isVoluntary(input.exit_type) && input.reason.trim() === '') {
    throw new ActorError(
      'this Charter requires a concession statement for a voluntary exit',
    );
  }
  if (input.reason.trim() === '') {
    throw new ActorError('an exit must state its reason — an unexplained removal is not attributable');
  }

  const entry: HansardEntry = {
    type: 'ACTOR_EXITED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      'Actor affected': input.subject,
      'Seat held': seat.role,
      'Exit type': input.exit_type,
      Declared: selfDeclared ? 'by the actor' : `by ${input.actor} (${input.role})`,
      Reason: input.reason,
      Appealable: input.exit_type === 'EXIT_DISPUTED' ? 'under appeal' : 'yes — file a Point of Order',
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

/**
 * An elimination exit, declared by the engine rather than an actor (ADR-0007,
 * exit: elimination). A Battle Royale culls the losing side of a Division; the
 * cull is EXIT_DARWINIST and final, so it does not pass through the guarded
 * exit() path — no actor is declaring it and there is nothing to appeal.
 * AUTHORITY is never culled: the Speaker holds no seat in the register, so a
 * caller can never reach this with one.
 */
export const darwinistExit = (subject: string, seat: Role, at: string): HansardEntry => ({
  type: 'ACTOR_EXITED',
  at,
  actor: subject,
  role: seat,
  fields: {
    'Actor affected': subject,
    'Seat held': seat,
    'Exit type': 'EXIT_DARWINIST',
    Declared: 'by the protocol — elimination',
    Reason: 'eliminated: backed the losing side of a Division under an elimination protocol',
    Appealable: 'no — elimination is final',
  },
});

/* -------------------------------------------------------------------------- */
/* VETO                                                                        */
/* -------------------------------------------------------------------------- */

export interface VetoInput extends ActInput {
  readonly motion: string;
  readonly reason: string;
  /** Roles the Charter grants DOMAIN_VETO. */
  readonly domain_veto: readonly Role[];
}

/**
 * Veto a Motion.
 *
 * Two sources of the power: AUTHORITY holds it constitutionally, and a Charter
 * may grant DOMAIN_VETO to a lower-trust role — the Jury in a Criminal Trial,
 * a statistical reviewer in Peer Review. The second is a declared inversion of
 * the trust hierarchy, never inferred from it.
 */
export const veto = (input: VetoInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  requireConvened(input.state, 'VETO');

  const constitutional = input.role === 'AUTHORITY';
  const domain = input.domain_veto.includes(input.role);
  if (!constitutional && !domain) {
    throw new ActorError(
      `${input.role} holds no veto — AUTHORITY, or a role granted DOMAIN_VETO by the Charter`,
    );
  }
  if (input.reason.trim() === '') {
    throw new ActorError('a veto must state its grounds');
  }

  const entry: HansardEntry = {
    type: 'VETO_EXERCISED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Motion: input.motion,
      Basis: constitutional ? 'constitutional (AUTHORITY)' : 'DOMAIN_VETO granted by Charter',
      Grounds: input.reason,
      Effect: 'the Motion may not receive Assent while this veto stands',
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

/** Is there an outstanding veto against this Motion? (ADR-0004 Assent condition.) */
export const vetoOutstanding = (hansard: string, motion: string): boolean =>
  parseEntries(hansard).some(
    (e) => e.type === 'VETO_EXERCISED' && e.fields['Motion'] === motion,
  );

/* -------------------------------------------------------------------------- */
/* SPAWN                                                                       */
/* -------------------------------------------------------------------------- */

export interface SpawnInput extends ActInput {
  /** Identifier of the child proceeding. */
  readonly child: string;
  readonly mandate: string;
}

/**
 * Refer business to a sub-session.
 *
 * Records the referral only. Creating the child repo is the caller's job — this
 * layer never performs I/O — but the parent's Hansard carries the referral so
 * the chain from parent to child is on the record at both ends.
 */
export const spawnChild = (input: SpawnInput, hansard: string): {
  readonly entry: HansardEntry;
  readonly hansard: string;
} => {
  requireConvened(input.state, 'SPAWN');
  if (input.role === 'MEMBER' || input.role === 'OBSERVER') {
    throw new ActorError(`${input.role} may not refer business to a committee`);
  }
  if (input.mandate.trim() === '') {
    throw new ActorError('a referral must state the committee mandate');
  }

  const entry: HansardEntry = {
    type: 'COMMITTEE_SPAWNED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Child: input.child,
      Mandate: input.mandate,
      Parent: input.state.session_guid,
    },
  };
  return { entry, hansard: appendEntry(hansard, entry) };
};

/* -------------------------------------------------------------------------- */
/* Speaker order                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Suspend the sitting by Speaker order.
 *
 * The plainest of the suspension causes and, until now, unreachable: AUTHORITY
 * halting proceedings for a stated reason. Distinct from a Point of Order (an
 * actor asks) and from staleness (nobody acted) — here the Speaker decides, and
 * the record should say so rather than borrowing another cause's label.
 */
export const speakerOrder = (
  at: string,
  actor: string,
  role: Role,
  reason: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (role !== 'AUTHORITY') {
    throw new ActorError(`only AUTHORITY may suspend the sitting — ${actor} is ${role}`);
  }
  if (state.state !== 'CONVENED') {
    throw new ActorError(`the session is already ${state.state}`);
  }
  if (reason.trim() === '') {
    throw new ActorError('a Speaker order must state its reason');
  }

  const entry: HansardEntry = {
    type: 'SPEAKER_ORDER',
    at,
    actor,
    role,
    fields: {
      Reason: reason,
      'Session status': 'SUSPENDED — by order of the Speaker',
      Resolution: 'the Speaker resumes the sitting',
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
        cause: 'SPEAKER_ORDER',
        since: at,
        record_ref: 'HANSARD.md',
        escalation_ref: null,
      },
    }),
  };
};

/* -------------------------------------------------------------------------- */
/* Disputed exit                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Dispute one's own removal.
 *
 * RUNTIME.md § Actor Elimination: an actor may challenge their removal, and the
 * challenge suspends the sitting pending a Speaker ruling. Only the removed
 * actor may file — a third party disputing on someone's behalf would be the
 * mirror image of the voluntold problem, manufacturing a grievance the actor
 * never raised.
 */
export const disputeExit = (
  at: string,
  actor: string,
  grounds: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  const removal = parseEntries(hansard)
    .filter((e) => e.type === 'ACTOR_EXITED' && e.fields['Actor affected'] === actor)
    .at(-1);

  if (removal === undefined) {
    throw new ActorError(`${actor} has no recorded exit to dispute`);
  }
  if (removal.actor === actor) {
    throw new ActorError('an actor cannot dispute a departure they declared themselves');
  }
  if (grounds.trim() === '') {
    throw new ActorError('a disputed exit must state its grounds');
  }

  const entry: HansardEntry = {
    type: 'EXIT_DISPUTED',
    at,
    actor,
    role: (removal.fields['Seat held'] ?? 'MEMBER') as Role,
    fields: {
      'Actor affected': actor,
      'Removed by': removal.actor,
      'Original exit type': removal.fields['Exit type'] ?? 'unknown',
      Grounds: grounds,
      'Session status': 'SUSPENDED — awaiting a Speaker ruling on the removal',
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
        cause: 'DISPUTED_EXIT',
        since: at,
        record_ref: 'HANSARD.md',
        escalation_ref: null,
      },
    }),
  };
};

/**
 * AUTHORITY rules on a disputed exit, and the sitting resumes.
 *
 * The dispute suspended the sitting pending a ruling; this supplies it. UPHELD
 * overturns the removal and reinstates the actor to the seat they held; REVERSED
 * lets the removal stand. Either way the ruling lifts the suspension — the record
 * carries the decision and the House goes back to work. Only AUTHORITY rules
 * (the CLI gates the role); a bad-faith ruling is visible to everyone who can
 * read the repo, which is the only check on a captured chair the framework claims.
 */
export const resolveDispute = (
  at: string,
  ruler: string,
  ruling: 'UPHELD' | 'REVERSED',
  subject: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entries: readonly HansardEntry[];
  readonly hansard: string;
  readonly reinstated: boolean;
  readonly state: SessionStateFile;
} => {
  if (state.state !== 'SUSPENDED' || state.suspension?.cause !== 'DISPUTED_EXIT') {
    throw new ActorError('the session is not under a disputed exit — there is nothing to rule on');
  }
  const entries = parseEntries(hansard);
  const dispute = entries
    .filter((e) => e.type === 'EXIT_DISPUTED' && e.fields['Actor affected'] === subject)
    .at(-1);
  if (dispute === undefined) {
    throw new ActorError(`${subject} has no disputed exit on the record`);
  }
  const removal = entries
    .filter((e) => e.type === 'ACTOR_EXITED' && e.fields['Actor affected'] === subject)
    .at(-1);
  const seat = (removal?.fields['Seat held'] ?? 'MEMBER') as Role;
  const upheld = ruling === 'UPHELD';

  const rulingEntry: HansardEntry = {
    type: 'EXIT_RULING',
    at,
    actor: ruler,
    role: 'AUTHORITY',
    fields: {
      'Actor affected': subject,
      Ruling: ruling,
      Seat: seat,
      Outcome: upheld
        ? `the removal is overturned — ${subject} is reinstated to ${seat}`
        : `the removal stands — ${subject} remains out`,
      'Session status': 'CONVENED — the sitting resumes',
    },
  };

  const out: HansardEntry[] = [rulingEntry];
  if (upheld) {
    // Re-seat with a fresh ACTOR_HIRED so seats() counts the actor again. Not
    // the hire() helper — that requires a CONVENED session, and we are resolving
    // the suspension; the ruling itself is what lifts it.
    out.push({
      type: 'ACTOR_HIRED',
      at,
      actor: ruler,
      role: seat,
      fields: {
        'Actor affected': subject,
        Role: seat,
        Reason: 'reinstated after a disputed exit was upheld',
      },
    });
  }

  let doc = hansard;
  for (const entry of out) doc = appendEntry(doc, entry);

  return {
    entries: out,
    hansard: doc,
    reinstated: upheld,
    state: createState({
      session_guid: state.session_guid,
      protocol: state.protocol,
      state: 'CONVENED',
      quorum: state.quorum,
      hansard_head: state.hansard_head,
      updated_at: at,
      updated_by: ruler,
      suspension: null,
    }),
  };
};
