import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/runner.ts';
import { parseEnvelope, type Envelope } from '../src/envelope.ts';
import { dropWrit } from '../src/init.ts';
import { charterTemplate } from '../src/templates/parliamentary.ts';
import { parseEntries } from '../src/hansard.ts';

/** Build a session repo on disk, without git or an agent. */
const session = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'politik-run-'));
  const writ = dropWrit({
    charter_source: charterTemplate(),
    session_guid: 'run-test',
    now: '2026-04-08T14:00:00Z',
    speaker: 'speaker',
  });
  assert.ok(writ.ok);
  for (const file of writ.files) {
    const target = join(dir, file.path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
  return dir;
};

const NOW = '2026-04-08T15:00:00Z';

describe('refusals', () => {
  it('refuses an unknown agent', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir,
        agent_id: 'not-an-agent',
        actor: 'a',
        role: 'OPERATOR',
        task: 'x',
        now: NOW,
      });
      assert.ok(!outcome.ok);
      assert.match(outcome.reason, /unknown agent/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a directory that is not a session repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-empty-'));
    try {
      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'a',
        role: 'OPERATOR',
        task: 'x',
        now: NOW,
      });
      assert.ok(!outcome.ok);
      assert.match(outcome.reason, /STATE\.json/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to act on a session that is not CONVENED', async () => {
    const dir = await session();
    try {
      const state = JSON.parse(readFileSync(join(dir, 'STATE.json'), 'utf8')) as Record<string, unknown>;
      state['state'] = 'SUSPENDED';
      state['suspension'] = {
        cause: 'POINT_OF_ORDER',
        since: NOW,
        record_ref: null,
        escalation_ref: null,
      };
      await writeFile(join(dir, 'STATE.json'), JSON.stringify(state, null, 2), 'utf8');

      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'a',
        role: 'OPERATOR',
        task: 'x',
        now: NOW,
      });
      assert.ok(!outcome.ok);
      assert.match(outcome.reason, /SUSPENDED/);
      assert.match(outcome.reason, /POINT_OF_ORDER/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a constituency the Charter does not seat', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'a',
        role: 'DELEGATE',
        task: 'x',
        now: NOW,
      });
      assert.ok(!outcome.ok);
      assert.match(outcome.reason, /seats no DELEGATE/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** A spawn double: git answers plausibly, the agent "runs". */
const fakeSpawnShared = ((command: string, args: readonly string[]) => {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  const stdoutListeners: ((c: Buffer) => void)[] = [];
  const child = {
    stdout: { on: (_e: string, fn: (c: Buffer) => void) => stdoutListeners.push(fn) },
    stderr: { on: () => undefined },
    kill: () => undefined,
    on: (event: string, fn: (...a: unknown[]) => void) => {
      (listeners[event] ??= []).push(fn);
      return child;
    },
  };
  queueMicrotask(() => {
    const output = command === 'git' && args[0] === 'rev-parse' ? 'abc123'
      : command === 'git' ? '' : 'agent output';
    for (const fn of stdoutListeners) fn(Buffer.from(output));
    for (const fn of listeners['close'] ?? []) fn(0);
  });
  return child as never;
}) as never;

describe('received broadcasts', () => {
  const envelope = (target = 'OPERATOR', slots = 2, guid = 'run-test'): Envelope => {
    const result = parseEnvelope(
      `# [${guid}]\n## target-actor: ${target}\n## slots-remaining: ${slots}\n## protocol: parliamentary\n## prompt: |\n  Business from the bus.\n`,
    );
    assert.ok(result.ok);
    return result.envelope;
  };

  it('refuses a broadcast targeting another constituency', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'a', role: 'OPERATOR',
        task: 'x', now: NOW, envelope: envelope('MEMBER'),
      });
      assert.ok(!outcome.ok);
      assert.match(outcome.reason, /broadcast targets MEMBER/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts a broadcast for this constituency', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'a', role: 'OPERATOR',
        task: 'ignored', now: NOW, envelope: envelope('OPERATOR'),
        spawnFn: fakeSpawnShared,
      });
      assert.ok(outcome.ok, JSON.stringify(outcome));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('turn recording', () => {
  /** A spawn double: git commands answer plausibly, the agent "runs". */
  const fakeSpawn = ((command: string, args: readonly string[]) => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const stdoutListeners: ((c: Buffer) => void)[] = [];

    const child = {
      stdout: { on: (_e: string, fn: (c: Buffer) => void) => stdoutListeners.push(fn) },
      stderr: { on: () => undefined },
      kill: () => undefined,
      on: (event: string, fn: (...a: unknown[]) => void) => {
        (listeners[event] ??= []).push(fn);
        return child;
      },
    };

    queueMicrotask(() => {
      const output =
        command === 'git' && args[0] === 'rev-parse'
          ? 'abc123'
          : command === 'git'
            ? ''
            : 'agent output: motion drafted';
      for (const fn of stdoutListeners) fn(Buffer.from(output));
      for (const fn of listeners['close'] ?? []) fn(0);
    });

    return child as never;
  }) as never;

  it('records a completed turn in the Hansard, attributed', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'minister-alpha',
        role: 'OPERATOR',
        task: 'Table a motion.',
        now: NOW,
        spawnFn: fakeSpawn,
      });

      assert.ok(outcome.ok, `expected the turn to complete: ${JSON.stringify(outcome)}`);
      assert.equal(outcome.entry.type, 'MOTION_TABLED');
      assert.equal(outcome.entry.actor, 'minister-alpha');
      assert.equal(outcome.entry.role, 'OPERATOR');

      const entries = parseEntries(readFileSync(join(dir, 'HANSARD.md'), 'utf8'));
      assert.equal(entries.at(-1)?.type, 'MOTION_TABLED');
      assert.equal(entries.at(-1)?.actor, 'minister-alpha');
      assert.equal(entries.at(-1)?.fields['Agent'], 'claude-code');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves the Writ Drop entry — the record is append-only', async () => {
    const dir = await session();
    try {
      await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'a',
        role: 'OPERATOR',
        task: 'x',
        now: NOW,
        spawnFn: fakeSpawn,
      });
      const types = parseEntries(readFileSync(join(dir, 'HANSARD.md'), 'utf8')).map((e) => e.type);
      assert.deepEqual(types, ['WRIT_DROP', 'MOTION_TABLED']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('releases the constituency lock so a second turn can run', async () => {
    const dir = await session();
    try {
      const first = await runTurn({
        dir, agent_id: 'claude-code', actor: 'a', role: 'OPERATOR',
        task: 'x', now: NOW, spawnFn: fakeSpawn,
      });
      assert.ok(first.ok);

      const second = await runTurn({
        dir, agent_id: 'claude-code', actor: 'b', role: 'OPERATOR',
        task: 'y', now: NOW, spawnFn: fakeSpawn,
      });
      assert.ok(second.ok, 'lock was not released after the first turn');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
