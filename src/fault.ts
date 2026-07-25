/**
 * Fault classification and auto-recovery.
 *
 * RUNTIME.md § Infrastructure Fault Classification states the problem exactly:
 * a failed action looks identical in the Hansard whether the agent made a bad
 * decision or a secret expired. Without attribution an innocent actor is
 * penalised — demotion triggers, performance record damaged — for something
 * entirely outside their control.
 *
 * So every failure is classified **before it touches the actor's record**, and
 * the classification decides both who is blamed and what happens next:
 *
 *   PATH_A — transient. Retry; no human needed.
 *   PATH_B — a human must fix it. Suspend and escalate.
 *   PATH_C — irrecoverable. Prorogue.
 *
 * ## On classifying from stderr
 *
 * The signals here are heuristics over vendor error text, and they will drift.
 * That is acceptable because of which way they fail: an unrecognised fault
 * classifies as `FAULT_AMBIGUOUS`, which does **not** penalise the actor and
 * routes to a human. The cost of being wrong is a Speaker reading an error
 * message; the cost of guessing confidently would be blaming an actor for an
 * outage.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { RECORD_TYPES, type HansardEntry } from './hansard.ts';
import type { SpawnResult } from './spawn.ts';

/* -------------------------------------------------------------------------- */
/* Taxonomy                                                                    */
/* -------------------------------------------------------------------------- */

export const FAULT_TYPES = [
  'FAULT_ACTOR',
  'FAULT_INFRA',
  'FAULT_EXTERNAL',
  'FAULT_AMBIGUOUS',
] as const;

export type FaultType = (typeof FAULT_TYPES)[number];

export type ResolutionPath = 'PATH_A' | 'PATH_B' | 'PATH_C';

export interface Classification {
  readonly fault_type: FaultType;
  readonly path: ResolutionPath;
  /** Does this count against the actor's record? */
  readonly actor_penalised: boolean;
  /** Signal that produced the classification, for the record. */
  readonly detail: string;
}

/* -------------------------------------------------------------------------- */
/* Recoverable signals                                                         */
/* -------------------------------------------------------------------------- */

export const AUTO_RECOVERABLE = ['rate_limit', 'transient_outage', 'timeout'] as const;

export type RecoverableKind = (typeof AUTO_RECOVERABLE)[number];

const SIGNALS: readonly { kind: RecoverableKind; pattern: RegExp }[] = Object.freeze([
  { kind: 'rate_limit', pattern: /rate.?limit|429|too many requests|quota exceeded|overloaded/i },
  { kind: 'transient_outage', pattern: /50[234]\b|service unavailable|bad gateway|temporarily unavailable|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i },
  { kind: 'timeout', pattern: /timed? ?out|deadline exceeded/i },
]);

/** Infrastructure faults a human must repair — no amount of retrying helps. */
const INFRA = /not found|no such secret|invalid credentials|unauthori[sz]ed|401|403|permission denied|authentication|no auth type/i;

/** Damage a session cannot recover from. */
const CRITICAL = /corrupt|force.?push|history (?:rewritten|destroyed)|data loss/i;

/**
 * Classify a failed turn.
 *
 * Order matters: critical damage is checked before anything else, and transient
 * signals before infrastructure ones, because a rate-limited request often also
 * mentions authentication in its error body.
 */
export const classify = (result: SpawnResult): Classification => {
  const text = `${result.stderr}\n${result.stdout}`.slice(0, 4000);

  if (CRITICAL.test(text)) {
    return {
      fault_type: 'FAULT_INFRA',
      path: 'PATH_C',
      actor_penalised: false,
      detail: 'irrecoverable damage reported',
    };
  }

  if (result.timed_out) {
    return {
      fault_type: 'FAULT_EXTERNAL',
      path: 'PATH_A',
      actor_penalised: false,
      detail: 'the agent exceeded its timeout',
    };
  }

  for (const { kind, pattern } of SIGNALS) {
    if (pattern.test(text)) {
      return {
        fault_type: 'FAULT_EXTERNAL',
        path: 'PATH_A',
        actor_penalised: false,
        detail: `transient: ${kind}`,
      };
    }
  }

  if (INFRA.test(text)) {
    return {
      fault_type: 'FAULT_INFRA',
      path: 'PATH_B',
      actor_penalised: false,
      detail: 'infrastructure or credentials require a human',
    };
  }

  // Unrecognised. Deliberately not FAULT_ACTOR: blaming an actor for an
  // unclassified failure is the exact injustice this module exists to prevent.
  return {
    fault_type: 'FAULT_AMBIGUOUS',
    path: 'PATH_B',
    actor_penalised: false,
    detail: 'cannot determine — escalated to the Speaker for a ruling',
  };
};

