import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkQuorum, quorumFields } from '../src/quorum.ts';

describe('quorum on the numbers', () => {
  it('is met when present equals required', () => {
    const result = checkQuorum({ required: 2, present: 2 });
    assert.ok(result.met);
    assert.ok(!result.degraded);
  });

  it('is met when present exceeds required', () => {
    assert.ok(checkQuorum({ required: 2, present: 5 }).met);
  });

  it('fails when actors are short', () => {
    const result = checkQuorum({ required: 3, present: 2 });
    assert.ok(!result.met);
    assert.match(result.reason ?? '', /2 of 3/);
  });

  it('treats quorum 1 as an ordinary configuration', () => {
    const result = checkQuorum({ required: 1, present: 1 });
    assert.ok(result.met);
    assert.ok(!result.degraded);
  });
});

describe('quorum_override', () => {
  const valid = {
    enabled: true,
    reason: 'OPERATOR-2 constituency unavailable',
    acknowledged_by: 'AUTHORITY',
  } as const;

  it('carries a short session when AUTHORITY acknowledges it', () => {
    const result = checkQuorum({ required: 2, present: 1, override: valid });
    assert.ok(result.met);
    assert.ok(result.degraded);
    assert.equal(result.reason, 'OPERATOR-2 constituency unavailable');
  });

  it('does nothing when disabled', () => {
    const result = checkQuorum({
      required: 2,
      present: 1,
      override: { ...valid, enabled: false },
    });
    assert.ok(!result.met);
  });

  it('rejects an override with no stated reason', () => {
    const result = checkQuorum({
      required: 2,
      present: 1,
      override: { ...valid, reason: '   ' },
    });
    assert.ok(!result.met, 'an unauditable override must not carry the session');
    assert.match(result.reason ?? '', /requires an explicit/);
  });

  it('rejects acknowledgement by anyone but AUTHORITY', () => {
    for (const role of ['DELEGATE', 'OPERATOR', 'MEMBER', 'OBSERVER'] as const) {
      const result = checkQuorum({
        required: 2,
        present: 1,
        override: { ...valid, acknowledged_by: role },
      });
      assert.ok(!result.met, `${role} must not be able to acknowledge a degraded session`);
    }
  });

  it('is irrelevant when quorum is already met', () => {
    const result = checkQuorum({ required: 2, present: 2, override: valid });
    assert.ok(result.met);
    assert.ok(!result.degraded, 'a met quorum must not be reported as degraded');
  });
});

describe('hansard fields', () => {
  it('records a met quorum plainly', () => {
    const fields = quorumFields(checkQuorum({ required: 2, present: 2 }));
    assert.equal(fields['Quorum'], 'MET');
    assert.equal(fields['Degraded'], undefined);
  });

  it('makes a degraded session impossible to miss', () => {
    const fields = quorumFields(
      checkQuorum({
        required: 2,
        present: 1,
        override: { enabled: true, reason: 'stated reason', acknowledged_by: 'AUTHORITY' },
      }),
    );
    assert.match(fields['Degraded'] ?? '', /^Yes/);
    assert.equal(fields['Override reason'], 'stated reason');
  });

  it('records why a failed quorum failed', () => {
    const fields = quorumFields(checkQuorum({ required: 3, present: 1 }));
    assert.equal(fields['Quorum'], 'NOT MET');
    assert.match(fields['Reason'] ?? '', /1 of 3/);
  });
});
