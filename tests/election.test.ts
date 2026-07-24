import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bowOut,
  currentHolder,
  lockPath,
  standForElection,
  type ElectionOptions,
  type LockFs,
} from '../src/election.ts';
import { nodeLockFs } from '../src/lockfs.ts';
import { parseEnvelope, type Envelope } from '../src/envelope.ts';

const ENVELOPE: Envelope = (() => {
  const result = parseEnvelope(
    '# [session-1]\n## target-actor: OPERATOR\n## slots-remaining: 3\n## protocol: parliamentary\n## prompt: |\n  Do the work.\n',
  );
  assert.ok(result.ok);
  return result.envelope;
})();

/** In-memory LockFs with a genuinely atomic create. */
const memoryFs = (): LockFs & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return {
    files,
    async createExclusive(path, contents) {
      if (files.has(path)) return false;
      files.set(path, contents);
      return true;
    },
    async readFile(path) {
      return files.get(path) ?? null;
    },
    async remove(path) {
      files.delete(path);
    },
  };
};

const opts = (fs: LockFs, staleAfterMs: number | null = null): ElectionOptions => ({
  fs,
  lockDir: '/locks',
  staleAfterMs,
});

const NOW = '2026-04-08T14:00:00Z';

describe('eligibility gates precede the lock', () => {
  it('an agent of another constituency never contends', async () => {
    const fs = memoryFs();
    const outcome = await standForElection(ENVELOPE, 'agent-a', 'MEMBER', opts(fs), NOW);
    assert.deepEqual(outcome, { elected: false, reason: 'NOT_TARGETED' });
    assert.equal(fs.files.size, 0, 'lockfile created by a non-target agent');
  });

  it('an exhausted broadcast elects nobody', async () => {
    const fs = memoryFs();
    const exhausted = { ...ENVELOPE, slots_remaining: 0 };
    const outcome = await standForElection(exhausted, 'agent-a', 'OPERATOR', opts(fs), NOW);
    assert.deepEqual(outcome, { elected: false, reason: 'NO_SLOTS' });
    assert.equal(fs.files.size, 0);
  });
});

describe('first agent wins', () => {
  it('elects the first agent to acquire the lock', async () => {
    const fs = memoryFs();
    const first = await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs), NOW);
    assert.ok(first.elected);
    assert.equal(first.holder.agent, 'agent-a');
  });

  it('defers every subsequent agent to the broadcaster', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs), NOW);

    for (const agent of ['agent-b', 'agent-c']) {
      const outcome = await standForElection(ENVELOPE, agent, 'OPERATOR', opts(fs), NOW);
      assert.ok(!outcome.elected);
      assert.equal(outcome.reason, 'DEFERRED');
      assert.equal(outcome.holder?.agent, 'agent-a');
    }
  });

  it('scopes the lock per session and constituency', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs), NOW);

    const otherSession = { ...ENVELOPE, session_guid: 'session-2' };
    const outcome = await standForElection(otherSession, 'agent-b', 'OPERATOR', opts(fs), NOW);
    assert.ok(outcome.elected, 'a different session must not be blocked');
  });
});

describe('bow-out', () => {
  it('frees the constituency for the next agent', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs), NOW);
    assert.ok(await bowOut(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs)));

    const next = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', opts(fs), NOW);
    assert.ok(next.elected);
    assert.equal(next.holder.agent, 'agent-b');
  });

  it('refuses to release a lock held by another agent', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs), NOW);
    assert.equal(await bowOut(ENVELOPE, 'agent-b', 'OPERATOR', opts(fs)), false);
    assert.equal((await currentHolder(ENVELOPE, 'OPERATOR', opts(fs)))?.agent, 'agent-a');
  });

  it('reports false when there is no lock to release', async () => {
    const fs = memoryFs();
    assert.equal(await bowOut(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs)), false);
  });
});

describe('stale reclamation — implicit bow-out', () => {
  const LATER = '2026-04-08T15:00:00Z';

  it('reclaims a lock older than the stale window', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'dead-agent', 'OPERATOR', opts(fs, 60_000), NOW);
    const outcome = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', opts(fs, 60_000), LATER);
    assert.ok(outcome.elected);
    assert.equal(outcome.holder.agent, 'agent-b');
  });

  it('leaves a fresh lock alone', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs, 3_600_000), NOW);
    const outcome = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', opts(fs, 3_600_000), LATER);
    assert.ok(!outcome.elected);
  });

  it('never reclaims when reclamation is disabled', async () => {
    const fs = memoryFs();
    await standForElection(ENVELOPE, 'dead-agent', 'OPERATOR', opts(fs, null), NOW);
    const outcome = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', opts(fs, null), LATER);
    assert.ok(!outcome.elected);
  });
});

describe('corrupt lockfile', () => {
  it('does not strand a constituency forever', async () => {
    const fs = memoryFs();
    fs.files.set(lockPath('/locks', 'session-1', 'OPERATOR'), '{ not json');
    const outcome = await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs, 1), NOW);
    assert.ok(outcome.elected, 'a corrupt lock must be reclaimable');
  });

  it('is reclaimable even with reclamation disabled — waiting cannot repair it', async () => {
    const fs = memoryFs();
    fs.files.set(lockPath('/locks', 'session-1', 'OPERATOR'), '{ not json');
    const outcome = await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs, null), NOW);
    assert.ok(outcome.elected);
  });

  it('treats a well-formed but agentless lock as corrupt', async () => {
    const fs = memoryFs();
    fs.files.set(lockPath('/locks', 'session-1', 'OPERATOR'), '{"role":"OPERATOR"}');
    const outcome = await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', opts(fs, null), NOW);
    assert.ok(outcome.elected, 'a lock naming no agent cannot be deferred to');
  });
});

describe('real filesystem — atomicity', () => {
  it('elects exactly one winner among concurrent contenders', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-election-'));
    try {
      const options = opts(nodeLockFs, null);
      const withDir: ElectionOptions = { ...options, lockDir: dir };

      const agents = Array.from({ length: 25 }, (_, i) => `agent-${i}`);
      const outcomes = await Promise.all(
        agents.map((agent) =>
          standForElection(ENVELOPE, agent, 'OPERATOR', withDir, NOW),
        ),
      );

      const winners = outcomes.filter((o) => o.elected);
      assert.equal(winners.length, 1, `expected exactly 1 winner, got ${winners.length}`);

      const holder = await currentHolder(ENVELOPE, 'OPERATOR', withDir);
      assert.ok(holder);
      assert.ok(agents.includes(holder.agent));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('hands off cleanly after a real bow-out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-election-'));
    try {
      const withDir: ElectionOptions = { fs: nodeLockFs, lockDir: dir, staleAfterMs: null };
      const first = await standForElection(ENVELOPE, 'agent-a', 'OPERATOR', withDir, NOW);
      assert.ok(first.elected);

      const blocked = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', withDir, NOW);
      assert.ok(!blocked.elected);

      assert.ok(await bowOut(ENVELOPE, 'agent-a', 'OPERATOR', withDir));

      const second = await standForElection(ENVELOPE, 'agent-b', 'OPERATOR', withDir, NOW);
      assert.ok(second.elected);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
