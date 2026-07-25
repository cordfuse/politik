import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASCADE,
  cascadeAlerts,
  cascadeEntry,
  checkCascade,
  inheritanceEntry,
  quarantineEntry,
  resolveInheritance,
  scopeMove,
} from '../src/tree.ts';
import { parseCharter, type Charter } from '../src/charter.ts';
import { appendEntry } from '../src/hansard.ts';

const charter = (frontmatter: string): Charter => {
  const result = parseCharter(`---\ncharter_version: 1.0.0\nprotocol: parliamentary\n${frontmatter}---\n\n# Standing Orders\n`);
  assert.ok(result.ok, `charter failed to parse: ${JSON.stringify(result)}`);
  return result.charter;
};

const PARENT = charter(`session:
  quorum: 3
  escalation: enabled
  heartbeat_timeout_hours: 4
  endurance:
    max_cost_usd: 10
    max_motions: 50
minimum_cast:
  AUTHORITY: 1
  OPERATOR: 2
domain_veto:
  - OBSERVER
`);

describe('inheritance — restrictions compound', () => {
  it('lets a child tighten quorum', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  quorum: 5\n'));
    assert.equal(resolved.charter.session.quorum, 5);
    assert.ok(resolved.tightened.includes('session.quorum'));
    assert.deepEqual(resolved.violations, []);
  });

  it('refuses a child loosening quorum, and the parent value stands', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  quorum: 1\n'));
    assert.equal(resolved.charter.session.quorum, 3, 'parent quorum must stand');
    assert.ok(resolved.violations.some((v) => v.field === 'session.quorum'));
  });

  it('takes the tighter cost ceiling from either side', () => {
    const tighter = resolveInheritance(PARENT, charter('session:\n  endurance:\n    max_cost_usd: 2\n'));
    assert.equal(tighter.charter.session.endurance.max_cost_usd, 2);

    const looser = resolveInheritance(PARENT, charter('session:\n  endurance:\n    max_cost_usd: 99\n'));
    assert.equal(looser.charter.session.endurance.max_cost_usd, 10, 'a child may not raise a parent ceiling');
  });

  it('applies a parent ceiling to a child that declares none', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  quorum: 3\n'));
    assert.equal(resolved.charter.session.endurance.max_cost_usd, 10);
    assert.equal(resolved.charter.session.endurance.max_motions, 50);
  });

  it('refuses a child disabling escalation its parent permits', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  escalation: disabled\n'));
    assert.equal(resolved.charter.session.escalation, 'enabled');
    assert.ok(resolved.violations.some((v) => v.field === 'session.escalation'));
  });

  it('takes the shorter heartbeat window', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  heartbeat_timeout_hours: 24\n'));
    assert.equal(resolved.charter.session.heartbeat_timeout_hours, 4);
  });

  it('carries a parent minimum_cast the child omits', () => {
    const resolved = resolveInheritance(PARENT, charter('minimum_cast:\n  AUTHORITY: 1\n'));
    assert.equal(resolved.charter.minimum_cast.OPERATOR, 2);
  });

  it('refuses a child lowering a parent minimum_cast', () => {
    const resolved = resolveInheritance(PARENT, charter('minimum_cast:\n  AUTHORITY: 1\n  OPERATOR: 1\n'));
    assert.equal(resolved.charter.minimum_cast.OPERATOR, 2);
    assert.ok(resolved.violations.some((v) => v.field === 'minimum_cast.OPERATOR'));
  });

  it('lets a child raise a minimum_cast', () => {
    const resolved = resolveInheritance(PARENT, charter('minimum_cast:\n  AUTHORITY: 1\n  OPERATOR: 4\n'));
    assert.equal(resolved.charter.minimum_cast.OPERATOR, 4);
  });

  it('carries a parent domain veto down even when the child omits it', () => {
    // Omission is not revocation: the schema offers no way to express removal,
    // so silence must inherit rather than be read as an override attempt.
    const resolved = resolveInheritance(PARENT, charter('domain_veto: []\n'));
    assert.ok(resolved.charter.domain_veto.includes('OBSERVER'));
    assert.ok(resolved.tightened.includes('domain_veto'));
    assert.ok(!resolved.violations.some((v) => v.field === 'domain_veto'));
  });

  it('lets a child add a domain veto of its own', () => {
    const resolved = resolveInheritance(PARENT, charter('domain_veto:\n  - OBSERVER\n  - MEMBER\n'));
    assert.ok(resolved.charter.domain_veto.includes('MEMBER'));
    assert.ok(resolved.charter.domain_veto.includes('OBSERVER'));
  });

  it('nothing overrides upward — the parent is never mutated', () => {
    const before = JSON.stringify(PARENT);
    resolveInheritance(PARENT, charter('session:\n  quorum: 99\n'));
    assert.equal(JSON.stringify(PARENT), before);
  });
});

describe('inheritance record', () => {
  it('states what was overridden rather than silently correcting it', () => {
    const resolved = resolveInheritance(PARENT, charter('session:\n  quorum: 1\n'));
    const entry = inheritanceEntry(resolved, 'org/politik-sprint', '2026-04-08T14:00:00Z');
    assert.equal(entry.type, 'CHARTER_INHERITED');
    assert.match(entry.fields?.['Overridden'] ?? '', /session\.quorum/);
    assert.match(entry.body ?? '', /parent value stands/);
  });

  it('reports a clean inheritance plainly', () => {
    const entry = inheritanceEntry(
      resolveInheritance(PARENT, charter('session:\n  quorum: 3\n')),
      'parent',
      '2026-04-08T14:00:00Z',
    );
    assert.equal(entry.fields?.['Overridden'], 'nothing');
  });
});

