/**
 * First-actor-per-constituency election.
 *
 * Implements the Self-Organization Protocol steps 4-5 and the
 * First-Actor-Per-Constituency Rule (POLITIK-ARCHITECTURE.md).
 *
 * ## Two mechanisms, deliberately not conflated
 *
 * The architecture describes contention at two scopes, and they are different
 * problems with different answers:
 *
 *  - **Local (this module):** "On a single machine with multiple agents —
 *    local mutex via lockfile." Several agents share a filesystem and would
 *    otherwise race to represent the same constituency. First to acquire the
 *    lock becomes the Constituency broadcaster; the rest defer.
 *
 *  - **Global (not this module):** "Slot claimed atomically via Hansard
 *    commit." Across machines, the Hansard is the arbiter — a commit either
 *    lands or it does not.
 *
 * Winning the local lock therefore grants the right to *attempt* a claim. It is
 * not the claim. A broadcaster that wins the mutex can still lose the Hansard
 * commit to an agent on another machine, and that is correct.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { type Role } from './canon.ts';
import { isEligible, type Envelope } from './envelope.ts';

/* -------------------------------------------------------------------------- */
/* Mutex                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The filesystem operations a lockfile mutex needs. Narrow by design so tests
 * can supply an in-memory double and so a caller may substitute a different
 * substrate.
 *
 * `createExclusive` MUST be atomic: it creates the file and fails if it already
 * exists, in one operation. On POSIX this is `open(2)` with `O_CREAT|O_EXCL`
 * (Node's `wx` flag). An implementation that checks-then-writes reintroduces
 * the race this module exists to prevent.
 */
export interface LockFs {
  /** Create exclusively. Resolves true on success, false if it already exists. */
  createExclusive(path: string, contents: string): Promise<boolean>;
  readFile(path: string): Promise<string | null>;
  remove(path: string): Promise<void>;
}

export interface LockHolder {
  readonly agent: string;
  readonly role: Role;
  readonly session_guid: string;
  readonly acquired_at: string;
}

export interface ElectionOptions {
  readonly fs: LockFs;
  /** Directory holding lockfiles. One per session+constituency. */
  readonly lockDir: string;
  /**
   * A lock older than this is treated as abandoned — the "broadcaster bow-out"
   * case where an agent died without releasing. Null disables reclamation.
   */
  readonly staleAfterMs?: number | null;
}

/** Lockfile path for a session/constituency pair. */
export const lockPath = (dir: string, sessionGuid: string, role: Role): string =>
  `${dir}/${sessionGuid}.${role}.lock`;

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export type ElectionOutcome =
  /** This agent is the Constituency broadcaster. It may attempt the Hansard claim. */
  | { readonly elected: true; readonly holder: LockHolder }
  /** Another agent on this machine holds the constituency. */
  | { readonly elected: false; readonly reason: 'DEFERRED'; readonly holder: LockHolder | null }
  /** This agent does not match the target constituency. */
  | { readonly elected: false; readonly reason: 'NOT_TARGETED' }
  /** The broadcast has no slots left. */
  | { readonly elected: false; readonly reason: 'NO_SLOTS' };

/* -------------------------------------------------------------------------- */
/* Election                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Stand for election as this constituency's broadcaster.
 *
 * Order matters: eligibility (steps 2-3) is checked before the lock is touched,
 * so an agent of the wrong constituency never contends for a mutex it has no
 * business holding.
 */
