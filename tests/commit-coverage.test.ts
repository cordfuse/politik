/**
 * Regression: a governance act must leave nothing uncommitted.
 *
 * The Hansard cites side-files by path — a Point of Order's body, a ruling's
 * reasoning, the prorogation's sealed summary. If the command writes those files
 * but commits only HANSARD.md/STATE.json/LEDGER.md, the canonical record points
 * at content that never entered git: clean the working tree and the substance is
 * gone while the Hansard still references it. "The record is the source of truth"
 * requires every file the record names to be in the record's history.
 *
 * This drives the real binary through escalate → rule → prorogue and asserts the
 * working tree is clean after each — every cited file committed.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

const run = (args: readonly string[]): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], { stdio: 'ignore' });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });

const porcelain = (dir: string): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
    child.on('close', () => resolve(out.trim()));
    child.on('error', () => resolve('git-error'));
  });

describe('a governance act leaves nothing uncommitted', () => {
  it('commits the files the Hansard cites (escalation, ruling, seal)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-commit-'));
    try {
      await run(['scaffold', '--dir', dir, '--quorum', '1']);
      await run(['init', '--charter', join(dir, 'CHARTER.md'), '--speaker', 'steve', '--dir', dir]);
      assert.equal(await porcelain(dir), '', 'writ drop should leave a clean tree');

      await run(['escalate', '--dir', dir, '--actor', 'bob', '--role', 'MEMBER',
        '--title', 'point of order', '--body', 'process objection']);
      assert.equal(await porcelain(dir), '',
        'escalation body file must be committed, not left untracked');

      await run(['rule', '--dir', dir, '--seq', '1', '--actor', 'steve',
        '--outcome', 'UPHELD', '--body', 'sustained']);
      assert.equal(await porcelain(dir), '',
        'ruling file must be committed, not left untracked');

      await run(['prorogue', '--dir', dir, '--actor', 'steve', '--role', 'AUTHORITY',
        '--trigger', 'objective_met', '--summary', 'done']);
      assert.equal(await porcelain(dir), '',
        'prorogation seal must be committed — "the Hansard is sealed" must be true on git');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
