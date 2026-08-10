/**
 * End-to-end: `politik run` seats an agent, captures its work, measures the cost.
 *
 * The unit tests exercise runTurn() with an injected spawnFn; nothing drives the
 * real `run` command through a real child process, and CI has no agent installed
 * (doctor reports "agents none"). This test supplies a shim agent — a tiny
 * executable that stands in for `claude`, does real work (writes and commits a
 * Motion), and emits Claude Code's `--output-format json` — so the whole
 * elect → compose → spawn → capture → record → measure path runs for real.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

// The shim commits its work, so a well-behaved turn leaves a clean tree — the
// same contract the Standing Orders put on a real agent.
const SHIM = `#!/usr/bin/env bash
mkdir -p motions
printf '# Motion: adopt the coding standard\\n' > motions/adopt-standard.md
git add motions/adopt-standard.md >/dev/null 2>&1
git -c user.name=bot -c user.email=bot@politik.local commit -q -m "motion: adopt the standard" >/dev/null 2>&1
cat <<'JSON'
{"type":"result","result":"Filed a Motion.","usage":{"input_tokens":1200,"output_tokens":340,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"total_cost_usd":0.0123,"modelUsage":{"claude-opus-4-8":{}}}
JSON
`;

const runBin = (args: readonly string[], env?: NodeJS.ProcessEnv): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], { stdio: ['ignore', 'pipe', 'ignore'], env: env ?? process.env });
    let out = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.on('close', () => resolve(out));
    child.on('error', () => resolve(''));
  });

const porcelain = (dir: string): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout?.on('data', (c: Buffer) => { out += c.toString(); });
    child.on('close', () => resolve(out.trim()));
    child.on('error', () => resolve('git-error'));
  });

describe('the agent turn, end to end', { skip: platform() === 'win32' ? 'POSIX shim' : false }, () => {
  it('seats an agent, records its Motion, and measures the cost', async () => {
    const root = await mkdtemp(join(tmpdir(), 'politik-run-'));
    try {
      const binDir = join(root, 'bin');
      const dir = join(root, 'sess');
      await runBin(['scaffold', '--dir', dir, '--quorum', '1']);
      await runBin(['init', '--charter', join(dir, 'CHARTER.md'), '--speaker', 'steve', '--dir', dir]);

      // Install the shim as `claude` and put it first on PATH for the run.
      await mkdir(binDir, { recursive: true });
      await writeFile(join(binDir, 'claude'), SHIM);
      await chmod(join(binDir, 'claude'), 0o755);
      const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` };

      const out = await runBin(
        ['run', '--dir', dir, '--agent', 'claude-code', '--actor', 'bot', '--role', 'OPERATOR',
          '--task', 'Adopt the coding standard.'],
        env,
      );

      assert.match(out, /TURN COMPLETE/, `run did not complete:\n${out}`);
      assert.match(out, /motions\/adopt-standard\.md/, 'the agent-touched file was not detected');

      // The turn is on the record...
      const hansard = await readFile(join(dir, 'HANSARD.md'), 'utf8');
      assert.match(hansard, /MOTION_TABLED/, 'the turn was not recorded in the Hansard');

      // ...the ledger measured it from the agent's JSON (1200 + 340 tokens)...
      const ledger = await readFile(join(dir, 'LEDGER.md'), 'utf8');
      assert.match(ledger, /1200|1,?540|340/, `ledger did not measure the turn:\n${ledger}`);

      // ...and a well-behaved turn leaves a clean tree.
      assert.equal(await porcelain(dir), '', 'the turn left the tree dirty');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
