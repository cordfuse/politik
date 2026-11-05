/**
 * Shared sessions across machines (ADR-0011): the git plumbing.
 *
 * A session becomes shared by configuring a git remote and turning on sync. The
 * configuration is per-clone git config — it describes this machine, not the
 * proceeding — so nothing here touches the session's files:
 *
 *   politik.sync    true when this clone syncs with a remote
 *   politik.remote  the remote's name (default: origin)
 *   politik.branch  the branch the record lives on
 *   politik.handle  the seat handle of the person operating this clone
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { spawn } from 'node:child_process';

export interface GitResult { readonly code: number; readonly out: string; readonly err: string }

/** Run git, capturing stdout and stderr, optionally feeding stdin. */
export const gitx = (cwd: string, args: readonly string[], input?: string): Promise<GitResult> =>
  new Promise((resolve) => {
    // stdin is only a pipe when there is input to feed; otherwise git gets none,
    // so a git that exits early can never fault us with EPIPE.
    const child = spawn('git', [...args], {
      cwd, shell: false, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? 1, out: out.trim(), err: err.trim() }));
    child.on('error', () => resolve({ code: 1, out: '', err: 'git unavailable' }));
    if (input !== undefined && child.stdin !== null) {
      child.stdin.on('error', () => { /* git exited before reading; its exit code reports it */ });
      child.stdin.end(input);
    }
  });

const config = async (dir: string, key: string): Promise<string | null> => {
  const r = await gitx(dir, ['config', '--get', key]);
  return r.code === 0 && r.out !== '' ? r.out : null;
};

export interface SyncConfig {
  readonly remote: string;
  readonly branch: string;
  /** The seat handle of the person operating this clone, if known. */
  readonly handle: string | null;
}

/** This clone's sync configuration, or null when the session is not shared. */
export const syncConfig = async (dir: string): Promise<SyncConfig | null> => {
  if ((await config(dir, 'politik.sync')) !== 'true') return null;
  const remote = (await config(dir, 'politik.remote')) ?? 'origin';
  const branch = (await config(dir, 'politik.branch')) ?? (await currentBranch(dir)) ?? 'main';
  return { remote, branch, handle: await operatorHandle(dir) };
};

/** The seat handle for this clone: politik.handle, else git user.name. */
export const operatorHandle = async (dir: string): Promise<string | null> =>
  (await config(dir, 'politik.handle')) ?? (await config(dir, 'user.name'));

/** `Name <email>` of the person operating this clone, for the provenance trailer. */
export const operatorIdentity = async (dir: string): Promise<string | null> => {
  const name = await config(dir, 'user.name');
  const email = await config(dir, 'user.email');
  if (name === null && email === null) return null;
  return [name, email === null ? null : `<${email}>`].filter((p) => p !== null).join(' ');
};

