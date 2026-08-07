/**
 * Prorogation — permanent close of a proceeding.
 *
 * Prorogued means the Hansard is sealed and the repo archived
 * (POLITIK-ARCHITECTURE.md § Session States). It is terminal: unlike a
 * SUSPENDED session, a prorogued one does not resume.
 *
 * Four triggers end a proceeding, first-one-wins (RUNTIME.md § Session
 * Termination Conditions):
 *
 *     TERMINATE if (motions   >= max_motions)   -> TRIGGER_TURNS
 *              OR (now        >= deadline)      -> TRIGGER_DEADLINE
 *              OR (total_cost >= max_cost_usd)  -> TRIGGER_COST
 *              OR (AUTHORITY issues DISSOLVE)   -> TRIGGER_SPEAKER
 *
 * The SESSION_TIMEOUT record "always names which condition triggered and the
 * state of all other conditions at that moment", so this module evaluates every
 * condition even once one has fired.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { appendEntry } from './hansard.ts';
import type { FileWrite } from './scm.ts';
import { createState, type SessionStateFile } from './state.ts';
import { seats } from './actors.ts';

/* -------------------------------------------------------------------------- */
/* Triggers                                                                    */
/* -------------------------------------------------------------------------- */

export const TRIGGERS = [
  'TRIGGER_TURNS',
  'TRIGGER_DEADLINE',
  'TRIGGER_COST',
  'TRIGGER_SPEAKER',
  'TRIGGER_LAST_STANDING',
] as const;

export type Trigger = (typeof TRIGGERS)[number];

/**
 * When a session ends on its own — the third protocol override point (ADR-0007).
 * `objective` (default) ends only on an explicit prorogation or a configured
 * ceiling. `last-standing` ends the moment one seated actor remains — the Battle
 * Royale terminal condition, checked after an elimination cull.
 */
export type TerminationPolicy = 'objective' | 'last-standing';

export const TERMINATION_POLICIES: readonly TerminationPolicy[] = Object.freeze([
  'objective',
  'last-standing',
]);

export const isTerminationPolicy = (v: unknown): v is TerminationPolicy =>
  typeof v === 'string' && (TERMINATION_POLICIES as readonly string[]).includes(v);

/**
 * Is the field down to a single survivor? Reads the seat register — AUTHORITY
 * holds no seat, so a lone Speaker never counts as the winner. Caller should
 * only consult this after an elimination actually occurred, so an as-yet-unseated
 * fresh session is not mistaken for a finished one.
 */
export const lastStanding = (hansard: string): { readonly terminate: boolean; readonly survivor: string | null } => {
  const remaining = seats(hansard);
  return remaining.length <= 1
    ? { terminate: true, survivor: remaining[0]?.actor ?? null }
    : { terminate: false, survivor: null };
};

/** Ceilings from the Charter. Null means the condition is not configured. */
export interface Ceilings {
  readonly max_motions: number | null;
  readonly deadline: string | null;
  readonly max_cost_usd: number | null;
  /** Speaker is warned before the cost ceiling — the low-fuel light. */
  readonly cost_warning_usd?: number | null;
}

/** Measured session totals at the moment of evaluation. */
export interface SessionTotals {
  readonly motions: number;
  readonly total_cost_usd: number;
  readonly now: string;
}

export interface ConditionState {
  readonly trigger: Trigger;
  /** False when the ceiling is not configured. */
  readonly configured: boolean;
  readonly fired: boolean;
  /** Human-readable current-vs-ceiling, for the SESSION_TIMEOUT record. */
  readonly detail: string;
}

