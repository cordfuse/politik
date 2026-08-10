/**
 * Regression: the Hansard must never be left truncated by an interrupt.
 *
 * A governance act writes HANSARD.md and then does more work (projection report,
 * commit). If stdout is closed early — `politik division call | head`, a Ctrl-C,
 * a broken pipe — the process takes SIGPIPE mid-run. With a plain writeFile
 * (O_TRUNC) that lands during the write, HANSARD.md is left at zero bytes and the
 * record is destroyed, after the operator was already told the act succeeded.
 * Atomic writes (temp + rename) make the record's replacement all-or-nothing:
 * the file is only ever the complete old content or the complete new content,
 * never empty. This test drives the real binary under the closed-pipe condition
 * and asserts that invariant holds.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

const run = (args: readonly string[], closePipeOnFirstByte = false): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', () => {
      // Mimic `| head`: close the read end the instant output arrives, so the
      // child's next write faults with EPIPE/SIGPIPE mid-act.
      if (closePipeOnFirstByte) child.stdout.destroy();
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });

describe('Hansard durability under a closed pipe', () => {
  it('never leaves HANSARD.md truncated when stdout is closed mid-act', async () => {
    const root = await mkdtemp(join(tmpdir(), 'politik-atomic-'));
    try {
      const dir = join(root, 'session');
      await run(['scaffold', '--dir', dir, '--quorum', '1']);
      await run(['init', '--charter', join(dir, 'CHARTER.md'), '--speaker', 'steve', '--dir', dir]);

      // Repeat: each call writes the Hansard, then does more work. Close the pipe
      // on the first byte of output every time to keep landing SIGPIPE mid-act.
      for (let i = 0; i < 8; i += 1) {
        await run(
          ['division', 'call', '--dir', dir, '--motion', `m${i}`, '--actor', 'steve', '--role', 'AUTHORITY'],
          true,
        );
        const hansard = await readFile(join(dir, 'HANSARD.md'), 'utf8');
        // The invariant: the record is never empty. It is either the prior
        // complete content or the new complete content — never a truncated file.
        assert.ok(hansard.length > 0, `HANSARD.md truncated to empty on iteration ${i}`);
        assert.match(hansard, /^# HANSARD/, `HANSARD.md corrupted on iteration ${i}`);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
