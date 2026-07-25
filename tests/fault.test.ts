import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FAULT_HANDLING,
  autoResolvedRecord,
  classify,
  faultRecord,
  isAutoRecoverable,
  shouldRetry,
} from '../src/fault.ts';
import type { SpawnResult } from '../src/spawn.ts';

const failure = (over: Partial<SpawnResult> = {}): SpawnResult => ({
  agent: 'claude-code',
  ok: false,
  exit_code: 1,
  stdout: '',
  stderr: '',
  elapsed_ms: 100,
  timed_out: false,
  ...over,
});

describe('classification', () => {
  it('treats a rate limit as transient and retryable', () => {
    const c = classify(failure({ stderr: 'Error: 429 rate limit exceeded' }));
    assert.equal(c.path, 'PATH_A');
    assert.equal(c.fault_type, 'FAULT_EXTERNAL');
    assert.ok(!c.actor_penalised);
  });

  it('treats a 503 as transient', () => {
    assert.equal(classify(failure({ stderr: '503 Service Unavailable' })).path, 'PATH_A');
  });

  it('treats a socket failure as transient', () => {
    assert.equal(classify(failure({ stderr: 'ECONNRESET' })).path, 'PATH_A');
  });

  it('treats a timeout as transient', () => {
    assert.equal(classify(failure({ timed_out: true })).path, 'PATH_A');
  });

  it('routes credentials to a human — retrying never fixes a bad secret', () => {
    const c = classify(failure({ stderr: '401 Unauthorized: invalid credentials' }));
    assert.equal(c.path, 'PATH_B');
    assert.equal(c.fault_type, 'FAULT_INFRA');
    assert.ok(!c.actor_penalised);
  });

  it('routes corruption to PATH_C', () => {
    const c = classify(failure({ stderr: 'fatal: history rewritten, repository corrupt' }));
    assert.equal(c.path, 'PATH_C');
  });

  it('checks critical damage before transient signals', () => {
    // A corrupt repo that also mentions a timeout is still corrupt.
    const c = classify(failure({ stderr: 'timed out; repository corrupt' }));
    assert.equal(c.path, 'PATH_C');
  });

  it('checks transient signals before infrastructure ones', () => {
    // Rate-limit responses routinely mention authentication in the body.
    const c = classify(failure({ stderr: '429 too many requests (authentication ok)' }));
    assert.equal(c.path, 'PATH_A');
  });

  it('never blames the actor for an unclassified failure', () => {
    // The exact injustice this module exists to prevent.
    const c = classify(failure({ stderr: 'something went wrong' }));
    assert.equal(c.fault_type, 'FAULT_AMBIGUOUS');
    assert.ok(!c.actor_penalised);
    assert.equal(c.path, 'PATH_B');
  });

  it('penalises no actor in any classification path', () => {
    for (const stderr of ['429', '401', 'corrupt', 'mystery']) {
      assert.ok(!classify(failure({ stderr })).actor_penalised, stderr);
    }
  });
});

describe('retry policy', () => {
  const transient = classify(failure({ stderr: '429 rate limit' }));
  const infra = classify(failure({ stderr: '401 unauthorized' }));

  it('retries a transient fault within the budget', () => {
    const d = shouldRetry(transient, 1, DEFAULT_FAULT_HANDLING);
    assert.ok(d.retry);
    assert.equal(d.delay_ms, 5 * 60_000);
  });

  it('stops at the retry ceiling and escalates to PATH_B', () => {
    const d = shouldRetry(transient, 3, DEFAULT_FAULT_HANDLING);
    assert.ok(!d.retry);
    assert.match(d.reason, /exhausted/);
    assert.match(d.reason, /PATH_B/);
  });

  it('never retries a fault a human must fix', () => {
    assert.ok(!shouldRetry(infra, 1, DEFAULT_FAULT_HANDLING).retry);
    assert.ok(!isAutoRecoverable(infra));
  });

  it('honours a Charter that disables retry', () => {
    const d = shouldRetry(transient, 1, { ...DEFAULT_FAULT_HANDLING, auto_retry_max: 0 });
    assert.ok(!d.retry);
  });

  it('honours a Charter delay of zero', () => {
    const d = shouldRetry(transient, 1, { ...DEFAULT_FAULT_HANDLING, auto_retry_delay_minutes: 0 });
    assert.ok(d.retry);
    assert.equal(d.delay_ms, 0);
  });
});

describe('records', () => {
  it('records attribution and the resolution path', () => {
    const entry = faultRecord({
      at: '2026-04-08T14:00:00Z',
      actor: 'minister-alpha',
      role: 'OPERATOR',
      action: 'spawn claude-code',
      classification: classify(failure({ stderr: '429 rate limit' })),
      attempt: 1,
      of: 3,
    });
    assert.equal(entry.type, 'SESSION_FAULT');
    assert.equal(entry.fields?.['Resolution path'], 'PATH_A');
    assert.match(entry.fields?.['Actor penalised'] ?? '', /^No/);
    assert.equal(entry.fields?.['Attempt'], '1 of 3');
    assert.equal(entry.fields?.['Auto retry'], 'true');
  });

  it('uses the critical record type for PATH_C', () => {
    const entry = faultRecord({
      at: '2026-04-08T14:00:00Z',
      actor: 'a',
      role: 'OPERATOR',
      action: 'x',
      classification: classify(failure({ stderr: 'repository corrupt' })),
    });
    assert.equal(entry.type, 'SESSION_FAULT_CRITICAL');
  });

  it('records an auto-resolution so the fault does not read as unresolved', () => {
    const entry = autoResolvedRecord('2026-04-08T14:00:00Z', 'a', 'OPERATOR', 3);
    assert.equal(entry.type, 'FAULT_RESOLVED_AUTO');
    assert.match(entry.fields?.['Resolution'] ?? '', /attempt 3/);
    assert.match(entry.fields?.['Speaker intervention'] ?? '', /none/);
  });
});
