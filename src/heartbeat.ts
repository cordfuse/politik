/**
 * Heartbeat, staleness and resumption.
 *
 * A proceeding that goes quiet is not the same as one that was paused. RUNTIME
 * originally modelled both as `suspended: true`; ADR-0003 separated them,
 * because "a human stopped this" and "the agents went away" call for different
 * responses and a boolean cannot tell you which happened.
 *
 * So STALE is its own CANON state and carries no `suspension` — a stale session
 * has no cause to record, only an absence.
 *
 * The heartbeat is the **last Hansard commit**, not a liveness ping. Nothing
 * separate has to be running: if the record has not moved, nothing happened,
 * and a proceeding in which nothing happens is by definition not proceeding.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import { createState, type SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Staleness                                                                   */
/* -------------------------------------------------------------------------- */

export interface HeartbeatCheck {
  readonly stale: boolean;
  /** Last Hansard entry timestamp, or null for an empty record. */
  readonly last_beat: string | null;
  readonly hours_since: number | null;
  readonly timeout_hours: number;
  readonly reason: string;
}

/**
 * Has the proceeding gone quiet?
 *
 * `now` is supplied by the caller — this module reads no clock, so a check is
 * reproducible and a test does not have to wait four hours.
 *
 * A session with an empty Hansard is never stale: it has not gone quiet, it has
 * not started. Treating "no record yet" as staleness would suspend every
 * session at the moment of its Writ Drop.
 */
export const checkHeartbeat = (
  hansard: string,
  timeoutHours: number,
  now: string,
): HeartbeatCheck => {
  const entries = parseEntries(hansard);
  const last = entries.at(-1);

  if (last === undefined) {
    return {
      stale: false,
      last_beat: null,
      hours_since: null,
      timeout_hours: timeoutHours,
      reason: 'no Hansard entries yet — the proceeding has not started',
    };
  }

  const beat = Date.parse(last.at);
  const current = Date.parse(now);
  if (Number.isNaN(beat) || Number.isNaN(current)) {
    return {
      stale: false,
      last_beat: last.at,
      hours_since: null,
      timeout_hours: timeoutHours,
      reason: 'timestamps unreadable — declining to declare staleness on bad data',
    };
  }

  const hours = (current - beat) / 3_600_000;
  const stale = hours >= timeoutHours;

  return {
    stale,
    last_beat: last.at,
    hours_since: hours,
    timeout_hours: timeoutHours,
    reason: stale
      ? `no Hansard commit in ${hours.toFixed(1)}h (timeout ${timeoutHours}h)`
      : `last beat ${hours.toFixed(1)}h ago, within the ${timeoutHours}h window`,
  };
};

export class HeartbeatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeartbeatError';
  }
}

/**
 * Mark a quiet proceeding STALE.
 *
 * Suspends rather than dissolves (`stale_action: suspend`). Silence is not a
 * decision to end anything — the operator may simply have gone offline, and
 * dissolving on their behalf would destroy a resumable proceeding.
 *
 * Every actor reads STATE.json before acting, so agents stop as soon as this
 * commits. No separate stop signal is needed.
 */
export const markStale = (
  check: HeartbeatCheck,
  at: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (!check.stale) throw new HeartbeatError(`not stale — ${check.reason}`);
  if (state.state !== 'CONVENED') {
    throw new HeartbeatError(`only a CONVENED proceeding can go stale — this is ${state.state}`);
  }

  const entry: HansardEntry = {
    type: 'SESSION_STALE',
    at,
    actor: 'RECORD',
    role: 'OPERATOR',
    fields: {
      'Last beat': check.last_beat ?? 'none',
      Elapsed: check.hours_since === null ? 'unknown' : `${check.hours_since.toFixed(1)}h`,
      Timeout: `${check.timeout_hours}h`,
      'Session status': 'STALE — auto-suspended, resumable',
    },
    body: 'No Hansard commit within the heartbeat window. The proceeding is resumable: nothing is lost, and committed work stands.',
  };

  return {
    entry,
    hansard: appendEntry(hansard, entry),
    state: createState({
      session_guid: state.session_guid,
      protocol: state.protocol,
      // STALE is a state, not a suspension cause — hence no `suspension` here.
      state: 'STALE',
      quorum: state.quorum,
      hansard_head: state.hansard_head,
      updated_at: at,
    }),
  };
};

/* -------------------------------------------------------------------------- */
/* Snapshots                                                                   */
/* -------------------------------------------------------------------------- */

