import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCharter,
  splitFrontmatter,
  validateCharter,
  writDrop,
  type Charter,
} from '../src/charter.ts';

/** The reference Charter from ADR-0002, verbatim in shape. */
const REFERENCE = `---
charter_version: 1.0.0
protocol: parliamentary
inherits_from: cordfuse/politik-sprint-2026-04

session:
  quorum: 2
  escalation: enabled
  heartbeat_timeout_hours: 4
  deadline: null
  merge_strategy: merge_commit
  assent: AUTHORITY

  endurance:
    max_motions: null
    max_cost_usd: null

ledger:
  enabled: true
  visibility: public
  path: LEDGER.md

minimum_cast:
  AUTHORITY: 1
  OPERATOR: 1

domain_veto: []

constituencies:
  - role: AUTHORITY
    slots: 1
    auto_demotion: false
  - role: OPERATOR
    slots: 3
    auto_demotion: false
    hard_skills:
      required: [BC_AL_development]
      excluded: [raw_SQL]
    model:
      required: claude-sonnet-5
      preferred: claude-opus-4-8
      knowledge_cutoff_minimum: 2025-01
    mandate_alignment: null
---

# Standing Orders

Human-readable prose. Not parsed by the engine.
`;

const parseOk = (source: string): Charter => {
  const result = parseCharter(source);
  assert.ok(result.ok, 'expected charter to parse');
  return result.charter;
};

/** Reference charter with a targeted mutation applied to the YAML. */
const mutated = (from: string, to: string): Charter =>
  parseOk(REFERENCE.replace(from, to));

describe('frontmatter', () => {
  it('splits YAML from prose body', () => {
    const split = splitFrontmatter(REFERENCE);
    assert.ok(split);
    assert.match(split.yaml, /charter_version/);
    assert.match(split.body, /^# Standing Orders/);
  });

  it('rejects a document with no frontmatter (rule 1)', () => {
    const result = parseCharter('# Just prose\n');
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.rule, 1);
  });

  it('rejects malformed YAML (rule 1)', () => {
    const result = parseCharter('---\nsession: [unclosed\n---\n');
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.rule, 1);
    assert.match(result.issues[0]?.message ?? '', /malformed YAML/);
  });
});

describe('parse — reference charter', () => {
  const charter = parseOk(REFERENCE);

  it('reads the top-level fields', () => {
    assert.equal(charter.charter_version, '1.0.0');
    assert.equal(charter.protocol, 'parliamentary');
    assert.equal(charter.inherits_from, 'cordfuse/politik-sprint-2026-04');
  });

  it('reads the session block', () => {
    assert.equal(charter.session.quorum, 2);
    assert.equal(charter.session.merge_strategy, 'merge_commit');
    assert.equal(charter.session.assent, 'AUTHORITY');
    assert.equal(charter.session.deadline, null);
    assert.equal(charter.session.endurance.max_cost_usd, null);
  });

  it('reads constituencies including nested skills and model', () => {
    assert.equal(charter.constituencies.length, 2);
    const operator = charter.constituencies[1];
    assert.equal(operator?.role, 'OPERATOR');
    assert.equal(operator?.slots, 3);
    assert.deepEqual([...(operator?.hard_skills.required ?? [])], ['BC_AL_development']);
    assert.equal(operator?.model.preferred, 'claude-opus-4-8');
  });

  it('carries the prose body unparsed', () => {
    assert.match(charter.body, /Not parsed by the engine/);
  });

  it('passes Writ Drop', () => {
    const result = validateCharter(charter, { name: 'parliamentary' });
    assert.deepEqual(result.issues, []);
    assert.ok(result.valid);
  });
});

describe('parse — defaults', () => {
  it('defaults merge_strategy to merge_commit and assent to AUTHORITY', () => {
    const charter = parseOk('---\ncharter_version: 1.0.0\nprotocol: parliamentary\n---\n');
    assert.equal(charter.session.merge_strategy, 'merge_commit');
    assert.equal(charter.session.assent, 'AUTHORITY');
    assert.equal(charter.session.heartbeat_timeout_hours, 4);
    assert.equal(charter.session.escalation, 'enabled');
  });

  it('routes the private ledger to .politik/', () => {
    const charter = parseOk(
      '---\ncharter_version: 1.0.0\nprotocol: p\nledger:\n  visibility: private\n---\n',
    );
    assert.equal(charter.ledger.path, '.politik/LEDGER.md');
  });
});

