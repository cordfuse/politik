import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ProrogationError,
  checkTermination,
  lastStanding,
  prorogue,
  type Ceilings,
} from '../src/prorogation.ts';
import { createState } from '../src/state.ts';
import { hire } from '../src/actors.ts';
import { lastEntry, parseEntries } from '../src/hansard.ts';

const NONE: Ceilings = {
  max_motions: null,
  deadline: null,
  max_cost_usd: null,
};

const ALL: Ceilings = {
  max_motions: 20,
  deadline: '2026-04-30T17:00:00Z',
  max_cost_usd: 5,
  cost_warning_usd: 4,
};

const totals = (over: Partial<{ motions: number; total_cost_usd: number; now: string }> = {}) => ({
  motions: 0,
  total_cost_usd: 0,
  now: '2026-04-08T14:00:00Z',
  ...over,
});

const CONVENED = createState({
  session_guid: 'session-1',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const HANSARD = '# HANSARD\n\n---\n';

describe('no ceilings configured', () => {
  it('never terminates on its own', () => {
    const check = checkTermination(NONE, totals({ motions: 9999, total_cost_usd: 9999 }));
    assert.ok(!check.terminate);
    assert.equal(check.trigger, null);
  });

  it('still terminates on DISSOLVE', () => {
    const check = checkTermination(NONE, totals(), true);
    assert.ok(check.terminate);
    assert.equal(check.trigger, 'TRIGGER_SPEAKER');
  });

  it('reports unconfigured conditions as such', () => {
    const check = checkTermination(NONE, totals());
    const turns = check.conditions.find((c) => c.trigger === 'TRIGGER_TURNS');
    assert.ok(!turns?.configured);
    assert.equal(turns?.detail, 'not configured');
  });
});

describe('individual triggers', () => {
  it('fires TRIGGER_TURNS at the motion ceiling', () => {
    assert.equal(checkTermination(ALL, totals({ motions: 20 })).trigger, 'TRIGGER_TURNS');
  });

  it('does not fire one motion short', () => {
    assert.ok(!checkTermination(ALL, totals({ motions: 19 })).terminate);
  });

  it('fires TRIGGER_DEADLINE at the wall clock', () => {
    const check = checkTermination(ALL, totals({ now: '2026-05-01T00:00:00Z' }));
    assert.equal(check.trigger, 'TRIGGER_DEADLINE');
  });

  it('fires TRIGGER_COST at the ceiling', () => {
    assert.equal(checkTermination(ALL, totals({ total_cost_usd: 5 })).trigger, 'TRIGGER_COST');
  });

  it('fires TRIGGER_SPEAKER on DISSOLVE', () => {
    assert.equal(checkTermination(ALL, totals(), true).trigger, 'TRIGGER_SPEAKER');
  });
});

describe('first-one-wins', () => {
  it('names one trigger even when several fired', () => {
    const check = checkTermination(ALL, totals({ motions: 50, total_cost_usd: 99 }), true);
    assert.equal(check.trigger, 'TRIGGER_TURNS');
    assert.equal(check.conditions.filter((c) => c.fired).length, 3);
  });

  it('reports the state of every condition, fired or not', () => {
    const check = checkTermination(ALL, totals({ motions: 20 }));
    assert.equal(check.conditions.length, 4);
    for (const condition of check.conditions) {
      assert.ok(condition.detail.length > 0, `${condition.trigger} has no detail`);
    }
  });
});

describe('cost warning', () => {
  it('fires between the warning line and the ceiling', () => {
    const check = checkTermination(ALL, totals({ total_cost_usd: 4.5 }));
    assert.ok(check.cost_warning);
    assert.ok(!check.terminate, 'a warning must not terminate the session');
  });

  it('does not fire below the warning line', () => {
    assert.ok(!checkTermination(ALL, totals({ total_cost_usd: 3.99 })).cost_warning);
  });

  it('gives way to the ceiling once reached', () => {
    const check = checkTermination(ALL, totals({ total_cost_usd: 5 }));
    assert.ok(!check.cost_warning);
    assert.ok(check.terminate);
  });
});

describe('prorogation', () => {
  const check = checkTermination(ALL, totals({ motions: 20 }));
  const result = prorogue(
    {
      at: '2026-04-09T21:12:00Z',
      actor: 'RECORD',
      role: 'OPERATOR',
      trigger: 'TRIGGER_TURNS',
      state: CONVENED,
      check,
      summary: 'Authentication refactor delivered. Three motions carried.',
      milestone_id: '7',
    },
    HANSARD,
  );

  it('moves the session to PROROGUED', () => {
    assert.equal(result.state.state, 'PROROGUED');
    assert.equal(result.state.suspension, null);
  });

  it('records every condition in the SESSION_TIMEOUT entry', () => {
    const entry = lastEntry(result.hansard);
    assert.equal(entry?.type, 'SESSION_TIMEOUT');
    assert.equal(entry?.fields['Trigger'], 'TRIGGER_TURNS');
    assert.match(entry?.fields['TRIGGER_TURNS'] ?? '', /^FIRED/);
    assert.match(entry?.fields['TRIGGER_COST'] ?? '', /^not met/);
    assert.match(entry?.fields['TRIGGER_SPEAKER'] ?? '', /^not met/);
  });

  it('writes a summary for the parent layer', () => {
    assert.equal(result.files[0]?.path, 'SUMMARY.md');
    assert.match(result.files[0]?.content ?? '', /Authentication refactor delivered/);
  });

  it('surfaces the milestone for the caller to close', () => {
    assert.equal(result.milestone_to_close, '7');
  });

  it('omits the summary file when none is supplied', () => {
    const bare = prorogue(
      { at: '2026-04-09T21:12:00Z', actor: 'RECORD', role: 'OPERATOR', trigger: 'TRIGGER_COST', state: CONVENED },
      HANSARD,
    );
    assert.equal(bare.files.length, 0);
    assert.equal(bare.milestone_to_close, null);
  });

  it('appends rather than rewriting the Hansard', () => {
    assert.ok(result.hansard.startsWith(HANSARD));
  });
});

describe('constraints', () => {
  const base = {
    at: '2026-04-09T21:12:00Z',
    actor: 'agent',
    trigger: 'TRIGGER_SPEAKER',
    state: CONVENED,
  } as const;

  it('refuses DISSOLVE from anyone but AUTHORITY', () => {
    for (const role of ['DELEGATE', 'OPERATOR', 'MEMBER', 'OBSERVER'] as const) {
      assert.throws(() => prorogue({ ...base, role }, HANSARD), ProrogationError);
    }
  });

  it('permits AUTHORITY to dissolve', () => {
    const result = prorogue({ ...base, role: 'AUTHORITY' }, HANSARD);
    assert.equal(result.state.state, 'PROROGUED');
  });

  it('permits an engine trigger from a non-AUTHORITY actor', () => {
    const result = prorogue(
      { ...base, role: 'OPERATOR', trigger: 'TRIGGER_COST' },
      HANSARD,
    );
    assert.equal(result.state.state, 'PROROGUED');
  });

  it('refuses to prorogue an already-prorogued session', () => {
    const sealed = createState({
      session_guid: 'session-1',
      protocol: 'parliamentary',
      state: 'PROROGUED',
      quorum: { required: 2, present: 2 },
      updated_at: '2026-04-09T21:12:00Z',
    });
    assert.throws(
      () => prorogue({ ...base, role: 'AUTHORITY', state: sealed }, HANSARD),
      /already prorogued/,
    );
  });

  it('refuses to prorogue a session in CONSTITUTIONAL_CRISIS', () => {
    const captured = createState({
      session_guid: 'session-1',
      protocol: 'parliamentary',
      state: 'SUSPENDED',
      quorum: { required: 2, present: 2 },
      updated_at: '2026-04-09T20:00:00Z',
      suspension: {
        cause: 'CONSTITUTIONAL_CRISIS',
        since: '2026-04-09T20:00:00Z',
        record_ref: null,
        escalation_ref: null,
      },
    });
    assert.throws(
      () => prorogue({ ...base, role: 'AUTHORITY', state: captured }, HANSARD),
      /cannot be prorogued/,
    );
  });

  it('still allows a suspended session to be prorogued for ordinary causes', () => {
    const paused = createState({
      session_guid: 'session-1',
      protocol: 'parliamentary',
      state: 'SUSPENDED',
      quorum: { required: 2, present: 2 },
      updated_at: '2026-04-09T20:00:00Z',
      suspension: {
        cause: 'POINT_OF_ORDER',
        since: '2026-04-09T20:00:00Z',
        record_ref: null,
        escalation_ref: null,
      },
    });
    const result = prorogue({ ...base, role: 'AUTHORITY', state: paused }, HANSARD);
    assert.equal(result.state.state, 'PROROGUED');
  });
});

describe('sealed record', () => {
  it('preserves prior entries through prorogation', () => {
    const withEntry = prorogue(
      { at: '2026-04-09T21:12:00Z', actor: 'speaker', role: 'AUTHORITY', trigger: 'TRIGGER_SPEAKER', state: CONVENED },
      HANSARD,
    );
    const again = prorogue(
      { at: '2026-04-09T21:13:00Z', actor: 'speaker', role: 'AUTHORITY', trigger: 'TRIGGER_SPEAKER', state: CONVENED },
      withEntry.hansard,
    );
    assert.equal(parseEntries(again.hansard).length, 2);
    assert.ok(again.hansard.startsWith(withEntry.hansard));
  });
});

describe('termination: last-standing (ADR-0007)', () => {
  const CONVENED = createState({
    session_guid: 'ls',
    protocol: 'parliamentary',
    state: 'CONVENED',
    quorum: { required: 1, present: 1 },
    updated_at: '2026-04-08T14:00:00Z',
  });
  const seat = (h: string, who: string) =>
    hire({ at: '2026-04-08T14:00:00Z', actor: 'host', role: 'AUTHORITY', state: CONVENED, subject: who, seat: 'MEMBER', reason: 'seated' }, h).hansard;
  const BASE = '# HANSARD\n\n---\n';

  it('terminates with a survivor when one seat remains', () => {
    const check = lastStanding(seat(BASE, 'solo'));
    assert.equal(check.terminate, true);
    assert.equal(check.survivor, 'solo');
  });

  it('does not terminate while two or more remain', () => {
    assert.equal(lastStanding(seat(seat(BASE, 'a'), 'b')).terminate, false);
  });

  it('terminates with no survivor when the field is empty — a mutual wipeout', () => {
    const check = lastStanding(BASE);
    assert.equal(check.terminate, true);
    assert.equal(check.survivor, null);
  });
});
