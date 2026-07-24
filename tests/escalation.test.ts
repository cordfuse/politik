import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RulingError,
  commitRuling,
  escalationPath,
  faultEntry,
  fileEscalation,
  rulingPath,
} from '../src/escalation.ts';
import { createState } from '../src/state.ts';
import { lastEntry, parseEntries } from '../src/hansard.ts';

const CONVENED = createState({
  session_guid: 'session-1',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const HANSARD = '# HANSARD\n\n---\n';

const FILED = fileEscalation(
  {
    sequence: 1,
    at: '2026-04-08T14:15:00Z',
    actor: 'MEMBER-1',
    role: 'MEMBER',
    title: 'Ambiguous mandate on schema migration',
    body: 'The Charter does not say whether destructive migrations require a Division.',
    state: CONVENED,
  },
  HANSARD,
);

describe('paths', () => {
  it('names the escalation by timestamp', () => {
    assert.equal(escalationPath('2026-04-08T14:15:00Z'), 'escalations/2026-04-08T141500Z.md');
  });

  it('zero-pads the ruling sequence', () => {
    assert.equal(rulingPath(1), 'escalations/ruling-001.md');
    assert.equal(rulingPath(42), 'escalations/ruling-042.md');
  });
});

describe('filing a Point of Order', () => {
  it('writes the escalation file', () => {
    assert.equal(FILED.files.length, 1);
    assert.equal(FILED.files[0]?.path, 'escalations/2026-04-08T141500Z.md');
    assert.match(FILED.files[0]?.content ?? '', /# POINT OF ORDER/);
    assert.match(FILED.files[0]?.content ?? '', /\*\*Filed by:\*\* MEMBER-1 \(MEMBER\)/);
  });

  it('tells the filer where the ruling will land', () => {
    assert.match(FILED.files[0]?.content ?? '', /escalations\/ruling-001\.md/);
  });

  it('suspends the session with cause POINT_OF_ORDER', () => {
    assert.equal(FILED.state.state, 'SUSPENDED');
    assert.equal(FILED.state.suspension?.cause, 'POINT_OF_ORDER');
    assert.equal(FILED.state.suspension?.escalation_ref, FILED.escalation_path);
  });

  it('preserves quorum and session identity across the suspension', () => {
    assert.equal(FILED.state.session_guid, 'session-1');
    assert.deepEqual(FILED.state.quorum, { required: 2, present: 2 });
  });

  it('records the escalation in the Hansard, attributed', () => {
    const entry = lastEntry(FILED.hansard);
    assert.equal(entry?.type, 'POINT_OF_ORDER');
    assert.equal(entry?.actor, 'MEMBER-1');
    assert.equal(entry?.fields['Session status'], 'SUSPENDED — awaiting Speaker ruling');
  });

  it('builds a Speaker notification naming the ruling path', () => {
    assert.match(FILED.notification, /A Point of Order has been raised/);
    assert.match(FILED.notification, /escalations\/ruling-001\.md/);
    assert.match(FILED.notification, /Session is paused/);
  });
});

describe('ruling', () => {
  const ruling = commitRuling(
    {
      sequence: 1,
      at: '2026-04-08T15:00:00Z',
      actor: 'speaker',
      role: 'AUTHORITY',
      outcome: 'UPHELD',
      body: 'Destructive migrations require a Division. Charter amended next session.',
      escalation_path: FILED.escalation_path,
      state: FILED.state,
    },
    FILED.hansard,
  );

  it('writes the ruling file', () => {
    assert.equal(ruling.ruling_path, 'escalations/ruling-001.md');
    assert.match(ruling.files[0]?.content ?? '', /# RULING 001 — UPHELD/);
    assert.match(ruling.files[0]?.content ?? '', /\*\*Ruled by:\*\* speaker \(AUTHORITY\)/);
  });

  it('resumes the session', () => {
    assert.equal(ruling.state.state, 'CONVENED');
    assert.equal(ruling.state.suspension, null);
  });

  it('records the ruling permanently in the Hansard', () => {
    const entry = lastEntry(ruling.hansard);
    assert.equal(entry?.type, 'RULING');
    assert.equal(entry?.fields['Outcome'], 'UPHELD');
  });

  it('keeps the original escalation entry — the record is append-only', () => {
    const types = parseEntries(ruling.hansard).map((e) => e.type);
    assert.deepEqual(types, ['POINT_OF_ORDER', 'RULING']);
  });

  it('accepts every documented outcome', () => {
    for (const outcome of ['UPHELD', 'REVERSED', 'NOTED'] as const) {
      const result = commitRuling(
        {
          sequence: 2,
          at: '2026-04-08T15:00:00Z',
          actor: 'speaker',
          role: 'AUTHORITY',
          outcome,
          body: 'x',
          escalation_path: FILED.escalation_path,
          state: FILED.state,
        },
        FILED.hansard,
      );
      assert.match(result.files[0]?.content ?? '', new RegExp(outcome));
    }
  });
});

describe('constitutional constraints on ruling', () => {
  const base = {
    sequence: 1,
    at: '2026-04-08T15:00:00Z',
    actor: 'agent',
    outcome: 'UPHELD',
    body: 'x',
    escalation_path: FILED.escalation_path,
    state: FILED.state,
  } as const;

  it('refuses a ruling from anyone but AUTHORITY', () => {
    for (const role of ['DELEGATE', 'OPERATOR', 'MEMBER', 'OBSERVER'] as const) {
      assert.throws(
        () => commitRuling({ ...base, role }, FILED.hansard),
        RulingError,
        `${role} must not be able to rule`,
      );
    }
  });

  it('refuses to rule on a session that is not suspended', () => {
    assert.throws(
      () => commitRuling({ ...base, role: 'AUTHORITY', state: CONVENED }, FILED.hansard),
      /expected SUSPENDED/,
    );
  });

  it('refuses to lift a suspension raised for a different cause', () => {
    const crisis = createState({
      session_guid: 'session-1',
      protocol: 'parliamentary',
      state: 'SUSPENDED',
      quorum: { required: 2, present: 2 },
      updated_at: '2026-04-08T14:30:00Z',
      suspension: {
        cause: 'CONSTITUTIONAL_CRISIS',
        since: '2026-04-08T14:30:00Z',
        record_ref: null,
        escalation_ref: null,
      },
    });
    assert.throws(
      () => commitRuling({ ...base, role: 'AUTHORITY', state: crisis }, FILED.hansard),
      /CONSTITUTIONAL_CRISIS/,
    );
  });
});

describe('fault records', () => {
  it('renders the RUNTIME.md SESSION_FAULT shape', () => {
    const entry = faultEntry({
      at: '2026-04-08T14:04:00Z',
      actor: 'OPERATOR-1',
      role: 'OPERATOR',
      action_attempted: 'Deploy authentication module to staging',
      fault_type: 'FAULT_INFRA',
      fault_detail: 'GitHub Secret STAGING_API_KEY not found',
      actor_penalised: false,
      resolution_path: 'PATH_B',
    });
    assert.equal(entry.type, 'SESSION_FAULT');
    assert.equal(entry.fields?.['Fault type'], 'FAULT_INFRA');
    assert.match(entry.fields?.['Actor penalised'] ?? '', /actor blameless/);
  });

  it('escalates PATH_C to SESSION_FAULT_CRITICAL', () => {
    const entry = faultEntry({
      at: '2026-04-08T14:04:00Z',
      actor: 'OPERATOR-1',
      role: 'OPERATOR',
      action_attempted: 'rebase',
      fault_type: 'FAULT_INFRA — CRITICAL',
      fault_detail: 'history corrupted',
      actor_penalised: true,
      resolution_path: 'PATH_C',
    });
    assert.equal(entry.type, 'SESSION_FAULT_CRITICAL');
    assert.equal(entry.fields?.['Actor penalised'], 'Yes');
  });
});
