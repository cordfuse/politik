/**
 * Constitutional crisis — the failure mode where AUTHORITY is the corruptor.
 *
 * Every other defence in Politik routes to the Speaker: disputed exits,
 * promotion vetoes, hung Divisions, Points of Order. If the Speaker is the
 * source of corruption, all of those route directly to the problem — the system
 * does not merely fail, it assists (RUNTIME.md § Constitutional Capture).
 *
 * There is no mechanism above AUTHORITY, by design. That is what makes the role
 * constitutional. So this module does not remove a Speaker; it cannot. What it
 * does is make capture **visible, attributed and undeniable**, halt the session
 * so no further acts are taken under a captured constitution, and require a
 * human from outside the session to rule before anything resumes.
 *
 * The receipts survive even if the session is later dissolved. Transparency is
 * the only remaining defence, so the record is the defence.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import { createState, type SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

export interface ConsensusSuspension {
  readonly enabled: boolean;
  /** Fraction of OPERATOR actors required to concur. RUNTIME default: 0.75. */
  readonly threshold: number;
  /** Resuming requires a human from outside the session. */
  readonly resume_requires: 'external_review';
}

export const DEFAULT_CONSENSUS: ConsensusSuspension = Object.freeze({
  enabled: true,
  threshold: 0.75,
  resume_requires: 'external_review',
});

/**
 * OBSERVER actors designated as constitutional witnesses.
 *
 * A witness can file alone. That is deliberate and not a threshold bug: the
 * Witness Council exists precisely for the case where the OPERATOR bench has
 * already been captured — packed, demoted or expelled — and no supermajority
 * remains to be assembled. One credible outside observer is the last mechanism
 * that still functions.
 */
export interface WitnessCouncil {
  readonly enabled: boolean;
  readonly roles: readonly Role[];
  readonly can_file: 'CONSTITUTIONAL_CRISIS';
}

export class CrisisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrisisError';
  }
}

/* -------------------------------------------------------------------------- */
/* Filing                                                                      */
/* -------------------------------------------------------------------------- */

export interface CrisisFiling {
  readonly actor: string;
  readonly role: Role;
  readonly grounds: string;
  readonly at: string;
}

export interface FileCrisisInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  /** What AUTHORITY is alleged to have done. */
  readonly grounds: string;
  /** The Speaker the filing is against. */
  readonly against: string;
  readonly state: SessionStateFile;
  readonly witness?: WitnessCouncil | null;
}

/**
 * File a constitutional crisis escalation against AUTHORITY.
 *
 * Who may file:
 *  - OPERATOR — needs a supermajority to trigger suspension
 *  - a designated witness role — triggers alone
 *
 * AUTHORITY may not file against itself. A Speaker declaring their own crisis
 * would be a route to suspending a session at will while appearing to submit to
 * scrutiny, which is a capture technique rather than a defence against one.
 */
export const fileCrisis = (
  input: FileCrisisInput,
  hansard: string,
): { readonly entry: HansardEntry; readonly hansard: string } => {
  if (input.role === 'AUTHORITY') {
    throw new CrisisError(
      'AUTHORITY may not file a constitutional crisis against itself',
    );
  }

  const isWitness =
    input.witness?.enabled === true && input.witness.roles.includes(input.role);

  if (input.role !== 'OPERATOR' && !isWitness) {
    throw new CrisisError(
      `${input.role} may not file a constitutional crisis — OPERATOR, or a designated witness role, only`,
    );
  }

  if (input.grounds.trim() === '') {
    throw new CrisisError('a crisis filing must state its grounds');
  }

  const already = filings(hansard).find((f) => f.actor === input.actor);
  if (already !== undefined) {
    throw new CrisisError(`${input.actor} has already filed`);
  }

  const entry: HansardEntry = {
    type: 'CONSTITUTIONAL_CRISIS_FILED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Against: `${input.against} (AUTHORITY)`,
      Grounds: input.grounds,
      Basis: isWitness ? 'Witness Council' : 'OPERATOR consensus',
    },
    body: input.grounds,
  };

  return { entry, hansard: appendEntry(hansard, entry) };
};

/** Every crisis filing on the record. */
export const filings = (hansard: string): readonly CrisisFiling[] =>
  parseEntries(hansard)
    .filter((e) => e.type === 'CONSTITUTIONAL_CRISIS_FILED')
    .map((e) => ({
      actor: e.actor,
      role: e.role as Role,
      grounds: e.fields['Grounds'] ?? '',
      at: e.at,
    }));

/* -------------------------------------------------------------------------- */
/* Threshold                                                                   */
/* -------------------------------------------------------------------------- */

export interface CaptureCheck {
  /** Has the session been captured, on the evidence filed? */
  readonly triggered: boolean;
  readonly filed: number;
  readonly operators: number;
  readonly required: number;
  readonly by_witness: boolean;
  readonly reason: string;
}

/**
 * Has a supermajority — or a witness — declared capture?
 *
 * The threshold is computed against the OPERATOR bench as seated, which is the
 * uncomfortable part: a Speaker who has already expelled dissenting Ministers
 * shrinks the denominator and makes the remaining bench easier to hold. The
 * Witness Council exists because of exactly that, and a witness filing bypasses
 * the count entirely.
 */
