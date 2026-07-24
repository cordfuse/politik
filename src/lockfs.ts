/**
 * Filesystem-backed LockFs.
 *
 * The atomicity the election depends on comes from `open(2)` with
 * `O_CREAT|O_EXCL` — Node's `wx` flag — which creates a file and fails if it
 * already exists, in a single syscall. Two agents racing to create the same
 * lockfile cannot both succeed.
 *
 * Kept in its own module so `election.ts` has no filesystem dependency and can
 * be exercised without touching a disk.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { LockFs } from './election.ts';

/** Errors that mean "the thing is not there", as opposed to a real fault. */
const isAbsent = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code: string }).code === 'ENOENT';

const isExists = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code: string }).code === 'EEXIST';

export const nodeLockFs: LockFs = {
  async createExclusive(path: string, contents: string): Promise<boolean> {
    try {
      await mkdir(dirname(path), { recursive: true });
      // 'wx' — create exclusively. Fails with EEXIST if the path exists.
      await writeFile(path, contents, { flag: 'wx' });
      return true;
    } catch (err) {
      if (isExists(err)) return false;
      throw err;
    }
  },

  async readFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (err) {
      if (isAbsent(err)) return null;
      throw err;
    }
  },

  async remove(path: string): Promise<void> {
    await rm(path, { force: true });
  },
};
