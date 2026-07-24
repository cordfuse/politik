import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATES,
  createState,
  halts,
  parseState,
  serializeState,
  toCanonState,
  toSessionState,
  validateState,
} from '../src/state.ts';

const base = {
  session_guid: 'guid',
  protocol: 'parliamentary',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:02:11Z',
} as const;

describe('state representation', () => {
  it('maps CANON codes to the ADR-0003 wire form', () => {
    assert.equal(toSessionState('STATE_CONVENED'), 'CONVENED');
    assert.equal(toSessionState('STATE_PROROGUED'), 'PROROGUED');
  });

  it('round-trips both directions', () => {
    for (const s of SESSION_STATES) {
      assert.equal(toSessionState(toCanonState(s)), s);
    }
  });

  it('halts on everything except CONVENED', () => {
    assert.ok(!halts('CONVENED'));
    for (const s of SESSION_STATES) {
      if (s === 'CONVENED') continue;
      assert.ok(halts(s), `${s} must halt agents`);
    }
  });
});

describe('construction', () => {
  it('defaults the writer to RECORD', () => {
    assert.equal(createState({ ...base, state: 'CONVENED' }).updated_by, 'RECORD');
  });

  it('serializes to parseable JSON with a trailing newline', () => {
    const text = serializeState(createState({ ...base, state: 'CONVENED' }));
    assert.ok(text.endsWith('\n'));
    assert.equal(parseState(text)?.state, 'CONVENED');
  });

  it('returns null on unreadable JSON', () => {
    assert.equal(parseState('{ not json'), null);
  });
});

describe('suspension invariant', () => {
  it('accepts SUSPENDED with a cause', () => {
    const state = createState({
      ...base,
      state: 'SUSPENDED',
      suspension: {
        cause: 'CONSTITUTIONAL_CRISIS',
        since: base.updated_at,
        record_ref: 'HANSARD.md#L482',
        escalation_ref: 'escalations/2026-04-08-001.md',
      },
    });
    assert.deepEqual(validateState(state), []);
  });

  it('rejects SUSPENDED with no cause', () => {
    const state = createState({ ...base, state: 'SUSPENDED' });
    const issues = validateState(state);
    assert.equal(issues[0]?.field, 'suspension');
  });

  it('rejects a cause attached to a running session', () => {
    const state = createState({
      ...base,
      state: 'CONVENED',
      suspension: {
        cause: 'POINT_OF_ORDER',
        since: base.updated_at,
        record_ref: null,
        escalation_ref: null,
      },
    });
    assert.match(validateState(state)[0]?.message ?? '', /must be null/);
  });

  it('rejects a non-CANON cause', () => {
    const state = createState({
      ...base,
      state: 'SUSPENDED',
      suspension: {
        cause: 'STALE_HEARTBEAT' as never,
        since: base.updated_at,
        record_ref: null,
        escalation_ref: null,
      },
    });
    assert.equal(validateState(state)[0]?.field, 'suspension.cause');
  });

  it('treats STALE as a state carrying no suspension', () => {
    assert.deepEqual(validateState(createState({ ...base, state: 'STALE' })), []);
  });
});
