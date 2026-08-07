/**
 * Committing the record.
 *
 * The Hansard is the session, and this framework's own Standing Orders tell
 * every actor "commit your result; uncommitted work does not exist". That rule
 * binds the engine too: a governance act written to a file but never committed
 * has, by the framework's own definition, not happened.
 *
 * On a GitHub-backed session `ScmProvider.commit()` lands these writes. Local
 * sessions had no equivalent, so the Division and Assent cycle sat dirty in the
 * working tree — a record that did not exist. This module closes that gap.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CommitResult {
  readonly committed: boolean;
  /** Populated when a commit was made. */
  readonly sha: string | null;
  readonly reason: string;
}

const git = (
  dir: string,
  args: readonly string[],
  spawnFn: typeof spawn,
): Promise<{ code: number; out: string }> =>
  new Promise((resolve) => {
    const child = spawnFn('git', [...args], {
      cwd: dir,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (c: Buffer) => {
      output += c.toString();
    });
    child.on('close', (code) => resolve({ code: code ?? 1, out: output.trim() }));
    child.on('error', () => resolve({ code: 1, out: '' }));
  });

/**
 * Commit the session record.
 *
 * Deliberately narrow: only the files named are staged. A governance command
 * must never sweep up whatever else happens to be dirty in the working tree —
 * an actor's half-finished work is not part of the record of a Division, and
 * committing it under the Speaker's name would misattribute it.
 *
 * Silent no-ops rather than failures when the directory is not a git
 * repository: a session can legitimately be exercised outside git (tests,
 * dry runs), and the caller decides whether that matters.
 */
export const commitRecord = async (
  dir: string,
  message: string,
  paths: readonly string[] = ['HANSARD.md', 'STATE.json'],
  spawnFn: typeof spawn = spawn,
): Promise<CommitResult> => {
  const isRepo = await git(dir, ['rev-parse', '--is-inside-work-tree'], spawnFn);
  if (isRepo.code !== 0) {
    return { committed: false, sha: null, reason: 'not a git repository' };
  }

  // `git add` fails outright if any pathspec matches nothing, which would mean
  // a session that has not yet written STATE.json commits nothing at all.
  // Filter to what exists so one absent file cannot suppress the whole record.
  const present: string[] = [];
  for (const path of paths) {
    if (existsSync(join(dir, path))) present.push(path);
  }
  if (present.length === 0) {
    return { committed: false, sha: null, reason: 'no record files present' };
  }

  const add = await git(dir, ['add', '--', ...present], spawnFn);
  if (add.code !== 0) {
    return { committed: false, sha: null, reason: 'nothing to stage' };
  }

  const staged = await git(dir, ['diff', '--cached', '--name-only'], spawnFn);
  if (staged.out === '') {
    return { committed: false, sha: null, reason: 'no changes to record' };
  }

  const commit = await git(dir, ['commit', '-m', message], spawnFn);
  if (commit.code !== 0) {
    return { committed: false, sha: null, reason: 'commit failed' };
  }

  const sha = await git(dir, ['rev-parse', 'HEAD'], spawnFn);
  return { committed: true, sha: sha.out || null, reason: 'recorded' };
};

/**
 * Make a local session directory into a git repository so the record actually
 * persists. Writ Drop "creates the session repo"; on a local session that means
 * a git repo, or `commitRecord` silently no-ops and no governance act is ever
 * recorded. Best-effort and idempotent: an existing repo is left untouched, and
 * a host without git degrades to a plain directory rather than failing the Writ.
 *
 * Sets a local identity attributed to the Speaker so later record commits — made
 * headless by the engine — have an author without relying on ambient git config.
 */
export const initSessionRepo = async (
  dir: string,
  speaker: string,
  guid: string,
  spawnFn: typeof spawn = spawn,
): Promise<CommitResult> => {
  const isRepo = await git(dir, ['rev-parse', '--is-inside-work-tree'], spawnFn);
  if (isRepo.code === 0) return { committed: false, sha: null, reason: 'existing repository' };
  if ((await git(dir, ['init', '-q'], spawnFn)).code !== 0) {
    return { committed: false, sha: null, reason: 'git unavailable — local directory only' };
  }
  await git(dir, ['config', 'user.name', speaker], spawnFn);
  await git(dir, ['config', 'user.email', `${speaker}@politik.local`], spawnFn);
  await git(dir, ['add', '-A'], spawnFn);
  const commit = await git(dir, ['commit', '-m', `writ drop: session ${guid}`], spawnFn);
  if (commit.code !== 0) return { committed: false, sha: null, reason: 'repo initialized, nothing to commit' };
  const sha = await git(dir, ['rev-parse', 'HEAD'], spawnFn);
  return { committed: true, sha: sha.out || null, reason: 'session repo initialized' };
};
