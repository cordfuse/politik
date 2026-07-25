import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitTransport, NullTransport } from '../src/transport.ts';
import { parseEnvelope, type Envelope } from '../src/envelope.ts';

const envelope = (guid = 'session-1', task = 'Review motion-003.'): Envelope => {
  const result = parseEnvelope(
    `# [${guid}]\n## target-actor: OPERATOR\n## slots-remaining: 2\n## protocol: parliamentary\n## prompt: |\n  ${task}\n`,
  );
  assert.ok(result.ok);
  return result.envelope;
};

const scratch = async (): Promise<string> => mkdtemp(join(tmpdir(), 'politik-bus-'));

describe('git transport', () => {
  it('publishes and reads back a broadcast intact', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      const sent = envelope();
      const result = await bus.publish(sent);
      assert.ok(result.delivered);
      assert.match(result.ref, /\.politik\/broadcast/);

      const received = await bus.poll('session-1');
      assert.equal(received.length, 1);
      assert.deepEqual(received[0], sent);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves publication order', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      for (const task of ['first', 'second', 'third']) {
        await bus.publish(envelope('session-1', task));
      }
      const received = await bus.poll('session-1');
      assert.deepEqual(received.map((e) => e.prompt), ['first', 'second', 'third']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('routes by session — a peer never sees another session\'s business', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      await bus.publish(envelope('session-1', 'ours'));
      await bus.publish(envelope('session-2', 'theirs'));

      const mine = await bus.poll('session-1');
      assert.equal(mine.length, 1);
      assert.equal(mine[0]?.prompt, 'ours');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns nothing when the channel does not exist yet', async () => {
    const dir = await scratch();
    try {
      assert.deepEqual(await new GitTransport({ dir }).poll('session-1'), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips a corrupt broadcast rather than stopping the peer', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      await bus.publish(envelope('session-1', 'good'));

      // A peer must never be halted by a bad nudge — the repo is still there.
      const channel = join(dir, '.politik', 'broadcast');
      await mkdir(channel, { recursive: true });
      await writeFile(join(channel, 'broadcast-000009-session-1.md'), 'not an envelope', 'utf8');

      const received = await bus.poll('session-1');
      assert.equal(received.length, 1);
      assert.equal(received[0]?.prompt, 'good');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores files that are not broadcasts', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      await bus.publish(envelope());
      const channel = join(dir, '.politik', 'broadcast');
      await writeFile(join(channel, 'README.md'), 'notes', 'utf8');
      assert.equal((await bus.poll('session-1')).length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records an ack without gating anything', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir });
      const sent = envelope();
      await bus.publish(sent);
      await bus.ack(sent, 'minister-alpha');

      // The ack is advisory: polling is unaffected by who acked.
      assert.equal((await bus.poll('session-1')).length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honours a custom channel', async () => {
    const dir = await scratch();
    try {
      const bus = new GitTransport({ dir, channel: 'bus' });
      const result = await bus.publish(envelope());
      assert.match(result.ref, /^bus\//);
      assert.equal((await bus.poll('session-1')).length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('null transport', () => {
  it('carries nothing and reports as much', async () => {
    const bus = new NullTransport();
    const result = await bus.publish();
    assert.ok(!result.delivered);
    assert.deepEqual(await bus.poll(), []);
  });

  it('is a legitimate configuration, not a failure', async () => {
    // The architecture's claim is that a dropped broadcast loses nothing. That
    // has to hold when every broadcast is dropped — otherwise something has
    // become dependent on the nudge rather than on the record.
    const bus = new NullTransport();
    await assert.doesNotReject(() => bus.ack());
  });
});

describe('transport is never authoritative', () => {
  it('publishing does not touch the Hansard or state', async () => {
    const dir = await scratch();
    try {
      await new GitTransport({ dir }).publish(envelope());
      // Only the broadcast channel is written. The record is the record.
      const { readdir } = await import('node:fs/promises');
      const top = await readdir(dir);
      assert.deepEqual(top, ['.politik']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
