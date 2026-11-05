/**
 * ADR-0010 — the operator interface: bring your own harness.
 *
 * Drives the real binary, because the guarantees here are about the process
 * boundary — environment, terminal, files on disk — not about pure functions.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

interface Result { readonly code: number; readonly out: string; readonly err: string }

/** Run the CLI with no terminal attached and a controlled environment. */
const runBin = (
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
): Promise<Result> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env['PATH'], HOME: process.env['HOME'], ...env },
      ...(cwd === undefined ? {} : { cwd }),
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });

const withTmp = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), 'politik-operator-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

describe('scaffold — harness-agnostic instruction files (ADR-0010 §1)', () => {
  it('writes AGENTS.md plus CLAUDE.md and GEMINI.md pointers to it', async () => {
    await withTmp(async (dir) => {
      const r = await runBin(['scaffold', '--dir', dir, '--quorum', '1']);
      assert.equal(r.code, 0, r.err);
      for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) assert.ok(existsSync(join(dir, f)), f);
      for (const f of ['CLAUDE.md', 'GEMINI.md']) {
        assert.match(await readFile(join(dir, f), 'utf8'), /\[AGENTS\.md\]\(AGENTS\.md\)/);
      }
    });
  });

  it('reports files it overwrites instead of replacing them silently', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'AGENTS.md'), '# bootstrap\n');
      const r = await runBin(['scaffold', '--dir', dir, '--quorum', '1']);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /AGENTS\.md\s+\(replaced existing file\)/);
      assert.doesNotMatch(r.out, /CHARTER\.md\s+\(replaced/);
    });
  });
});
