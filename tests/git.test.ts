import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commitRecord, initSessionRepo } from '../src/git.ts';

const sh = (dir: string, args: readonly string[]): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd: dir, shell: false, stdio: 'ignore' });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

const capture = (dir: string, args: readonly string[]): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd: dir, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
    child.on('close', () => resolve(out));
    child.on('error', () => resolve(''));
  });

const repo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'politik-git-'));
  await sh(dir, ['init', '-q']);
  await sh(dir, ['config', 'user.email', 'test@example.com']);
  await sh(dir, ['config', 'user.name', 'Test']);
  await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n', 'utf8');
  await sh(dir, ['add', '-A']);
  await sh(dir, ['commit', '-q', '-m', 'init']);
  return dir;
};

describe('committing the record', () => {
  it('commits a changed Hansard', async () => {
    const dir = await repo();
    try {
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n\n## entry\n', 'utf8');
      const result = await commitRecord(dir, 'VOTE_CAST — alpha');
      assert.ok(result.committed, result.reason);
      assert.ok(result.sha);
      assert.equal(result.sha.length, 40);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports no changes rather than making an empty commit', async () => {
    const dir = await repo();
    try {
      const result = await commitRecord(dir, 'nothing changed');
      assert.ok(!result.committed);
      assert.equal(result.reason, 'no changes to record');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('leaves the tree clean afterwards', async () => {
    const dir = await repo();
    try {
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n\n## entry\n', 'utf8');
      await commitRecord(dir, 'record');
      const status = await new Promise<string>((resolve) => {
        const child = spawn('git', ['status', '--porcelain'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
        let out = '';
        child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
        child.on('close', () => resolve(out.trim()));
      });
      assert.equal(status, '', 'record left uncommitted changes behind');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stages only the named paths — never an actor\'s unrelated work', async () => {
    const dir = await repo();
    try {
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n\n## entry\n', 'utf8');
      await writeFile(join(dir, 'draft.md'), 'half-finished work by an actor\n', 'utf8');

      const result = await commitRecord(dir, 'record', ['HANSARD.md']);
      assert.ok(result.committed);

      const status = await new Promise<string>((resolve) => {
        const child = spawn('git', ['status', '--porcelain'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
        let out = '';
        child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
        child.on('close', () => resolve(out.trim()));
      });
      // The unrelated file must still be uncommitted: sweeping it into a
      // governance commit would misattribute it to the acting role.
      assert.match(status, /draft\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('no-ops outside a git repository rather than throwing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-nogit-'));
    try {
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n', 'utf8');
      const result = await commitRecord(dir, 'record');
      assert.ok(!result.committed);
      assert.equal(result.reason, 'not a git repository');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('initializing a session repo', () => {
  it('makes a non-repo directory a git repo with a writ-drop commit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-writ-'));
    try {
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n', 'utf8');
      const result = await initSessionRepo(dir, 'steve', 'guid-abc');
      assert.ok(result.committed, result.reason);
      assert.ok(result.sha);
      assert.equal(result.sha.length, 40);
      // it is now a real repo: a record commit succeeds against it
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n\n## entry\n', 'utf8');
      const rec = await commitRecord(dir, 'VOTE_CAST — alpha');
      assert.ok(rec.committed, rec.reason);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('commits the writ drop into an enclosing repo (monorepo mode)', async () => {
    const parent = await repo();
    try {
      // a session scaffolded as a subtree of an existing repo, not yet committed
      const dir = join(parent, 'TICKET-1');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'CHARTER.md'), '# Charter\n', 'utf8');
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n', 'utf8');

      const result = await initSessionRepo(dir, 'steve', 'guid-mono');
      assert.ok(result.committed, result.reason);
      assert.ok(result.sha);
      assert.equal(result.sha.length, 40);

      // no nested repo was created — the writ drop landed in the ONE parent repo
      assert.equal(existsSync(join(dir, '.git')), false);
      const log = await capture(parent, ['log', '--oneline']);
      assert.match(log, /writ drop: session guid-mono/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('no-ops on a clean existing repo (nothing to commit)', async () => {
    const dir = await repo();
    try {
      const result = await initSessionRepo(dir, 'steve', 'guid-abc');
      assert.ok(!result.committed);
      assert.match(result.reason, /nothing to commit/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes an orphaned atomic-write .tmp from the writ drop', async () => {
    const parent = await repo();
    try {
      const dir = join(parent, 'TICKET-2');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'HANSARD.md'), '# HANSARD\n', 'utf8');
      await writeFile(join(dir, 'HANSARD.md.tmp'), 'half-written', 'utf8');

      const result = await initSessionRepo(dir, 'steve', 'guid-tmp');
      assert.ok(result.committed, result.reason);
      const tracked = await capture(parent, ['ls-files']);
      assert.doesNotMatch(tracked, /\.tmp$/m);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
