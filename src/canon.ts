/**
 * CANON — the canonical primitive layer.
 *
 * The engine speaks these terms. Protocols translate them to industry
 * vocabulary; nothing below this layer knows what "Speaker" or "Sprint" means.
 *
 * This module is types and frozen constants only — no logic, no I/O. It is the
 * single source of truth for CANON in code, so that any drift from
 * POLITIK-ARCHITECTURE.md becomes a compile error rather than a runtime
 * surprise.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Trust level and mandate — not species. Any role except AUTHORITY may be held
 * by a human or a machine agent.
 */
export const ROLES = [
  'AUTHORITY',
  'DELEGATE',
  'OPERATOR',
  'MEMBER',
  'OBSERVER',
] as const;

export type Role = (typeof ROLES)[number];

/**
 * The one hard constitutional rule: AUTHORITY is always human. A Charter
 * declaring a machine as AUTHORITY is invalid and fails Writ Drop validation.
 */
export const HUMAN_ONLY_ROLES: readonly Role[] = Object.freeze(['AUTHORITY']);

/** Descending trust order. Index 0 is the highest trust tier. */
export const ROLE_PRECEDENCE: readonly Role[] = Object.freeze([
  'AUTHORITY',
  'DELEGATE',
  'OPERATOR',
  'MEMBER',
  'OBSERVER',
]);

/* -------------------------------------------------------------------------- */
/* Session primitives                                                          */
/* -------------------------------------------------------------------------- */

export const PRIMITIVES = [
  'SESSION',
  'PROCEEDING',
  'CHARTER',
  'RECORD',
  'MOTION',
  'DIVISION',
  'ESCALATION',
  'SUSPENSION',
  'QUORUM',
  'CONFLICT',
  'DEADLOCK',
] as const;

export type Primitive = (typeof PRIMITIVES)[number];

/* -------------------------------------------------------------------------- */
/* Verbs                                                                       */
/* -------------------------------------------------------------------------- */

export const VERBS = [
  'READ',
  'WRITE',
  'VOTE',
  'ASSENT',
  'ESCALATE',
  'PROMOTE',
  'DEMOTE',
  'HIRE',
  'FIRE',
  'SUSPEND',
  'EXPEL',
  'VETO',
  'SPAWN',
  'DISSOLVE',
  'EXIT',
] as const;

export type Verb = (typeof VERBS)[number];

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The five valid states of a proceeding. CONSTITUTIONAL_CRISIS is deliberately
 * absent — it is a *cause of suspension*, not a state (ADR-0003).
 */
export const STATES = [
  'STATE_CONVENED',
  'STATE_SUSPENDED',
  'STATE_PROROGUED',
  'STATE_STALE',
  'STATE_INVALID',
] as const;

export type State = (typeof STATES)[number];

/**
 * Why a proceeding was suspended. Carried alongside SUSPENDED. Enum is fixed by
 * ADR-0003 § Decision; DEADLOCK added per ADR-0004.
 *
 * Two deliberate absences:
 *  - CONFLICT is mechanical and routine — never a suspension cause.
 *  - Heartbeat expiry is its own CANON state (STALE), not a suspension cause,
 *    so that "a human paused it" stays distinguishable from "the agents went
 *    quiet".
 */
export const SUSPENSION_CAUSES = [
  'POINT_OF_ORDER',
  'SPEAKER_ORDER',
  'DISPUTED_EXIT',
  'CONSTITUTIONAL_CRISIS',
  'DEADLOCK',
] as const;

export type SuspensionCause = (typeof SUSPENSION_CAUSES)[number];

/* -------------------------------------------------------------------------- */
/* Merge strategy                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How a carried Motion is enacted on ASSENT. Declared in the Charter; Writ Drop
 * enforces the squash/fast_forward constraints (ADR-0002).
 */
export const MERGE_STRATEGIES = [
  'merge_commit',
  'squash',
  'fast_forward',
] as const;

export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

const includes = <T extends string>(
  haystack: readonly T[],
  value: unknown,
): value is T => typeof value === 'string' && (haystack as readonly string[]).includes(value);

export const isRole = (v: unknown): v is Role => includes(ROLES, v);
export const isPrimitive = (v: unknown): v is Primitive => includes(PRIMITIVES, v);
export const isVerb = (v: unknown): v is Verb => includes(VERBS, v);
export const isState = (v: unknown): v is State => includes(STATES, v);
export const isSuspensionCause = (v: unknown): v is SuspensionCause =>
  includes(SUSPENSION_CAUSES, v);
export const isMergeStrategy = (v: unknown): v is MergeStrategy =>
  includes(MERGE_STRATEGIES, v);

/** True if the role may only ever be held by a human actor. */
export const isHumanOnlyRole = (role: Role): boolean => HUMAN_ONLY_ROLES.includes(role);

/**
 * Compare two roles by trust. Returns a negative number if `a` outranks `b`,
 * positive if `b` outranks `a`, zero if equal.
 */
export const compareRoles = (a: Role, b: Role): number =>
  ROLE_PRECEDENCE.indexOf(a) - ROLE_PRECEDENCE.indexOf(b);
