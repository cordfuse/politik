import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/runner.ts';
import { parseEnvelope, type Envelope } from '../src/envelope.ts';
import { dropWrit } from '../src/init.ts';
import { charterTemplate } from '../src/templates/parliamentary.ts';
import { parseEntries } from '../src/hansard.ts';
import { parseState } from '../src/state.ts';

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

describe('an agent-filed Point of Order suspends the sitting', () => {
  /**
   * A spawn double where the agent, rather than acting beyond its authority,
   * files a Point of Order — a new file under escalations/. git reports it as a
   * newly-dirty file once the agent has run.
   */
  // A factory: each test needs a fresh closure, or the agentRan flag leaks
  // between tests and git reports no newly-dirty escalation file.
  const makeEscalatingSpawn = () => {
    let agentRan = false;
    return ((command: string, args: readonly string[]) => {
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
        let output = '';
        if (command === 'git' && args[0] === 'rev-parse') output = 'abc123';
        else if (command === 'git' && args[0] === 'status') {
          output = agentRan ? '?? escalations/POINT-OF-ORDER-001.md' : '';
        } else if (command === 'git') output = '';
        else {
          agentRan = true;
          output = 'This decision is above my authority; I am filing a Point of Order.';
        }
        for (const fn of stdoutListeners) fn(Buffer.from(output));
        for (const fn of listeners['close'] ?? []) fn(0);
      });
      return child as never;
    }) as never;
  };

  it('suspends the session and records the Point of Order', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'minister-alpha',
        role: 'OPERATOR',
        task: 'Do something requiring authority you do not hold.',
        now: NOW,
        spawnFn: makeEscalatingSpawn(),
      });

      assert.ok(outcome.ok, `turn should complete: ${JSON.stringify(outcome)}`);
      assert.equal(outcome.suspended, true, 'the sitting must suspend on an agent Point of Order');

      const state = parseState(readFileSync(join(dir, 'STATE.json'), 'utf8'));
      assert.equal(state?.state, 'SUSPENDED');
      assert.equal(state?.suspension?.cause, 'POINT_OF_ORDER');
      assert.equal(state?.suspension?.escalation_ref, 'escalations/POINT-OF-ORDER-001.md');

      const last = parseEntries(readFileSync(join(dir, 'HANSARD.md'), 'utf8')).at(-1);
      assert.match(last?.fields['Point of Order'] ?? '', /POINT-OF-ORDER-001\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('leaves the session CONVENED when the agent touches no escalation file', async () => {
    const dir = await session();
    try {
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'a', role: 'OPERATOR',
        task: 'Just answer.', now: NOW, spawnFn: fakeSpawnShared,
      });
      assert.ok(outcome.ok);
      assert.notEqual(outcome.suspended, true);
      assert.equal(parseState(readFileSync(join(dir, 'STATE.json'), 'utf8'))?.state, 'CONVENED');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does NOT suspend on an agent escalation when the protocol declares no escalation (ADR-0006)', async () => {
    const dir = await session();
    try {
      // A Darwinist charter: no escalation. An agent Point of Order is recorded
      // but must not suspend — there would be no mechanism to lift it.
      const charter = readFileSync(join(dir, 'CHARTER.md'), 'utf8').replace(
        'escalation: enabled',
        'escalation: disabled',
      );
      await writeFile(join(dir, 'CHARTER.md'), charter, 'utf8');

      const outcome = await runTurn({
        dir,
        agent_id: 'claude-code',
        actor: 'minister-alpha',
        role: 'OPERATOR',
        task: 'Do something requiring authority you do not hold.',
        now: NOW,
        spawnFn: makeEscalatingSpawn(),
      });

      assert.ok(outcome.ok, JSON.stringify(outcome));
      assert.notEqual(outcome.suspended, true, 'a no-escalation protocol must not suspend');
      assert.equal(parseState(readFileSync(join(dir, 'STATE.json'), 'utf8'))?.state, 'CONVENED');
      const last = parseEntries(readFileSync(join(dir, 'HANSARD.md'), 'utf8')).at(-1);
      assert.match(last?.fields['Point of Order'] ?? '', /ignored: this protocol declares no escalation/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('acts recorded during a turn survive it', () => {
  /**
   * A spawn double whose agent acts on the record while it runs. `act` edits
   * the session files the way the agent did; `committed` says whether git then
   * reports them clean (the CLI committed them) or dirty (a hand edit left in
   * the tree). Regression for the Scrum UAT, where a Developer's two votes, cast
   * through the CLI inside its own turn, were overwritten when the turn wrote
   * back the Hansard it had read before the agent ran.
   */
  const makeActingSpawn = (dir: string, act: () => void, committed: boolean, files: string[]) => {
    let agentRan = false;
    return ((command: string, args: readonly string[]) => {
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
        let output = '';
        if (command === 'git' && args[0] === 'rev-parse') output = agentRan ? 'def456' : 'abc123';
        else if (command === 'git' && args[0] === 'diff') output = committed && agentRan ? files.join('\n') : '';
        else if (command === 'git' && args[0] === 'status') {
          output = !committed && agentRan ? files.map((f) => ` M ${f}`).join('\n') : '';
        } else if (command === 'git') output = '';
        else {
          agentRan = true;
          act();
          output = 'Reviewed both items and voted.';
        }
        for (const fn of stdoutListeners) fn(Buffer.from(output));
        for (const fn of listeners['close'] ?? []) fn(0);
      });
      return child as never;
    }) as never;
  };

  const vote = (at: string, actor: string, motion: string): string =>
    `\n## ${at} — VOTE_CAST\n\n**Actor:** ${actor} (OPERATOR)\n**Motion:** ${motion}\n**Vote:** AYE\n`;

  it('keeps a vote the agent cast through the CLI, and does not call it a violation', async () => {
    const dir = await session();
    try {
      const hansardPath = join(dir, 'HANSARD.md');
      const spawnFn = makeActingSpawn(
        dir,
        () => writeFileSync(hansardPath, readFileSync(hansardPath, 'utf8') + vote('2026-04-08T15:00:01Z', 'dev-a', 'motion-001')),
        true,
        ['HANSARD.md', 'STATE.json'],
      );
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'dev-a', role: 'OPERATOR',
        task: 'Review and vote.', now: NOW, spawnFn,
      });
      assert.ok(outcome.ok, JSON.stringify(outcome));

      const entries = parseEntries(readFileSync(hansardPath, 'utf8'));
      assert.ok(entries.some((e) => e.type === 'VOTE_CAST'), 'the vote cast during the turn must survive');
      const last = entries.at(-1);
      assert.equal(last?.type, 'MOTION_TABLED');
      assert.equal(last?.fields['Standing Orders violation'], undefined);
      assert.match(last?.fields['Acts during turn'] ?? '', /^1 recorded/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps a suspension a committed act made during the turn', async () => {
    const dir = await session();
    try {
      const statePath = join(dir, 'STATE.json');
      const spawnFn = makeActingSpawn(
        dir,
        () => {
          const s = parseState(readFileSync(statePath, 'utf8'));
          assert.ok(s);
          writeFileSync(statePath, JSON.stringify({
            ...s,
            state: 'SUSPENDED',
            suspension: { cause: 'DEADLOCK', since: '2026-04-08T15:00:01Z', record_ref: 'HANSARD.md', escalation_ref: null },
          }, null, 2));
        },
        true,
        ['STATE.json'],
      );
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'dev-a', role: 'OPERATOR',
        task: 'Tally.', now: NOW, spawnFn,
      });
      assert.ok(outcome.ok, JSON.stringify(outcome));
      const after = parseState(readFileSync(statePath, 'utf8'));
      assert.equal(after?.state, 'SUSPENDED', 'the turn must not undo a suspension made during it');
      assert.equal(after?.suspension?.cause, 'DEADLOCK');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('flags a hand edit of the Hansard and restores the record', async () => {
    const dir = await session();
    try {
      const hansardPath = join(dir, 'HANSARD.md');
      const before = readFileSync(hansardPath, 'utf8');
      const spawnFn = makeActingSpawn(
        dir,
        () => writeFileSync(hansardPath, '# HANSARD\n\nnothing happened here\n'),
        false,
        ['HANSARD.md'],
      );
      const outcome = await runTurn({
        dir, agent_id: 'claude-code', actor: 'dev-a', role: 'OPERATOR',
        task: 'x', now: NOW, spawnFn,
      });
      assert.ok(outcome.ok, JSON.stringify(outcome));
      const after = readFileSync(hansardPath, 'utf8');
      assert.ok(after.startsWith(before), 'the pre-turn record must be restored, not the edit');
      assert.ok(!after.includes('nothing happened here'));
      const last = parseEntries(after).at(-1);
      assert.match(last?.fields['Standing Orders violation'] ?? '', /HANSARD\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