export const checkCapture = (
  hansard: string,
  operatorCount: number,
  witness: WitnessCouncil | null = null,
  consensus: ConsensusSuspension = DEFAULT_CONSENSUS,
): CaptureCheck => {
  const filed = filings(hansard);

  const witnessFiled =
    witness?.enabled === true &&
    filed.some((f) => witness.roles.includes(f.role));

  if (witnessFiled) {
    return {
      triggered: true,
      filed: filed.length,
      operators: operatorCount,
      required: 1,
      by_witness: true,
      reason: 'a designated constitutional witness has filed',
    };
  }

  if (!consensus.enabled) {
    return {
      triggered: false,
      filed: filed.length,
      operators: operatorCount,
      required: 0,
      by_witness: false,
      reason: 'consensus suspension is not enabled by this Charter',
    };
  }

  const operatorFilings = filed.filter((f) => f.role === 'OPERATOR').length;
  const required = Math.ceil(operatorCount * consensus.threshold);

  return {
    triggered: operatorFilings >= required && required > 0,
    filed: operatorFilings,
    operators: operatorCount,
    required,
    by_witness: false,
    reason:
      operatorFilings >= required && required > 0
        ? `${operatorFilings} of ${operatorCount} OPERATOR actors concur (${required} required)`
        : `${operatorFilings} of ${required} required filings`,
  };
};

/* -------------------------------------------------------------------------- */
/* Suspension                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Suspend the session for constitutional crisis.
 *
 * Suspends rather than prorogues, deliberately. A prorogued session is sealed
 * and archived — which is precisely what a captured AUTHORITY would want, since
 * it stops the record before more evidence accumulates. Suspension keeps the
 * proceeding open and the Hansard live. `prorogue()` already refuses a session
 * in this state.
 */
export const suspendForCrisis = (
  check: CaptureCheck,
  at: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (!check.triggered) {
    throw new CrisisError(`threshold not met — ${check.reason}`);
  }

  const entry: HansardEntry = {
    type: 'CONSTITUTIONAL_CRISIS',
    at,
    // The engine files this, not an actor: it is the mechanical consequence of
    // filings already attributed above, and attributing it to any participant
    // would misstate who caused it.
    actor: 'RECORD',
    role: 'OPERATOR',
    fields: {
      Basis: check.by_witness ? 'Witness Council' : 'OPERATOR supermajority',
      Filings: `${check.filed} of ${check.operators} OPERATOR actors`,
      Threshold: String(check.required),
      'Session status': 'SUSPENDED — resumption requires external review',
      Resolution: 'a human AUTHORITY above this node must review the Hansard and rule',
    },
    body:
      'The session is suspended. No further acts may be taken under a contested constitution. ' +
      'This record is immutable and survives dissolution of the session.',
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
        cause: 'CONSTITUTIONAL_CRISIS',
        since: at,
        record_ref: 'HANSARD.md',
        escalation_ref: null,
      },
    }),
  };
};

/* -------------------------------------------------------------------------- */
/* External review                                                             */
/* -------------------------------------------------------------------------- */

export type CrisisRuling = 'UPHELD' | 'DISMISSED';

export interface ExternalReviewInput {
  readonly at: string;
  /** The external reviewer — a human from outside this session. */
  readonly reviewer: string;
  /** The Speaker the crisis was filed against. */
  readonly accused: string;
  readonly ruling: CrisisRuling;
  readonly reasons: string;
  readonly state: SessionStateFile;
}

/**
 * Resolve a constitutional crisis by external review.
 *
 * The one rule that makes this mechanism worth anything: **the accused may not
 * rule on their own crisis.** A Speaker who could dismiss the filings against
 * themselves would convert the whole apparatus into a formality that launders
 * capture as due process.
 *
 * UPHELD keeps the session suspended — the finding is that the constitution is
 * compromised, and resuming under it is exactly what must not happen. Only
 * DISMISSED resumes.
 */
export const externalReview = (
  input: ExternalReviewInput,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (input.state.suspension?.cause !== 'CONSTITUTIONAL_CRISIS') {
    throw new CrisisError('this session is not in constitutional crisis');
  }
  if (input.reviewer === input.accused) {
    throw new CrisisError(
      `${input.reviewer} is the subject of this crisis and may not rule on it`,
    );
  }
  if (input.reasons.trim() === '') {
    throw new CrisisError('an external ruling must state its reasons');
  }

  const upheld = input.ruling === 'UPHELD';

  const entry: HansardEntry = {
    type: 'CONSTITUTIONAL_CRISIS_RULING',
    at: input.at,
    actor: input.reviewer,
    role: 'AUTHORITY',
    fields: {
      Ruling: input.ruling,
      Reviewer: `${input.reviewer} (external to this session)`,
      Accused: input.accused,
      'Session status': upheld
        ? 'SUSPENDED — the constitution is compromised; this proceeding does not resume'
        : 'CONVENED — filings dismissed, the sitting resumes',
    },
    body: input.reasons.trim(),
  };

  return {
    entry,
    hansard: appendEntry(hansard, entry),
    state: createState({
      session_guid: input.state.session_guid,
      protocol: input.state.protocol,
      state: upheld ? 'SUSPENDED' : 'CONVENED',
      quorum: input.state.quorum,
      hansard_head: input.state.hansard_head,
      updated_at: input.at,
      suspension: upheld
        ? {
            cause: 'CONSTITUTIONAL_CRISIS',
            since: input.state.suspension.since,
            record_ref: 'HANSARD.md',
            escalation_ref: null,
          }
        : null,
    }),
  };
};