export const standForElection = async (
  envelope: Envelope,
  agent: string,
  role: Role,
  options: ElectionOptions,
  now: string,
): Promise<ElectionOutcome> => {
  if (envelope.target_actor !== role) {
    return { elected: false, reason: 'NOT_TARGETED' };
  }
  if (!isEligible(envelope, role)) {
    return { elected: false, reason: 'NO_SLOTS' };
  }

  const path = lockPath(options.lockDir, envelope.session_guid, role);
  const holder: LockHolder = {
    agent,
    role,
    session_guid: envelope.session_guid,
    acquired_at: now,
  };

  if (await options.fs.createExclusive(path, JSON.stringify(holder, null, 2))) {
    return { elected: true, holder };
  }

  // The lock exists. Three cases: a live broadcaster, one that died, or a
  // lockfile we cannot read at all.
  const existing = await inspectLock(options.fs, path);

  const reclaimable =
    // A lock nobody can parse must not strand the constituency permanently.
    existing.kind === 'CORRUPT' ||
    // The file vanished between our failed create and this read.
    existing.kind === 'ABSENT' ||
    (existing.kind === 'HELD' && isStale(existing.holder, now, options.staleAfterMs ?? null));

  if (reclaimable) {
    // Broadcaster bow-out: reclaim. Remove then re-create exclusively, so a
    // third agent racing the same reclamation still loses to whoever wins the
    // atomic create.
    await options.fs.remove(path);
    if (await options.fs.createExclusive(path, JSON.stringify(holder, null, 2))) {
      return { elected: true, holder };
    }
    const after = await inspectLock(options.fs, path);
    return {
      elected: false,
      reason: 'DEFERRED',
      holder: after.kind === 'HELD' ? after.holder : null,
    };
  }

  return {
    elected: false,
    reason: 'DEFERRED',
    holder: existing.kind === 'HELD' ? existing.holder : null,
  };
};

/**
 * Release the constituency lock — the explicit bow-out.
 *
 * Only the holding agent may release: an agent that releases a lock it does not
 * hold would hand the constituency to a third party mid-work. Returns false if
 * the lock is absent or held by someone else.
 */
export const bowOut = async (
  envelope: Envelope,
  agent: string,
  role: Role,
  options: ElectionOptions,
): Promise<boolean> => {
  const path = lockPath(options.lockDir, envelope.session_guid, role);
  const holder = await readHolder(options.fs, path);
  if (holder === null || holder.agent !== agent) return false;
  await options.fs.remove(path);
  return true;
};

/** Who currently holds this constituency, if anyone. */
export const currentHolder = async (
  envelope: Envelope,
  role: Role,
  options: ElectionOptions,
): Promise<LockHolder | null> =>
  readHolder(options.fs, lockPath(options.lockDir, envelope.session_guid, role));

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The three distinguishable states of a lockfile.
 *
 * ABSENT and CORRUPT must not collapse into one "null holder" value: a caller
 * that cannot tell them apart cannot tell "nobody holds this" from "somebody
 * holds this and I cannot read who", and the second case would otherwise block
 * the constituency permanently.
 */
type LockInspection =
  | { readonly kind: 'HELD'; readonly holder: LockHolder }
  | { readonly kind: 'ABSENT' }
  | { readonly kind: 'CORRUPT' };

const inspectLock = async (fs: LockFs, path: string): Promise<LockInspection> => {
  const raw = await fs.readFile(path);
  if (raw === null) return { kind: 'ABSENT' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { kind: 'CORRUPT' };
    const holder = parsed as LockHolder;
    if (typeof holder.agent !== 'string' || holder.agent === '') return { kind: 'CORRUPT' };
    return { kind: 'HELD', holder };
  } catch {
    return { kind: 'CORRUPT' };
  }
};

const readHolder = async (fs: LockFs, path: string): Promise<LockHolder | null> => {
  const inspection = await inspectLock(fs, path);
  return inspection.kind === 'HELD' ? inspection.holder : null;
};

const isStale = (
  holder: LockHolder,
  now: string,
  staleAfterMs: number | null,
): boolean => {
  if (staleAfterMs === null) return false;
  const acquired = Date.parse(holder.acquired_at);
  const current = Date.parse(now);
  if (Number.isNaN(acquired) || Number.isNaN(current)) return false;
  return current - acquired > staleAfterMs;
};
