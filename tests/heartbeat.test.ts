import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HeartbeatError,
  checkHeartbeat,
  lastSnapshot,
  markStale,
  resume,
  snapshot,
} from '../src/heartbeat.ts';
import { appendEntry } from '../src/hansard.ts';
import { createState } from '../src/state.ts';

const CONVENED = createState({
  session_guid: 'hb',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const BASE = '# HANSARD\n\n---\n';

const withBeat = (at: string): string =>
  appendEntry(BASE, {
    type: 'MOTION_TABLED',
    at,
    actor: 'alpha',
    role: 'OPERATOR',
  });

describe('heartbeat', () => {
  it('reads the last Hansard entry as the beat', () => {
    const check = checkHeartbeat(withBeat('2026-04-08T14:00:00Z'), 4, '2026-04-08T15:00:00Z');
    assert.ok(!check.stale);
    assert.equal(check.last_beat, '2026-04-08T14:00:00Z');
    assert.ok((check.hours_since ?? 0) - 1 < 1e-6);
  });

  it('goes stale at the timeout', () => {
    const check = checkHeartbeat(withBeat('2026-04-08T14:00:00Z'), 4, '2026-04-08T18:00:00Z');
    assert.ok(check.stale);
    assert.match(check.reason, /no Hansard commit/);
  });

  it('is not stale one minute short', () => {
    assert.ok(!checkHeartbeat(withBeat('2026-04-08T14:00:00Z'), 4, '2026-04-08T17:59:00Z').stale);
  });

  it('never calls an empty record stale — it has not started, not gone quiet', () => {
    const check = checkHeartbeat(BASE, 4, '2027-01-01T00:00:00Z');
    assert.ok(!check.stale);
    assert.equal(check.last_beat, null);
  });

  it('declines to declare staleness on unreadable timestamps', () => {
    const check = checkHeartbeat(withBeat('not-a-date'), 4, '2026-04-08T18:00:00Z');
    assert.ok(!check.stale);
  });
});

describe('marking stale', () => {
  const stale = () => checkHeartbeat(withBeat('2026-04-08T14:00:00Z'), 4, '2026-04-08T20:00:00Z');

  it('moves the session to STALE with no suspension cause', () => {
    const result = markStale(stale(), '2026-04-08T20:00:00Z', CONVENED, withBeat('2026-04-08T14:00:00Z'));
    assert.equal(result.state.state, 'STALE');
    // ADR-0003: STALE is a state, not a suspension cause.
    assert.equal(result.state.suspension, null);
  });

  it('attributes the record to RECORD, not to an actor', () => {
    const result = markStale(stale(), '2026-04-08T20:00:00Z', CONVENED, withBeat('2026-04-08T14:00:00Z'));
    assert.equal(result.entry.actor, 'RECORD');
    assert.equal(result.entry.type, 'SESSION_STALE');
  });

  it('refuses when the session is not actually stale', () => {
    const fresh = checkHeartbeat(withBeat('2026-04-08T14:00:00Z'), 4, '2026-04-08T15:00:00Z');
    assert.throws(() => markStale(fresh, '2026-04-08T15:00:00Z', CONVENED, BASE), HeartbeatError);
  });

  it('refuses to mark a non-CONVENED session stale', () => {
    const suspended = createState({
      ...CONVENED,
      state: 'SUSPENDED',
      updated_at: '2026-04-08T14:00:00Z',
      suspension: { cause: 'POINT_OF_ORDER', since: '2026-04-08T14:00:00Z', record_ref: null, escalation_ref: null },
    });
    assert.throws(() => markStale(stale(), '2026-04-08T20:00:00Z', suspended, BASE), HeartbeatError);
  });
});

describe('snapshots', () => {
  const data = {
    completed: ['Charter agreed', 'motion-001 enacted'],
    in_flight: ['bravo drafting tests'],
    pending: ['motion-002'],
    blocked: [],
    cost_usd: 2.14,
    max_cost_usd: 5,
    motions: 8,
    max_motions: 20,
  };

  it('uses H3 inside the body — H2 is the entry delimiter (ADR-0005 ruling 1)', () => {
    // A body using H2 splits its own entry when the record is read back.
    const result = snapshot(data, '2026-04-08T14:00:00Z', CONVENED, BASE);
    assert.ok(!/^## /m.test(result.entry.body ?? ''), 'body must not use H2');
    assert.match(result.entry.body ?? '', /^### Completed/m);
  });

  it('records the full picture', () => {
    const result = snapshot(data, '2026-04-08T14:00:00Z', CONVENED, BASE);
    assert.equal(result.entry.type, 'STATE_SNAPSHOT');
    assert.equal(result.entry.fields?.['Completed'], '2');
    assert.match(result.entry.body ?? '', /Charter agreed/);
    assert.match(result.entry.body ?? '', /\$2\.1400 of \$5\.00 ceiling/);
  });

  it('omits empty sections rather than printing headings with nothing under them', () => {
    const result = snapshot(data, '2026-04-08T14:00:00Z', CONVENED, BASE);
    assert.ok(!(result.entry.body ?? '').includes('### Blocked'));
  });

  it('is retrievable as the latest snapshot', () => {
    let h = snapshot(data, '2026-04-08T14:00:00Z', CONVENED, BASE).hansard;
    h = snapshot({ ...data, completed: ['later'] }, '2026-04-08T22:00:00Z', CONVENED, h).hansard;
    const latest = lastSnapshot(h);
    assert.ok(latest);
    assert.match(latest, /later/);
  });

  it('returns null when no snapshot exists', () => {
    assert.equal(lastSnapshot(BASE), null);
  });
});

describe('resume', () => {
  const staleState = createState({ ...CONVENED, state: 'STALE', updated_at: '2026-04-08T20:00:00Z' });

  it('brings a STALE proceeding back to CONVENED', () => {
    const result = resume('2026-04-08T21:00:00Z', 'speaker', staleState, BASE);
    assert.equal(result.state.state, 'CONVENED');
    assert.equal(result.entry.type, 'SESSION_RESUMED');
  });

  it('refuses to resume a SUSPENDED proceeding — that would route around governance', () => {
    for (const cause of ['POINT_OF_ORDER', 'CONSTITUTIONAL_CRISIS', 'SPEAKER_ORDER'] as const) {
      const suspended = createState({
        ...CONVENED,
        state: 'SUSPENDED',
        updated_at: '2026-04-08T20:00:00Z',
        suspension: { cause, since: '2026-04-08T20:00:00Z', record_ref: null, escalation_ref: null },
      });
      assert.throws(
        () => resume('2026-04-08T21:00:00Z', 'speaker', suspended, BASE),
        /do not resume around it/,
        `${cause} must not be resumable`,
      );
    }
  });

  it('refuses to resume a PROROGUED proceeding', () => {
    const done = createState({ ...CONVENED, state: 'PROROGUED', updated_at: '2026-04-08T20:00:00Z' });
    assert.throws(() => resume('2026-04-08T21:00:00Z', 'speaker', done, BASE), HeartbeatError);
  });

  it('names the snapshot as the resumption point when one exists', () => {
    const h = snapshot(
      { completed: [], in_flight: [], pending: [], blocked: [], cost_usd: 0, max_cost_usd: null, motions: 0, max_motions: null },
      '2026-04-08T19:00:00Z',
      CONVENED,
      BASE,
    ).hansard;
    const result = resume('2026-04-08T21:00:00Z', 'speaker', staleState, h);
    assert.match(result.entry.fields?.['Resumed from'] ?? '', /STATE_SNAPSHOT/);
  });
});