describe('cascade detection', () => {
  const NOW = '2026-04-30T00:00:00Z';
  const fault = (node: string, signature: string, at = '2026-04-20T00:00:00Z') => ({ node, signature, at });

  it('does not alert on a single node failing repeatedly', () => {
    const alert = checkCascade(
      [fault('leaf-1', 'FAULT_INFRA:secret'), fault('leaf-1', 'FAULT_INFRA:secret')],
      NOW,
    );
    // One unlucky session is that session's problem, not a pattern.
    assert.ok(!alert.triggered);
  });

  it('alerts when the same signature appears in two siblings', () => {
    const alert = checkCascade(
      [fault('leaf-1', 'FAULT_INFRA:secret'), fault('leaf-2', 'FAULT_INFRA:secret')],
      NOW,
    );
    assert.ok(alert.triggered);
    assert.equal(alert.signature, 'FAULT_INFRA:secret');
    assert.equal(alert.nodes.length, 2);
  });

  it('does not alert on different signatures across siblings', () => {
    const alert = checkCascade(
      [fault('leaf-1', 'FAULT_INFRA:secret'), fault('leaf-2', 'FAULT_ACTOR:skill')],
      NOW,
    );
    assert.ok(!alert.triggered);
  });

  it('ignores faults outside the window', () => {
    const alert = checkCascade(
      [
        fault('leaf-1', 'sig', '2026-01-01T00:00:00Z'),
        fault('leaf-2', 'sig', '2026-01-02T00:00:00Z'),
      ],
      NOW,
    );
    assert.ok(!alert.triggered);
  });

  it('honours a custom trigger threshold', () => {
    const faults = [fault('a', 'sig'), fault('b', 'sig')];
    assert.ok(!checkCascade(faults, NOW, { trigger: 3, window_days: 30 }).triggered);
    assert.ok(checkCascade([...faults, fault('c', 'sig')], NOW, { trigger: 3, window_days: 30 }).triggered);
  });

  it('defaults to two siblings within thirty days', () => {
    assert.equal(DEFAULT_CASCADE.trigger, 2);
    assert.equal(DEFAULT_CASCADE.window_days, 30);
  });
});

describe('cascade record', () => {
  it('warns rather than blocks', () => {
    const alert = checkCascade(
      [
        { node: 'a', signature: 'sig', at: '2026-04-20T00:00:00Z' },
        { node: 'b', signature: 'sig', at: '2026-04-21T00:00:00Z' },
      ],
      '2026-04-30T00:00:00Z',
    );
    const entry = cascadeEntry(alert, '2026-04-30T00:00:00Z');
    assert.equal(entry.type, 'CASCADE_ALERT');
    assert.match(entry.fields?.['Action'] ?? '', /warn at Writ Drop/);
    assert.match(entry.body ?? '', /Speaker may proceed/);
  });

  it('refuses to record an alert that did not trigger', () => {
    assert.throws(() => cascadeEntry(checkCascade([], '2026-04-30T00:00:00Z'), '2026-04-30T00:00:00Z'));
  });

  it('is readable back off a node record', () => {
    const alert = checkCascade(
      [
        { node: 'a', signature: 'sig', at: '2026-04-20T00:00:00Z' },
        { node: 'b', signature: 'sig', at: '2026-04-21T00:00:00Z' },
      ],
      '2026-04-30T00:00:00Z',
    );
    const hansard = appendEntry('# HANSARD\n\n---\n', cascadeEntry(alert, '2026-04-30T00:00:00Z'));
    assert.deepEqual([...cascadeAlerts(hansard)], ['sig']);
  });
});

describe('scope mobility and quarantine', () => {
  it('records a scope promotion at the deciding node', () => {
    const entry = scopeMove(
      {
        at: '2026-04-08T14:00:00Z',
        actor: 'sprint-speaker',
        role: 'AUTHORITY',
        subject: 'minister-alpha',
        to_node: 'org/politik-sprint-2026-04',
        reason: 'consistently exceeded the leaf mandate',
      },
      'PROMOTE_SCOPE',
    );
    assert.equal(entry.type, 'PROMOTE_SCOPE');
    assert.equal(entry.fields?.['Scoped to'], 'org/politik-sprint-2026-04');
  });

  it('records a demotion in scope', () => {
    assert.equal(
      scopeMove(
        { at: '2026-04-08T14:00:00Z', actor: 's', role: 'AUTHORITY', subject: 'a', to_node: 'leaf', reason: 'r' },
        'DEMOTE_SCOPE',
      ).type,
      'DEMOTE_SCOPE',
    );
  });

  it('records a quarantine on the parent', () => {
    const entry = quarantineEntry('org/politik-team-x', '2026-04-08T14:00:00Z', 'root-speaker', 'cascade unresolved');
    assert.equal(entry.type, 'QUARANTINE');
    assert.match(entry.fields?.['Effect'] ?? '', /no further sessions convene/);
  });
});
