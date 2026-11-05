/**
 * ADR-0011 — shared sessions across machines.
 *
 * "Machines" are separate clones of one bare repository standing in for the
 * shared remote. Every scenario drives the real binary, because what is under
 * test is git round-trips between clones.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

interface Result { readonly code: number; readonly out: string; readonly err: string }

const baseEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env['PATH'],
  HOME: process.env['HOME'],
  // A fixed identity so clones can commit on any CI machine.
  GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com',
  GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com',
});

const runBin = (args: readonly string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<Result> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv(), ...env }, ...(cwd === undefined ? {} : { cwd }),
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });

const git = (dir: string, args: readonly string[]): Promise<Result> =>
  new Promise((resolve) => {
    const child = spawn('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv() } });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? -1, out: out.trim(), err: err.trim() }));
  });

/** Run under a pseudo-terminal (util-linux `script`), typing `input`. */
const runInTerminal = (args: readonly string[], input: string, cwd?: string): Promise<Result> =>
  new Promise((resolve) => {
    const cmd = ['node', BIN, ...args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
    const child = spawn('script', ['-qec', cmd, '/dev/null'], {
      stdio: ['pipe', 'pipe', 'pipe'], env: baseEnv(), ...(cwd === undefined ? {} : { cwd }),
    });
    let out = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.stdin.end(`${input}\n`);
    child.on('close', (code) => resolve({ code: code ?? -1, out, err: '' }));
  });

const hasScript = (process.env['PATH'] ?? '').split(':').some((p) => existsSync(join(p, 'script')));

const HARNESS = { AI_AGENT: 'claude-code_test_agent' };

interface World { readonly root: string; readonly remote: string; readonly a: string; readonly b: string }

/**
 * A shared session: the Speaker (steve) convenes it on machine A and shares it
 * through a bare remote; ada joins from machine B.
 */
const withWorld = async (
  fn: (w: World) => Promise<void>,
  scaffoldExtra: readonly string[] = ['--speaker-confirmation', 'off'],
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'politik-shared-'));
  try {
    const remote = join(root, 'remote.git');
    const a = join(root, 'a');
    const b = join(root, 'b');
    assert.equal((await git(root, ['init', '--quiet', '--bare', remote])).code, 0);
    assert.equal((await runBin(['scaffold', '--dir', a, '--quorum', '2', ...scaffoldExtra])).code, 0);
    const init = await runBin(['init', '--charter', join(a, 'CHARTER.md'), '--speaker', 'steve', '--dir', a, '--remote', remote]);
    assert.equal(init.code, 0, init.err);
    assert.match(init.out, /shared\s+shared via origin/);
    const joined = await runBin(['join', remote, b, '--as', 'ada']);
    assert.equal(joined.code, 0, joined.err);
    await fn({ root, remote, a, b });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const hansard = (dir: string): Promise<string> => readFile(join(dir, 'HANSARD.md'), 'utf8');

const call = (dir: string, motion = 'm1') =>
  runBin(['division', 'call', '--dir', dir, '--motion', motion, '--actor', 'steve', '--role', 'AUTHORITY']);
const vote = (dir: string, actor: string, motion = 'm1') =>
  runBin(['division', 'vote', '--dir', dir, '--motion', motion, '--actor', actor, '--role', 'MEMBER', '--vote', 'AYE']);

describe('configuring and joining (ADR-0011 §1)', () => {
  it('init --remote publishes; join clones, checks the seals and turns on sync', async () => {
    await withWorld(async ({ a, b, remote }) => {
      const shownA = await runBin(['remote', '--dir', a]);
      assert.match(shownA.out, /you are\s+steve/);
      const shownB = await runBin(['remote', '--dir', b]);
      assert.match(shownB.out, new RegExp(`shared\\s+via origin — ${remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.match(shownB.out, /you are\s+ada/);
      assert.equal((await runBin(['status', '--dir', b])).code, 0);
    });
  });

  it('join refuses something that is not a session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'politik-shared-'));
    try {
      const remote = join(root, 'r.git');
      const src = join(root, 'src');
      await git(root, ['init', '--quiet', '--bare', remote]);
      await git(root, ['init', '--quiet', src]);
      await writeFile(join(src, 'README.md'), 'not a session\n');
      await git(src, ['add', '.']);
      await git(src, ['commit', '--quiet', '-m', 'x']);
      await git(src, ['push', '--quiet', remote, 'HEAD:refs/heads/main']);
      const r = await runBin(['join', remote, join(root, 'b'), '--as', 'ada']);
      assert.equal(r.code, 1);
      assert.match(r.err, /not a convened session/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('a session that never configures a remote never touches the network', async () => {
    const root = await mkdtemp(join(tmpdir(), 'politik-shared-'));
    try {
      await runBin(['scaffold', '--dir', root, '--quorum', '1', '--speaker-confirmation', 'off']);
      await runBin(['init', '--charter', join(root, 'CHARTER.md'), '--speaker', 'steve', '--dir', root]);
      assert.equal((await call(root)).code, 0);
      assert.equal((await git(root, ['remote'])).out, '');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('sync on every act (ADR-0011 §2)', () => {
  it('acts on one machine reach the other; each act fast-forwards first, so nothing ever merges', async () => {
    await withWorld(async ({ a, b }) => {
      assert.equal((await call(a)).code, 0);
      const v1 = await vote(b, 'ada');
      assert.equal(v1.code, 0, v1.err);
      const v2 = await vote(a, 'bo');
      assert.equal(v2.code, 0, v2.err);
      const tally = await runBin(['division', 'tally', '--dir', b, '--motion', 'm1']);
      assert.equal(tally.code, 0, tally.err);
      assert.match(tally.out, /CARRIED/);
      // Every act is on both machines and the history is a single line.
      assert.equal((await runBin(['sync', '--dir', a])).code, 0);
      assert.equal(await hansard(a), await hansard(b));
      assert.equal((await git(a, ['rev-list', '--merges', '--count', 'HEAD'])).out, '0');
    });
  });

  it('a read catches up with the shared record', async () => {
    await withWorld(async ({ a, b }) => {
      await call(a);
      assert.doesNotMatch(await hansard(b), /m1/, 'B has not seen the call yet');
      const status = await runBin(['status', '--dir', b, '--json']);
      assert.equal(status.code, 0, status.err);
      assert.match(await hansard(b), /m1/, 'reading status caught B up');
    });
  });

  it('a push overtaken by another machine is discarded and recomputed, showing one clean result', async () => {
    await withWorld(async ({ root, a, b }) => {
      await call(a);
      await runBin(['sync', '--dir', b]);
      // On B's first push, machine A casts a vote and pushes first, so B's push
      // is rejected. B must catch up and recompute its own vote on top.
      const marker = join(root, 'raced');
      const hook = join(b, '.git', 'hooks', 'pre-push');
      await writeFile(hook, [
        '#!/bin/sh',
        `if [ ! -e '${marker}' ]; then`,
        `  touch '${marker}'`,
        `  node '${BIN}' division vote --dir '${a}' --motion m1 --actor bo --role MEMBER --vote AYE >/dev/null 2>&1`,
        'fi',
        'exit 0',
        '',
      ].join('\n'));
      await chmod(hook, 0o755);

      const r = await vote(b, 'ada');
      assert.equal(r.code, 0, r.err);
      assert.ok(existsSync(marker), 'the race happened');
      assert.equal((r.out.match(/^\s+recorded [0-9a-f]{8}/gm) ?? []).length, 1, 'only the recorded attempt is reported');
      await runBin(['sync', '--dir', a]);
      const h = await hansard(a);
      assert.match(h, /bo/);
      assert.match(h, /ada/);
      assert.equal(h, await hansard(b));
      assert.equal((await git(b, ['rev-list', '--merges', '--count', 'HEAD'])).out, '0');
    });
  });
});

describe('offline (ADR-0011 §3)', () => {
  it('governance refuses when the remote is unreachable; reads still work', async () => {
    await withWorld(async ({ root, b }) => {
      await git(b, ['remote', 'set-url', 'origin', join(root, 'gone.git')]);
      const act = await call(b);
      assert.equal(act.code, 1);
      assert.match(act.err, /shared session and origin cannot be reached/);
      assert.equal((await runBin(['status', '--dir', b])).code, 0);
      assert.equal((await runBin(['hansard', '--dir', b])).code, 0);
    });
  });
});

describe('shared pending acts and who may confirm (ADR-0011 §4)', () => {
  const carry = async (w: World): Promise<void> => {
    await call(w.a);
    await vote(w.b, 'ada');
    await vote(w.a, 'bo');
    await runBin(['division', 'tally', '--dir', w.a, '--motion', 'm1']);
  };

  it('an act staged on one machine is visible on the other, and is never on the branch', async () => {
    await withWorld(async (w) => {
      await carry(w);
      const staged = await runBin(['assent', '--dir', w.b, '--motion', 'm1', '--actor', 'steve', '--role', 'AUTHORITY'], HARNESS);
      assert.equal(staged.code, 3, staged.err);
      const fromA = await runBin(['pending', '--dir', w.a, '--json']);
      const acts = JSON.parse(fromA.out) as Array<{ act: string; requested_via: string }>;
      assert.equal(acts.length, 1);
      assert.equal(acts[0]?.requested_via, 'claude-code_test_agent');
      assert.doesNotMatch((await git(w.a, ['log', '--all', '--format=%s', '--', '.politik'])).out, /pending/);
      assert.equal((await git(w.a, ['status', '--porcelain'])).out, '');
    }, ['--speaker-confirmation', 'required']);
  });

  it('only the seat the act names may confirm it; the Speaker confirms from their own machine', { skip: !hasScript }, async () => {
    await withWorld(async (w) => {
      await carry(w);
      await runBin(['assent', '--dir', w.b, '--motion', 'm1', '--actor', 'steve', '--role', 'AUTHORITY'], HARNESS);
      const [act] = JSON.parse((await runBin(['pending', '--dir', w.b, '--json'])).out) as Array<{ id: string }>;
      assert.ok(act !== undefined);

      const byAda = await runInTerminal(['confirm', act.id, '--dir', w.b], act.id);
      assert.match(byAda.out, /is steve's act to confirm, and this clone is operated by ada/);

      const bySteve = await runInTerminal(['confirm', act.id, '--dir', w.a], act.id);
      assert.match(bySteve.out, /CONFIRMED/);
      const body = (await git(w.a, ['log', '-1', '--format=%B'])).out;
      assert.match(body, /^ASSENT_GRANTED/);
      assert.match(body, /Politik-Requested-Via: claude-code_test_agent/);
      assert.match(body, /Politik-Confirmed-By: speaker-at-terminal/);
      assert.match(body, /Politik-Operator: /);

      // Shared: B sees the assent and no longer sees the pending act.
      assert.equal((await runBin(['sync', '--dir', w.b])).code, 0);
      assert.match(await hansard(w.b), /ASSENT_GRANTED/);
      assert.equal((JSON.parse((await runBin(['pending', '--dir', w.b, '--json'])).out) as unknown[]).length, 0);
    }, ['--speaker-confirmation', 'required']);
  });
});

describe('identity on the record (ADR-0011 §5)', () => {
  it('every shared act carries the operator trailer', async () => {
    await withWorld(async ({ b }) => {
      await call(b);
      assert.match((await git(b, ['log', '-1', '--format=%B'])).out, /Politik-Operator: \S+/);
    });
  });
});