export interface TerminationCheck {
  readonly terminate: boolean;
  /** The condition that fired first, in evaluation order. Null if none did. */
  readonly trigger: Trigger | null;
  /** Every condition's state at this moment, fired or not. */
  readonly conditions: readonly ConditionState[];
  /** True when cost has passed the warning line but not the ceiling. */
  readonly cost_warning: boolean;
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate all termination conditions.
 *
 * `dissolve` represents the AUTHORITY issuing the DISSOLVE verb; it is a
 * deliberate act rather than a measurement, so the caller supplies it.
 *
 * An unconfigured ceiling never fires. A session with no ceilings and no
 * DISSOLVE runs until something else stops it, which is a legitimate
 * configuration and not an error.
 */
export const checkTermination = (
  ceilings: Ceilings,
  totals: SessionTotals,
  dissolve = false,
): TerminationCheck => {
  const conditions: ConditionState[] = [];

  const turnsConfigured = ceilings.max_motions !== null;
  const turnsFired = turnsConfigured && totals.motions >= (ceilings.max_motions ?? 0);
  conditions.push({
    trigger: 'TRIGGER_TURNS',
    configured: turnsConfigured,
    fired: turnsFired,
    detail: turnsConfigured
      ? `${totals.motions} of ${ceilings.max_motions} motions`
      : 'not configured',
  });

  const deadlineConfigured = ceilings.deadline !== null;
  const deadlineMs = deadlineConfigured ? Date.parse(ceilings.deadline ?? '') : NaN;
  const nowMs = Date.parse(totals.now);
  const deadlineFired =
    deadlineConfigured &&
    !Number.isNaN(deadlineMs) &&
    !Number.isNaN(nowMs) &&
    nowMs >= deadlineMs;
  conditions.push({
    trigger: 'TRIGGER_DEADLINE',
    configured: deadlineConfigured,
    fired: deadlineFired,
    detail: deadlineConfigured ? `${totals.now} vs ${ceilings.deadline}` : 'not configured',
  });

  const costConfigured = ceilings.max_cost_usd !== null;
  const costFired = costConfigured && totals.total_cost_usd >= (ceilings.max_cost_usd ?? 0);
  conditions.push({
    trigger: 'TRIGGER_COST',
    configured: costConfigured,
    fired: costFired,
    detail: costConfigured
      ? `$${totals.total_cost_usd.toFixed(4)} of $${(ceilings.max_cost_usd ?? 0).toFixed(2)}`
      : 'not configured',
  });

  conditions.push({
    trigger: 'TRIGGER_SPEAKER',
    configured: true,
    fired: dissolve,
    detail: dissolve ? 'DISSOLVE issued by AUTHORITY' : 'no DISSOLVE issued',
  });

  const first = conditions.find((c) => c.fired) ?? null;

  const warning = ceilings.cost_warning_usd ?? null;
  const cost_warning =
    warning !== null && !costFired && totals.total_cost_usd >= warning;

  return {
    terminate: first !== null,
    trigger: first?.trigger ?? null,
    conditions,
    cost_warning,
  };
};

/* -------------------------------------------------------------------------- */
/* Prorogation                                                                 */
/* -------------------------------------------------------------------------- */

export class ProrogationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProrogationError';
  }
}

export interface ProrogationInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly trigger: Trigger;
  readonly state: SessionStateFile;
  /** All conditions at the moment of termination, for the record. */
  readonly check?: TerminationCheck;
  /** Decisions summary auto-committed back to the parent layer. */
  readonly summary?: string;
  /** Milestone to close, if the session used one. */
  readonly milestone_id?: string | null;
}

export interface ProrogationResult {
  readonly state: SessionStateFile;
  readonly files: readonly FileWrite[];
  readonly hansard: string;
  /** Milestone the caller must close via ScmProvider. Null if none. */
  readonly milestone_to_close: string | null;
}

/**
 * Prorogue a proceeding.
 *
 * Constraints enforced:
 *  - A TRIGGER_SPEAKER prorogation requires AUTHORITY. DISSOLVE is an
 *    AUTHORITY verb; the automatic triggers are the engine's and need no actor
 *    authority.
 *  - An already-prorogued session cannot be prorogued twice — the Hansard is
 *    sealed, and a second seal would be a post-seal write.
 *  - A session in CONSTITUTIONAL_CRISIS cannot be prorogued. RUNTIME.md is
 *    explicit that a crisis suspends rather than prorogues, precisely so a
 *    captured AUTHORITY cannot dissolve the session before evidence
 *    accumulates. The substrate must survive a premature dissolution.
 */
export const prorogue = (
  input: ProrogationInput,
  hansard: string,
): ProrogationResult => {
  if (input.state.state === 'PROROGUED') {
    throw new ProrogationError('session is already prorogued — the Hansard is sealed');
  }
  if (input.trigger === 'TRIGGER_SPEAKER' && input.role !== 'AUTHORITY') {
    throw new ProrogationError(
      `DISSOLVE is an AUTHORITY verb — ${input.actor} is ${input.role}`,
    );
  }
  if (input.state.suspension?.cause === 'CONSTITUTIONAL_CRISIS') {
    throw new ProrogationError(
      'a session in CONSTITUTIONAL_CRISIS cannot be prorogued — it suspends pending external review',
    );
  }

  const state = createState({
    session_guid: input.state.session_guid,
    protocol: input.state.protocol,
    state: 'PROROGUED',
    quorum: input.state.quorum,
    hansard_head: input.state.hansard_head,
    updated_at: input.at,
    suspension: null,
  });

  const fields: Record<string, string> = {
    Trigger: input.trigger,
    'Session status': 'PROROGUED — Hansard sealed',
  };

  // The record names every condition, not just the one that fired.
  for (const condition of input.check?.conditions ?? []) {
    fields[condition.trigger] = `${condition.fired ? 'FIRED' : 'not met'} — ${condition.detail}`;
  }

  const files: FileWrite[] = [];
  if (input.summary !== undefined && input.summary.trim() !== '') {
    files.push({
      path: 'SUMMARY.md',
      content: [
        '# SESSION SUMMARY',
        '',
        `**Session:** ${input.state.session_guid}`,
        `**Prorogued:** ${input.at}`,
        `**Trigger:** ${input.trigger}`,
        '',
        '---',
        '',
        input.summary.trim(),
        '',
      ].join('\n'),
    });
  }

  return {
    state,
    files,
    hansard: appendEntry(hansard, {
      type: 'SESSION_TIMEOUT',
      at: input.at,
      actor: input.actor,
      role: input.role,
      fields,
      body: input.summary?.trim(),
    }),
    milestone_to_close: input.milestone_id ?? null,
  };
};
