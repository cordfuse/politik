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

  const add = await git(dir, ['add', '--', ...paths], spawnFn);
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