export const currentBranch = async (dir: string): Promise<string | null> => {
  const r = await gitx(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.code === 0 && r.out !== '' && r.out !== 'HEAD' ? r.out : null;
};

export const headSha = async (dir: string): Promise<string | null> => {
  const r = await gitx(dir, ['rev-parse', 'HEAD']);
  return r.code === 0 ? r.out : null;
};

export const isRepo = async (dir: string): Promise<boolean> =>
  (await gitx(dir, ['rev-parse', '--is-inside-work-tree'])).code === 0;

/**
 * Turn sharing on: point the remote at `url`, record the configuration, and
 * publish the current history. Reverts the configuration if publishing fails, so
 * a half-configured clone never believes it is shared.
 */
export const enableSync = async (
  dir: string,
  url: string,
  opts: { readonly remote?: string; readonly handle?: string | null } = {},
): Promise<{ readonly ok: boolean; readonly message: string }> => {
  if (!(await isRepo(dir))) return { ok: false, message: `${dir} is not a git repository — convene the session (politik init) first` };
  const branch = await currentBranch(dir);
  if (branch === null) return { ok: false, message: 'not on a branch — check out the branch the record lives on' };
  const remote = opts.remote ?? 'origin';
  const existing = await gitx(dir, ['remote', 'get-url', remote]);
  const set = existing.code === 0
    ? await gitx(dir, ['remote', 'set-url', remote, url])
    : await gitx(dir, ['remote', 'add', remote, url]);
  if (set.code !== 0) return { ok: false, message: `could not set remote ${remote}: ${set.err}` };

  const published = await gitx(dir, ['push', '--set-upstream', remote, `HEAD:refs/heads/${branch}`]);
  if (published.code !== 0) {
    return { ok: false, message: `could not publish to ${url}: ${firstLine(published.err)}` };
  }
  await gitx(dir, ['config', 'politik.sync', 'true']);
  await gitx(dir, ['config', 'politik.remote', remote]);
  await gitx(dir, ['config', 'politik.branch', branch]);
  if (opts.handle !== undefined && opts.handle !== null) await gitx(dir, ['config', 'politik.handle', opts.handle]);
  return { ok: true, message: `shared via ${remote} (${url}) on branch ${branch}` };
};

/** Configure sync on a fresh clone made by `politik join`. */
export const configureClone = async (dir: string, handle: string | null): Promise<SyncConfig | null> => {
  const branch = await currentBranch(dir);
  if (branch === null) return null;
  // Acts commit under this clone's git identity. A machine with none configured
  // gets the seat handle, the same convention Writ Drop uses for the Speaker.
  if (handle !== null && (await config(dir, 'user.name')) === null) {
    await gitx(dir, ['config', 'user.name', handle]);
    await gitx(dir, ['config', 'user.email', `${handle}@politik.local`]);
  }
  await gitx(dir, ['config', 'politik.sync', 'true']);
  await gitx(dir, ['config', 'politik.remote', 'origin']);
  await gitx(dir, ['config', 'politik.branch', branch]);
  if (handle !== null) await gitx(dir, ['config', 'politik.handle', handle]);
  return syncConfig(dir);
};

export const disableSync = async (dir: string): Promise<void> => {
  await gitx(dir, ['config', '--unset', 'politik.sync']);
};

const firstLine = (s: string): string => s.split('\n').find((l) => l.trim() !== '')?.trim() ?? s;

/** Fetch the record's branches and the shared pending acts. */
export const fetchRemote = async (
  dir: string,
  cfg: SyncConfig,
): Promise<{ readonly ok: boolean; readonly reason: string }> => {
  const r = await gitx(dir, [
    'fetch', '--quiet', '--prune', cfg.remote,
    `+refs/heads/*:refs/remotes/${cfg.remote}/*`,
    `+${PENDING_REF_ROOT}*:${PENDING_REF_ROOT}*`,
  ]);
  return r.code === 0 ? { ok: true, reason: 'fetched' } : { ok: false, reason: firstLine(r.err) };
};

export type FastForward = 'up-to-date' | 'fast-forwarded' | 'ahead' | 'diverged' | 'no-remote-branch' | 'blocked';

/** Bring the local record up to the shared one, without ever merging. */
export const fastForward = async (dir: string, cfg: SyncConfig): Promise<FastForward> => {
  const remoteRef = `refs/remotes/${cfg.remote}/${cfg.branch}`;
  if ((await gitx(dir, ['rev-parse', '--verify', '--quiet', remoteRef])).code !== 0) return 'no-remote-branch';
  const counts = await gitx(dir, ['rev-list', '--left-right', '--count', `HEAD...${remoteRef}`]);
  const [ahead, behind] = counts.out.split(/\s+/).map(Number);
  if (ahead === undefined || behind === undefined || Number.isNaN(ahead) || Number.isNaN(behind)) return 'blocked';
  if (ahead === 0 && behind === 0) return 'up-to-date';
  if (ahead > 0 && behind > 0) return 'diverged';
  if (ahead > 0) return 'ahead';
  const ff = await gitx(dir, ['merge', '--ff-only', '--quiet', remoteRef]);
  return ff.code === 0 ? 'fast-forwarded' : 'blocked';
};

/** Push the record. `rejected` means someone else pushed first. */
export const pushRecord = async (
  dir: string,
  cfg: SyncConfig,
): Promise<{ readonly ok: boolean; readonly rejected: boolean; readonly reason: string }> => {
  const r = await gitx(dir, ['push', '--porcelain', cfg.remote, `HEAD:refs/heads/${cfg.branch}`]);
  if (r.code === 0) return { ok: true, rejected: false, reason: 'pushed' };
  const text = `${r.out}\n${r.err}`;
  const rejected = /\[rejected\]|non-fast-forward|fetch first|\(stale info\)/.test(text);
  return { ok: false, rejected, reason: firstLine(r.err || r.out) };
};

/**
 * Discard local commits made since `sha`, keeping unrelated uncommitted work.
 * `--keep` refuses rather than destroy local changes that would be overwritten.
 */
export const discardTo = async (dir: string, sha: string): Promise<boolean> =>
  (await gitx(dir, ['reset', '--keep', sha])).code === 0;

/**
 * `politik sync`: reconcile the local record with the shared one. Rebases only
 * when the two have genuinely diverged, and aborts cleanly on conflict.
 */
export const syncNow = async (
  dir: string,
  cfg: SyncConfig,
): Promise<{ readonly ok: boolean; readonly message: string }> => {
  const f = await fetchRemote(dir, cfg);
  if (!f.ok) return { ok: false, message: `cannot reach ${cfg.remote}: ${f.reason}` };
  let state = await fastForward(dir, cfg);
  if (state === 'diverged') {
    const rebase = await gitx(dir, ['rebase', `refs/remotes/${cfg.remote}/${cfg.branch}`]);
    if (rebase.code !== 0) {
      await gitx(dir, ['rebase', '--abort']);
      return {
        ok: false,
        message: 'the local and shared records have diverged and cannot be replayed automatically. '
          + 'Inspect with `git log --oneline --graph --all` and resolve by hand.',
      };
    }
    state = 'ahead';
  }
  if (state === 'blocked') return { ok: false, message: 'could not fast-forward — uncommitted changes conflict with the shared record' };
  if (state === 'ahead' || state === 'no-remote-branch') {
    const p = await pushRecord(dir, cfg);
    if (!p.ok) return { ok: false, message: `could not push: ${p.reason}` };
    return { ok: true, message: 'local acts shared' };
  }
  return { ok: true, message: state === 'fast-forwarded' ? 'brought up to date' : 'already up to date' };
};

/* -------------------------------------------------------------------------- */
/* Shared pending acts (ADR-0011 §4)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Root of the refs holding staged acts. Each is `<root><session-guid>/<id>`,
 * pointing at a commit whose tree holds `pending.json`. These refs travel with
 * the session but are never on its branch: nothing staged is the record.
 */
export const PENDING_REF_ROOT = 'refs/politik/pending/';

const pendingRef = (guid: string, id: string): string => `${PENDING_REF_ROOT}${guid}/${id}`;

export const writePendingRef = async (
  dir: string,
  cfg: SyncConfig,
  guid: string,
  id: string,
  json: string,
): Promise<{ readonly ok: boolean; readonly reason: string }> => {
  const blob = await gitx(dir, ['hash-object', '-w', '--stdin'], json);
  if (blob.code !== 0) return { ok: false, reason: blob.err };
  const tree = await gitx(dir, ['mktree'], `100644 blob ${blob.out}\tpending.json\n`);
  if (tree.code !== 0) return { ok: false, reason: tree.err };
  const commit = await gitx(dir, ['commit-tree', tree.out, '-m', `pending ${id}`]);
  if (commit.code !== 0) return { ok: false, reason: commit.err };
  const ref = pendingRef(guid, id);
  const upd = await gitx(dir, ['update-ref', ref, commit.out]);
  if (upd.code !== 0) return { ok: false, reason: upd.err };
  const push = await gitx(dir, ['push', '--quiet', cfg.remote, `${ref}:${ref}`]);
  if (push.code !== 0) {
    await gitx(dir, ['update-ref', '-d', ref]);
    return { ok: false, reason: firstLine(push.err) };
  }
  return { ok: true, reason: 'shared' };
};

/** The JSON of every staged act for this session, from the local refs. */
export const readPendingRefs = async (dir: string, guid: string): Promise<readonly string[]> => {
  const refs = await gitx(dir, ['for-each-ref', '--format=%(refname)', `${PENDING_REF_ROOT}${guid}/`]);
  if (refs.code !== 0 || refs.out === '') return [];
  const out: string[] = [];
  for (const ref of refs.out.split('\n')) {
    const show = await gitx(dir, ['show', `${ref}:pending.json`]);
    if (show.code === 0) out.push(show.out);
  }
  return out;
};

export const deletePendingRef = async (dir: string, cfg: SyncConfig, guid: string, id: string): Promise<void> => {
  const ref = pendingRef(guid, id);
  await gitx(dir, ['update-ref', '-d', ref]);
  await gitx(dir, ['push', '--quiet', cfg.remote, `:${ref}`]);
};
