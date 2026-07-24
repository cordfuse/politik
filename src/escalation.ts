/**
 * Point of Order — escalation workflow.
 *
 * The flow (RUNTIME.md § POINT OF ORDER — ESCALATION FLOW):
 *
 *     Agent hits a decision requiring human judgement
 *       -> commits escalation to escalations/[timestamp].md
 *       -> Speaker notified
 *       -> session pauses
 *       -> Speaker commits ruling
 *       -> session resumes
 *       -> ruling recorded permanently in Hansard
 *
 * Pure, like the initializer: this module produces the files and the next state,
 * and the caller commits them. Notification is the caller's job too — it is an
 * ScmProvider concern, and keeping it out means the workflow can be exercised
 * with no network.
 *
 * Note on vocabulary: RUNTIME.md predates ADR-0003 and describes the pause as
 * `STATE.json → paused: true`. ADR-0003 supersedes that mapping: the session
 * becomes SUSPENDED with `suspension.cause: POINT_OF_ORDER`. This module
 * implements the ADR.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { RECORD_TYPES, appendEntry, type HansardEntry } from './hansard.ts';
import type { FileWrite } from './scm.ts';
import { createState, type SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Filing                                                                      */
/* -------------------------------------------------------------------------- */

export interface EscalationInput {
  /** Sequence number within the session. Determines the ruling filename. */
  readonly sequence: number;
  /** ISO-8601 UTC. Also forms the escalation filename. */
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly title: string;
  /** What decision requires human judgement, and why the agent cannot make it. */
  readonly body: string;
  /** Current state, which the escalation suspends. */
  readonly state: SessionStateFile;
}

export interface EscalationResult {
  readonly escalation_path: string;
  /** Where the Speaker must commit their ruling. */
  readonly ruling_path: string;
  /** SUSPENDED, cause POINT_OF_ORDER. */
  readonly state: SessionStateFile;
  readonly files: readonly FileWrite[];
  readonly hansard_entry: HansardEntry;
  /** Message body for the Speaker notification. The caller delivers it. */
  readonly notification: string;
}

/** Filename-safe form of an ISO timestamp. */
const stamp = (at: string): string => at.replace(/[:]/g, '').replace(/\.\d+Z$/, 'Z');

export const escalationPath = (at: string): string => `escalations/${stamp(at)}.md`;
export const rulingPath = (sequence: number): string =>
  `escalations/ruling-${String(sequence).padStart(3, '0')}.md`;

/**
 * File a Point of Order.
 *
 * Suspends the session. Every actor reads STATE.json before acting, so agents
 * halt as soon as this state is committed — the pause is a consequence of the
 * record, not a separate mechanism.
 */
export const fileEscalation = (
  input: EscalationInput,
  hansard: string,
): EscalationResult & { readonly hansard: string } => {
  const escalation_path = escalationPath(input.at);
  const ruling_path = rulingPath(input.sequence);

  const document = [
    `# POINT OF ORDER — ${input.title}`,
    '',
    `**Filed by:** ${input.actor} (${input.role})`,
    `**Filed at:** ${input.at}`,
    `**Ruling expected at:** ${ruling_path}`,
    '',
    '---',
    '',
    input.body.trim(),
    '',
  ].join('\n');

  const state = createState({
    session_guid: input.state.session_guid,
    protocol: input.state.protocol,
    state: 'SUSPENDED',
    quorum: input.state.quorum,
    hansard_head: input.state.hansard_head,
    updated_at: input.at,
    suspension: {
      cause: 'POINT_OF_ORDER',
      since: input.at,
      record_ref: escalation_path,
      escalation_ref: escalation_path,
    },
  });

  const hansard_entry: HansardEntry = {
    type: 'POINT_OF_ORDER',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Escalation: escalation_path,
      'Ruling expected': ruling_path,
      'Session status': 'SUSPENDED — awaiting Speaker ruling',
    },
    body: input.title,
  };

  const notification = [
    'A Point of Order has been raised.',
    '',
    `Filed by: ${input.actor} (${input.role})`,
    `Subject:  ${input.title}`,
    '',
    input.body.trim(),
    '',
    `Commit your ruling to: ${ruling_path}`,
    'Session is paused pending your response.',
  ].join('\n');

  return {
    escalation_path,
    ruling_path,
    state,
    files: [{ path: escalation_path, content: document }],
    hansard_entry,
    notification,
    hansard: appendEntry(hansard, hansard_entry),
  };
};