export const isAutoRecoverable = (c: Classification): boolean => c.path === 'PATH_A';

/* -------------------------------------------------------------------------- */
/* Retry policy                                                                */
/* -------------------------------------------------------------------------- */

export interface FaultHandling {
  readonly auto_retry_max: number;
  readonly auto_retry_delay_minutes: number;
  readonly auto_recoverable: readonly RecoverableKind[];
}

export const DEFAULT_FAULT_HANDLING: FaultHandling = Object.freeze({
  auto_retry_max: 3,
  auto_retry_delay_minutes: 5,
  auto_recoverable: AUTO_RECOVERABLE,
});

export interface RetryDecision {
  readonly retry: boolean;
  readonly attempt: number;
  readonly of: number;
  readonly delay_ms: number;
  readonly reason: string;
}

/**
 * Should this attempt be retried?
 *
 * `attempt` is 1-based and counts attempts already made.
 */
export const shouldRetry = (
  classification: Classification,
  attempt: number,
  policy: FaultHandling = DEFAULT_FAULT_HANDLING,
): RetryDecision => {
  const base = {
    attempt,
    of: policy.auto_retry_max,
    delay_ms: policy.auto_retry_delay_minutes * 60_000,
  };

  if (!isAutoRecoverable(classification)) {
    return { ...base, retry: false, delay_ms: 0, reason: `${classification.path} — not auto-recoverable` };
  }
  if (attempt >= policy.auto_retry_max) {
    // Exhausted retries escalate to PATH_B rather than failing silently: a
    // transient fault that never clears has become a human's problem.
    return { ...base, retry: false, delay_ms: 0, reason: `retries exhausted (${attempt}/${policy.auto_retry_max}) — escalating to PATH_B` };
  }
  return { ...base, retry: true, reason: `${classification.detail} — retrying` };
};

/* -------------------------------------------------------------------------- */
/* Records                                                                     */
/* -------------------------------------------------------------------------- */

export interface FaultRecordInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly action: string;
  readonly classification: Classification;
  readonly attempt?: number;
  readonly of?: number;
}

/** Record a fault, with its attribution and resolution path. */
export const faultRecord = (input: FaultRecordInput): HansardEntry => ({
  type:
    input.classification.path === 'PATH_C'
      ? RECORD_TYPES.SESSION_FAULT_CRITICAL
      : RECORD_TYPES.SESSION_FAULT,
  at: input.at,
  actor: input.actor,
  role: input.role,
  fields: {
    'Action attempted': input.action,
    'Fault type': input.classification.fault_type,
    'Fault detail': input.classification.detail,
    'Actor penalised': input.classification.actor_penalised
      ? 'Yes'
      : 'No — not the actor\'s fault',
    'Resolution path': input.classification.path,
    ...(input.attempt === undefined
      ? {}
      : { Attempt: `${input.attempt} of ${input.of ?? '?'}`, 'Auto retry': 'true' }),
  },
});

/** Record that a retry succeeded, so the fault does not read as unresolved. */
export const autoResolvedRecord = (
  at: string,
  actor: string,
  role: Role,
  attempts: number,
): HansardEntry => ({
  type: RECORD_TYPES.FAULT_RESOLVED_AUTO,
  at,
  actor,
  role,
  fields: {
    Resolution: `succeeded on attempt ${attempts}`,
    'Actor record': 'no penalty — the fault was transient',
    'Speaker intervention': 'none required',
  },
});
