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

  // Lock exists. It may belong to a live broadcaster, or to one that died.
  const existing = await readHolder(options.fs, path);

  if (existing !== null && isStale(existing, now, options.staleAfterMs ?? null)) {
    // Broadcaster bow-out: reclaim. Remove then re-create exclusively, so a
    // third agent racing the same reclamation still loses to whoever wins the
    // atomic create.
    await options.fs.remove(path);
    if (await options.fs.createExclusive(path, JSON.stringify(holder, null, 2))) {
      return { elected: true, holder };
    }
    return { elected: false, reason: 'DEFERRED', holder: await readHolder(options.fs, path) };
  }

  return { elected: false, reason: 'DEFERRED', holder: existing };
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

const readHolder = async (fs: LockFs, path: string): Promise<LockHolder | null> => {
  const raw = await fs.readFile(path);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as LockHolder;
  } catch {
    // An unreadable lockfile is treated as absent rather than as a permanent
    // block: a corrupt lock must not strand a constituency forever.
    return null;
  }
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