/* -------------------------------------------------------------------------- */
/* Ruling                                                                      */
/* -------------------------------------------------------------------------- */

export type RulingOutcome = 'UPHELD' | 'REVERSED' | 'NOTED';

export interface RulingInput {
  readonly sequence: number;
  readonly at: string;
  /** The Speaker. Only AUTHORITY may rule. */
  readonly actor: string;
  readonly role: Role;
  readonly outcome: RulingOutcome;
  readonly body: string;
  /** The escalation being ruled on. */
  readonly escalation_path: string;
  /** The suspended state this ruling lifts. */
  readonly state: SessionStateFile;
}

export class RulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulingError';
  }
}

export interface RulingResult {
  readonly ruling_path: string;
  /** CONVENED — the suspension is lifted. */
  readonly state: SessionStateFile;
  readonly files: readonly FileWrite[];
  readonly hansard: string;
}

/**
 * Commit a Speaker's ruling and resume the session.
 *
 * Two constitutional constraints are enforced rather than assumed:
 *  - Only AUTHORITY may rule. A Point of Order exists precisely because a
 *    machine could not make the call; letting a non-Speaker resolve it would
 *    defeat the mechanism.
 *  - The session must actually be suspended for a Point of Order. Resuming a
 *    session suspended by a *different* cause would silently discard that cause.
 */
export const commitRuling = (input: RulingInput, hansard: string): RulingResult => {
  if (input.role !== 'AUTHORITY') {
    throw new RulingError(
      `only AUTHORITY may rule on a Point of Order — ${input.actor} is ${input.role}`,
    );
  }
  if (input.state.state !== 'SUSPENDED') {
    throw new RulingError(
      `cannot rule on a session in state ${input.state.state} — expected SUSPENDED`,
    );
  }
  if (input.state.suspension?.cause !== 'POINT_OF_ORDER') {
    throw new RulingError(
      `session is suspended for ${input.state.suspension?.cause ?? 'an unknown cause'}, not POINT_OF_ORDER`,
    );
  }

  const ruling_path = rulingPath(input.sequence);

  const document = [
    `# RULING ${String(input.sequence).padStart(3, '0')} — ${input.outcome}`,
    '',
    `**Ruled by:** ${input.actor} (AUTHORITY)`,
    `**Ruled at:** ${input.at}`,
    `**Escalation:** ${input.escalation_path}`,
    '',
    '---',
    '',
    input.body.trim(),
    '',
  ].join('\n');

  const state = createState({
    session_guid: input.state.session_guid,
    protocol: input.state.protocol,
    state: 'CONVENED',
    quorum: input.state.quorum,
    hansard_head: input.state.hansard_head,
    updated_at: input.at,
    suspension: null,
  });

  return {
    ruling_path,
    state,
    files: [{ path: ruling_path, content: document }],
    hansard: appendEntry(hansard, {
      type: 'RULING',
      at: input.at,
      actor: input.actor,
      role: 'AUTHORITY',
      fields: {
        Outcome: input.outcome,
        Ruling: ruling_path,
        Escalation: input.escalation_path,
        'Session status': 'CONVENED — proceeding resumes',
      },
      body: input.body.trim(),
    }),
  };
};

/* -------------------------------------------------------------------------- */
/* Fault records                                                               */
/* -------------------------------------------------------------------------- */

export interface FaultInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly action_attempted: string;
  readonly fault_type: string;
  readonly fault_detail: string;
  readonly actor_penalised: boolean;
  readonly resolution_path: 'PATH_A' | 'PATH_B' | 'PATH_C';
}

/**
 * Render a SESSION_FAULT record in the shape RUNTIME.md specifies.
 * Critical faults (PATH_C) use the SESSION_FAULT_CRITICAL type.
 */
export const faultEntry = (input: FaultInput): HansardEntry => ({
  type:
    input.resolution_path === 'PATH_C'
      ? RECORD_TYPES.SESSION_FAULT_CRITICAL
      : RECORD_TYPES.SESSION_FAULT,
  at: input.at,
  actor: input.actor,
  role: input.role,
  fields: {
    'Action attempted': input.action_attempted,
    'Fault type': input.fault_type,
    'Fault detail': input.fault_detail,
    'Actor penalised': input.actor_penalised
      ? 'Yes'
      : 'No — infrastructure fault, actor blameless',
    'Resolution path': input.resolution_path,
  },
});
