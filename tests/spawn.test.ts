import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

import { isAvailable, spawnAgent } from '../src/spawn.ts';
import type { AgentSpec } from '../src/agents.ts';

/** A stand-in agent backed by a real binary, so spawning is genuinely exercised. */
const echoAgent: AgentSpec = {
  id: 'test-echo',
  label: 'echo',
  command: 'echo',
  prompt: { kind: 'positional' },
  auth_local: 'api_key',
  auth_headless: 'api_key',
  stdio_json: false,
  notes: 'test double',
};

const failingAgent: AgentSpec = { ...echoAgent, id: 'test-false', command: 'false' };
const missingAgent: AgentSpec = { ...echoAgent, id: 'test-missing', command: 'politik-no-such-binary' };
const sleepAgent: AgentSpec = {
  ...echoAgent,
  id: 'test-sleep',
  command: 'sleep',
};

describe('spawning a real process', () => {
  it('captures stdout and reports success', async () => {
    const result = await spawnAgent(echoAgent, 'hello from the floor', { cwd: tmpdir() });
    assert.ok(result.ok);
    assert.equal(result.exit_code, 0);
    assert.match(result.stdout, /hello from the floor/);
    assert.equal(result.agent, 'test-echo');
    assert.ok(!result.timed_out);
  });

  it('passes the prompt as a single argument, unsplit', async () => {
    const result = await spawnAgent(echoAgent, 'one   two", three', { cwd: tmpdir() });
    assert.match(result.stdout, /one {3}two", three/);
  });

  it('does not interpret shell metacharacters', async () => {
    const result = await spawnAgent(echoAgent, 'safe; echo PWNED', { cwd: tmpdir() });
    assert.match(result.stdout, /safe; echo PWNED/);
    // If a shell had run, "PWNED" would appear on its own line.
    assert.equal(result.stdout.trim().split('\n').length, 1);
  });

  it('treats a non-zero exit as a result, not an exception', async () => {
    const result = await spawnAgent(failingAgent, 'x', { cwd: tmpdir() });
    assert.ok(!result.ok);
    assert.equal(result.exit_code, 1);
  });

  it('rejects when the command does not exist', async () => {
    await assert.rejects(() => spawnAgent(missingAgent, 'x', { cwd: tmpdir() }));
  });

  it('reports elapsed time for the LEDGER', async () => {
    let t = 1000;
    const result = await spawnAgent(echoAgent, 'x', {
      cwd: tmpdir(),
      clock: () => (t += 250),
    });
    assert.equal(result.elapsed_ms, 250);
  });
});

describe('timeout', () => {
  it('kills an agent that hangs and flags it', async () => {
    const result = await spawnAgent(sleepAgent, '30', {
      cwd: tmpdir(),
      timeout_ms: 150,
    });
    assert.ok(result.timed_out, 'expected the agent to be timed out');
    assert.ok(!result.ok, 'a timed-out agent must not report success');
  });

  it('does not fire for an agent that finishes in time', async () => {
    const result = await spawnAgent(echoAgent, 'quick', {
      cwd: tmpdir(),
      timeout_ms: 30_000,
    });
    assert.ok(!result.timed_out);
    assert.ok(result.ok);
  });
});

describe('availability probe', () => {
  it('finds a command that exists', async () => {
    assert.equal(await isAvailable(echoAgent, spawn), true);
  });

  it('reports a missing command as unavailable rather than throwing', async () => {
    assert.equal(await isAvailable(missingAgent, spawn), false);
  });
});
