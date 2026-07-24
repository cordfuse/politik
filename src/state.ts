/**
 * STATE.json — current session state.
 *
 * Schema is fixed by ADR-0003. One `state` field, CANON-valued; cause carried
 * separately. The RECORD agent is the sole writer; every actor reads this file
 * before every action, because a suspended session must stop agents at once.
 *
 * Note on representation: CANON codes are `STATE_*` (POLITIK-ARCHITECTURE.md
 * § Session States) while ADR-0003's JSON carries the bare form (`CONVENED`).
 * Both are the same five states. This module owns the mapping so the wire
 * format stays exactly as the ADR specifies.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import {
  isSuspensionCause,
  type State,
  type SuspensionCause,
} from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Wire form                                                                   */
/* -------------------------------------------------------------------------- */

/** The bare state values as written to STATE.json. */
export const SESSION_STATES = [
  'CONVENED',
  'SUSPENDED',
  'PROROGUED',
  'STALE',
  'INVALID',
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

export const isSessionState = (v: unknown): v is SessionState =>
  typeof v === 'string' && (SESSION_STATES as readonly string[]).includes(v);

/** CANON code -> STATE.json wire value. */
export const toSessionState = (state: State): SessionState =>
  state.replace(/^STATE_/, '') as SessionState;

/** STATE.json wire value -> CANON code. */
export const toCanonState = (state: SessionState): State =>
  `STATE_${state}` as State;

/**
 * Every state except CONVENED means stop. Agents check this before acting.
 */
export const halts = (state: SessionState): boolean => state !== 'CONVENED';

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

export const STATE_SCHEMA_VERSION = '1.0.0';

export interface Suspension {
  readonly cause: SuspensionCause;
  readonly since: string;
  /** Hansard anchor, e.g. `HANSARD.md#L482`. */
  readonly record_ref: string | null;
  /** Escalation file, e.g. `escalations/2026-04-08-001.md`. */
  readonly escalation_ref: string | null;
}

export interface QuorumState {
  readonly required: number;
  readonly present: number;
}

export interface SessionStateFile {
  readonly schema_version: string;
  readonly session_guid: string;
  readonly protocol: string;
  readonly state: SessionState;
  readonly suspension: Suspension | null;
  readonly quorum: QuorumState;
  /** Last Hansard commit this state reflects. Null before the first record. */
  readonly hansard_head: string | null;
  readonly updated_at: string;
  readonly updated_by: string;
}

/* -------------------------------------------------------------------------- */
/* Construction                                                                */
/* -------------------------------------------------------------------------- */

export interface CreateStateInput {
  readonly session_guid: string;
  readonly protocol: string;
  readonly state: SessionState;
  readonly quorum: QuorumState;
  readonly updated_at: string;
  readonly suspension?: Suspension | null;
  readonly hansard_head?: string | null;
  readonly updated_by?: string;
}

/**
 * Build a STATE.json document. `updated_by` defaults to RECORD, the only actor
 * constitutionally permitted to write this file.
 */
export const createState = (input: CreateStateInput): SessionStateFile => ({
  schema_version: STATE_SCHEMA_VERSION,
  session_guid: input.session_guid,
  protocol: input.protocol,
  state: input.state,
  suspension: input.suspension ?? null,
  quorum: input.quorum,
  hansard_head: input.hansard_head ?? null,
  updated_at: input.updated_at,
  updated_by: input.updated_by ?? 'RECORD',
});

/** Serialize for commit. Trailing newline so the file is diff-friendly. */
export const serializeState = (state: SessionStateFile): string =>
  `${JSON.stringify(state, null, 2)}\n`;

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface StateIssue {
  readonly field: string;
  readonly message: string;
}

/**
 * Check a STATE.json document for internal consistency.
 *
 * The invariant that matters: `suspension` is populated when and only when the
 * state is SUSPENDED. A SUSPENDED session with no cause is unresolvable, and a
 * cause attached to a running session is a contradiction.
 */
export const validateState = (state: SessionStateFile): readonly StateIssue[] => {
  const issues: StateIssue[] = [];

  if (!isSessionState(state.state)) {
    issues.push({ field: 'state', message: `not a CANON state: ${String(state.state)}` });
  }

  if (state.state === 'SUSPENDED') {
    if (state.suspension === null) {
      issues.push({
        field: 'suspension',
        message: 'must be populated when state is SUSPENDED',
      });
    } else if (!isSuspensionCause(state.suspension.cause)) {
      issues.push({
        field: 'suspension.cause',
        message: `not a CANON suspension cause: ${String(state.suspension.cause)}`,
      });
    }
  } else if (state.suspension !== null) {
    issues.push({
      field: 'suspension',
      message: `must be null unless state is SUSPENDED (state is ${state.state})`,
    });
  }

  if (state.quorum.present < 0 || state.quorum.required < 0) {
    issues.push({ field: 'quorum', message: 'counts must be non-negative' });
  }

  return issues;
};

/** Parse STATE.json text. Returns null when the document is unreadable. */
export const parseState = (source: string): SessionStateFile | null => {
  try {
    const raw: unknown = JSON.parse(source);
    if (typeof raw !== 'object' || raw === null) return null;
    return raw as SessionStateFile;
  } catch {
    return null;
  }
};