describe('governance keys — documented YAML that was inert', () => {
  it('parses a Witness Council', () => {
    const charter = parseOk(REFERENCE.replace('domain_veto: []', `domain_veto: []

governance:
  witness_council:
    enabled: true
    roles: [OBSERVER]`));
    assert.ok(charter.governance.witness_council.enabled);
    assert.deepEqual([...charter.governance.witness_council.roles], ['OBSERVER']);
  });

  it('treats an enabled council with no roles as disabled', () => {
    // A council nobody sits on cannot file; reporting it enabled would promise
    // a mechanism that cannot fire.
    const charter = parseOk(REFERENCE.replace('domain_veto: []', `domain_veto: []

governance:
  witness_council:
    enabled: true
    roles: []`));
    assert.ok(!charter.governance.witness_council.enabled);
  });

  it('defaults consensus suspension on, at 0.75', () => {
    const charter = parseOk(REFERENCE);
    assert.ok(charter.governance.consensus_suspension.enabled);
    assert.equal(charter.governance.consensus_suspension.threshold, 0.75);
  });

  it('honours a declared threshold and rejects an impossible one', () => {
    const ok = parseOk(REFERENCE.replace('domain_veto: []', 'domain_veto: []\n\ngovernance:\n  consensus_suspension:\n    threshold: 1.0'));
    assert.equal(ok.governance.consensus_suspension.threshold, 1);
    const bad = parseOk(REFERENCE.replace('domain_veto: []', 'domain_veto: []\n\ngovernance:\n  consensus_suspension:\n    threshold: 5'));
    assert.equal(bad.governance.consensus_suspension.threshold, 0.75);
  });

  it('parses stale_action and checkpoint_interval_hours', () => {
    const charter = parseOk(REFERENCE.replace('  quorum: 2', '  quorum: 2\n  stale_action: dissolve\n  checkpoint_interval_hours: 8'));
    assert.equal(charter.session.stale_action, 'dissolve');
    assert.equal(charter.session.checkpoint_interval_hours, 8);
  });

  it('defaults stale_action to suspend — silence is not a decision to end anything', () => {
    assert.equal(parseOk(REFERENCE).session.stale_action, 'suspend');
  });

  it('reads cost_warning_usd from either documented location', () => {
    const nested = parseOk(REFERENCE.replace('    max_cost_usd: null', '    max_cost_usd: 5\n    cost_warning_usd: 4'));
    assert.equal(nested.session.endurance.cost_warning_usd, 4);
    const flat = parseOk(REFERENCE.replace('  quorum: 2', '  quorum: 2\n  cost_warning_usd: 3'));
    assert.equal(flat.session.endurance.cost_warning_usd, 3);
  });

  it('parses deadline_action, defaulting to escalate', () => {
    assert.equal(parseOk(REFERENCE).session.endurance.deadline_action, 'escalate');
    const d = parseOk(REFERENCE.replace('  quorum: 2', '  quorum: 2\n  deadline_action: dissolve'));
    assert.equal(d.session.endurance.deadline_action, 'dissolve');
  });
});

describe('rule 2 — protocol resolution', () => {
  it('fails when the charter names an unresolved protocol', () => {
    const charter = parseOk(REFERENCE);
    const result = validateCharter(charter, { name: 'agile' });
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.rule === 2));
  });

  it('is not enforced when no protocol context is supplied', () => {
    const result = validateCharter(parseOk(REFERENCE));
    assert.ok(result.valid);
  });
});