export interface Snapshot {
  readonly completed: readonly string[];
  readonly in_flight: readonly string[];
  readonly pending: readonly string[];
  readonly blocked: readonly string[];
  readonly cost_usd: number;
  readonly max_cost_usd: number | null;
  readonly motions: number;
  readonly max_motions: number | null;
}

/**
 * Sections inside an entry body use H3.
 *
 * ADR-0005 ruling 1 reserves H2 for entry delimiters. A body that used H2 would
 * split its own entry in two when the record is read back — which is exactly
 * what happened before this was fixed.
 */
const section = (title: string, items: readonly string[]): string[] =>
  items.length === 0 ? [] : [`### ${title}`, '', ...items.map((i) => `- ${i}`), ''];

/**
 * Commit a STATE_SNAPSHOT — a complete picture of where the proceeding stands.
 *
 * This is what makes a proceeding survivable. Agents are stateless and
 * disposable; the snapshot is what a *new* agent is given so it can continue
 * work it never started. The Hansard is the session, not the agent process.
 */
export const snapshot = (
  data: Snapshot,
  at: string,
  state: SessionStateFile,
  hansard: string,
): { readonly entry: HansardEntry; readonly hansard: string } => {
  const body = [
    ...section('Completed', data.completed),
    ...section('In flight', data.in_flight),
    ...section('Pending', data.pending),
    ...section('Blocked', data.blocked),
    '### Cost at snapshot',
    '',
    `- Spent: $${data.cost_usd.toFixed(4)}${
      data.max_cost_usd === null ? '' : ` of $${data.max_cost_usd.toFixed(2)} ceiling`
    }`,
    `- Motions: ${data.motions}${data.max_motions === null ? '' : ` of ${data.max_motions}`}`,
  ].join('\n');

  const entry: HansardEntry = {
    type: 'STATE_SNAPSHOT',
    at,
    actor: 'RECORD',
    role: 'OPERATOR',
    fields: {
      Completed: String(data.completed.length),
      'In flight': String(data.in_flight.length),
      Pending: String(data.pending.length),
      Blocked: String(data.blocked.length),
      Spent: `$${data.cost_usd.toFixed(4)}`,
    },
    body,
  };

  return { entry, hansard: appendEntry(hansard, entry) };
};

/** The most recent STATE_SNAPSHOT, as raw markdown. Null if none exists. */
export const lastSnapshot = (hansard: string): string | null => {
  const blocks = hansard.split(/^## /m).slice(1);
  const snapshots = blocks.filter((b) => b.includes('— STATE_SNAPSHOT'));
  const latest = snapshots.at(-1);
  return latest === undefined ? null : `## ${latest.trim()}`;
};

/* -------------------------------------------------------------------------- */
/* Resume                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resume a stale proceeding.
 *
 * Only STALE resumes this way. A SUSPENDED session was stopped by a decision —
 * a Point of Order, a Speaker order, a constitutional crisis — and each of
 * those has its own resolution path. Letting `resume` lift them would route
 * around the governance that stopped the session in the first place, which is
 * the single most dangerous shortcut this codebase could offer.
 */
export const resume = (
  at: string,
  actor: string,
  state: SessionStateFile,
  hansard: string,
): {
  readonly entry: HansardEntry;
  readonly hansard: string;
  readonly state: SessionStateFile;
} => {
  if (state.state !== 'STALE') {
    throw new HeartbeatError(
      state.state === 'SUSPENDED'
        ? `this proceeding was suspended (${state.suspension?.cause ?? 'unknown cause'}) — resolve that, do not resume around it`
        : `only a STALE proceeding can be resumed — this is ${state.state}`,
    );
  }

  const entry: HansardEntry = {
    type: 'SESSION_RESUMED',
    at,
    actor,
    role: 'AUTHORITY',
    fields: {
      'Session status': 'CONVENED — the sitting resumes',
      'Resumed from': lastSnapshot(hansard) === null ? 'the Hansard' : 'the last STATE_SNAPSHOT',
    },
    body: 'Agents are stateless; the record is the context. Committed work stands.',
  };

  return {
    entry,
    hansard: appendEntry(hansard, entry),
    state: createState({
      session_guid: state.session_guid,
      protocol: state.protocol,
      state: 'CONVENED',
      quorum: state.quorum,
      hansard_head: state.hansard_head,
      updated_at: at,
    }),
  };
};
