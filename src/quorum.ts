/**
 * Quorum check.
 *
 * Quorum is the minimum number of actors for a valid Division
 * (RUNTIME.md § SESSION QUORUM, MINIMUM CAST AND SINGLE-PLAYER SESSIONS).
 * Two distinct gates live here and are frequently confused:
 *
 *  - **minimum_cast** — a Writ Drop gate. Are the required constituencies
 *    declared at all? Enforced by the Charter validator (ADR-0002 rule 3).
 *  - **quorum** — a runtime gate. Are enough actors *present right now* for a
 *    Division to be valid? That is this module.
 *
 * `quorum: 1` is a legitimate configuration, not a degenerate one: a
 * single-player session whose governance value is the audit trail and the
 * structured constraint rather than multi-agent debate.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Override                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A Speaker's explicit acknowledgement that the session proceeds with a
 * reduced cast. Always visible in the Hansard — it cannot be hidden.
 */
export interface QuorumOverride {
  readonly enabled: boolean;
  /** Required. A degraded session with no stated reason is not auditable. */
  readonly reason: string;
  /** Must be AUTHORITY. Nobody else can acknowledge a degraded session. */
  readonly acknowledged_by: Role;
}

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

export interface QuorumResult {
  /** May a Division proceed? */
  readonly met: boolean;
  readonly required: number;
  readonly present: number;
  /** True when quorum failed on the numbers but an override carried it. */
  readonly degraded: boolean;
  /** Populated when the check fails, or when an override is invalid. */
  readonly reason: string | null;
}

export interface QuorumInput {
  readonly required: number;
  /** Actors present and eligible to vote right now. */
  readonly present: number;
  readonly override?: QuorumOverride | null;
}

/* -------------------------------------------------------------------------- */
/* Check                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate quorum.
 *
 * An override that fails its own preconditions does **not** carry the session:
 * a malformed override is treated as no override at all, because a degraded
 * session that cannot be audited is worse than a halted one.
 */
export const checkQuorum = (input: QuorumInput): QuorumResult => {
  const { required, present } = input;

  if (present >= required) {
    return { met: true, required, present, degraded: false, reason: null };
  }

  const override = input.override ?? null;
  if (override === null || !override.enabled) {
    return {
      met: false,
      required,
      present,
      degraded: false,
      reason: `quorum not met: ${present} of ${required} actors present`,
    };
  }

  if (override.reason.trim() === '') {
    return {
      met: false,
      required,
      present,
      degraded: false,
      reason: 'quorum_override requires an explicit quorum_override_reason',
    };
  }

  if (override.acknowledged_by !== 'AUTHORITY') {
    return {
      met: false,
      required,
      present,
      degraded: false,
      reason: `quorum_override must be acknowledged by AUTHORITY, not ${override.acknowledged_by}`,
    };
  }

  return {
    met: true,
    required,
    present,
    degraded: true,
    reason: override.reason.trim(),
  };
};

/**
 * Render the Hansard fields for a quorum decision.
 *
 * A degraded session must be legible to any later reviewer, so the override
 * and its reason are recorded as fields rather than buried in prose.
 */
export const quorumFields = (result: QuorumResult): Record<string, string> => {
  const fields: Record<string, string> = {
    Quorum: result.met ? 'MET' : 'NOT MET',
    Required: String(result.required),
    Present: String(result.present),
  };
  if (result.degraded) {
    fields['Degraded'] = 'Yes — quorum_override acknowledged by AUTHORITY';
    fields['Override reason'] = result.reason ?? '';
  } else if (!result.met && result.reason !== null) {
    fields['Reason'] = result.reason;
  }
  return fields;
};