describe('rule 3 — minimum_cast shortfall', () => {
  it('fails when constituencies do not meet the required cast', () => {
    const charter = mutated('  - role: OPERATOR\n    slots: 3', '  - role: OPERATOR\n    slots: 0');
    const result = validateCharter(charter);
    assert.ok(!result.valid);
    const issue = result.issues.find((i) => i.rule === 3);
    assert.match(issue?.field ?? '', /OPERATOR/);
  });

  it('names the missing role in the issue', () => {
    const charter = mutated('  OPERATOR: 1', '  OPERATOR: 1\n  DELEGATE: 2');
    const result = validateCharter(charter);
    assert.ok(result.issues.some((i) => i.field === 'minimum_cast.DELEGATE'));
  });
});

describe('the one hard constitutional rule — AUTHORITY is human', () => {
  it('refuses a Charter seating an agent as Speaker', () => {
    const charter = mutated(
      '  - role: AUTHORITY\n    slots: 1',
      '  - role: AUTHORITY\n    slots: 1\n    agent: claude-code',
    );
    const result = validateCharter(charter);
    assert.ok(!result.valid);
    assert.match(
      result.issues.find((i) => i.field.includes('agent'))?.message ?? '',
      /AUTHORITY is always human/,
    );
  });

  it('permits an agent in any other seat', () => {
    const charter = mutated(
      '  - role: OPERATOR\n    slots: 3',
      '  - role: OPERATOR\n    slots: 3\n    agent: claude-code',
    );
    assert.ok(validateCharter(charter).valid);
  });

  it('permits a human Speaker — no agent declared', () => {
    assert.ok(validateCharter(parseOk(REFERENCE)).valid);
  });
});

describe('rule 4 — AUTHORITY floor', () => {
  it('rejects minimum_cast.AUTHORITY: 0', () => {
    const charter = mutated('  AUTHORITY: 1', '  AUTHORITY: 0');
    const result = validateCharter(charter);
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.rule === 4));
  });
});

describe('rule 5 — squash vs distributed record mode', () => {
  it('rejects squash under a distributed record mode', () => {
    const charter = mutated('merge_strategy: merge_commit', 'merge_strategy: squash');
    const result = validateCharter(charter, {
      name: 'parliamentary',
      record_mode: 'distributed',
    });
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.rule === 5));
  });

  it('permits squash under anchored — the mode 8 of 10 shipped protocols use', () => {
    const charter = mutated('merge_strategy: merge_commit', 'merge_strategy: squash');
    const result = validateCharter(charter, {
      name: 'parliamentary',
      record_mode: 'anchored',
    });
    assert.ok(result.valid);
  });
});

describe('rule 6 — fast_forward requires quorum 1', () => {
  it('rejects fast_forward at quorum 2', () => {
    const charter = mutated('merge_strategy: merge_commit', 'merge_strategy: fast_forward');
    const result = validateCharter(charter);
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.rule === 6));
  });

  it('permits fast_forward at quorum 1', () => {
    const charter = parseOk(
      REFERENCE.replace('merge_strategy: merge_commit', 'merge_strategy: fast_forward')
        .replace('quorum: 2', 'quorum: 1'),
    );
    const result = validateCharter(charter);
    assert.deepEqual(result.issues, []);
  });
});

describe('rule 7 — assent names a CANON role', () => {
  it('falls back to AUTHORITY when an unknown role is declared', () => {
    const charter = mutated('assent: AUTHORITY', 'assent: SPEAKER');
    assert.equal(charter.session.assent, 'AUTHORITY');
  });

  it('accepts a CANON role other than AUTHORITY', () => {
    const charter = mutated('assent: AUTHORITY', 'assent: DELEGATE');
    assert.equal(charter.session.assent, 'DELEGATE');
    assert.ok(validateCharter(charter).valid);
  });
});

describe('writDrop', () => {
  it('parses and validates in one step', () => {
    const result = writDrop(REFERENCE, { name: 'parliamentary' });
    assert.ok(result.valid);
    assert.equal(result.charter?.protocol, 'parliamentary');
  });

  it('reports structural faults without a charter', () => {
    const result = writDrop('not a charter');
    assert.ok(!result.valid);
    assert.equal(result.charter, undefined);
  });
});
