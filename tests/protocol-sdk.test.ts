import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { generateProtocol, lintProtocol, lintSource } from '../src/protocol-sdk.ts';
import { parseProtocol } from '../src/protocol.ts';
import { PRIMITIVES, ROLES, VERBS } from '../src/canon.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_DIR = join(here, '..', 'protocols');

const manifests = readdirSync(PROTOCOL_DIR).filter((f) => f.endsWith('.yml'));

describe('shipped protocol library', () => {
  it('ships the reference protocol library', () => {
    assert.ok(manifests.length >= 10, `expected at least 10 manifests, found: ${manifests.join(', ')}`);
    for (const core of ['parliamentary.yml', 'jury-deliberation.yml', 'peer-review.yml']) {
      assert.ok(manifests.includes(core), `missing core protocol ${core}`);
    }
  });

  for (const file of manifests) {
    const source = readFileSync(join(PROTOCOL_DIR, file), 'utf8');

    it(`${file} parses`, () => {
      const result = parseProtocol(source);
      assert.ok(result.ok, `parse failed: ${JSON.stringify(result)}`);
    });

    it(`${file} lints clean`, () => {
      const result = lintSource(source);
      const errors = result.findings.filter((f) => f.severity === 'error');
      assert.deepEqual(errors, [], `${file} has lint errors`);
    });

    it(`${file} maps every CANON role`, () => {
      const parsed = parseProtocol(source);
      assert.ok(parsed.ok);
      for (const role of ROLES) {
        assert.ok(parsed.protocol.roles[role], `${file} leaves ${role} unmapped`);
      }
    });

    it(`${file} declares a name matching its filename`, () => {
      const parsed = parseProtocol(source);
      assert.ok(parsed.ok);
      assert.equal(parsed.protocol.name, file.replace(/\.yml$/, ''));
    });
  }
});

describe('mode families', () => {
  const load = (file: string) => {
    const parsed = parseProtocol(readFileSync(join(PROTOCOL_DIR, file), 'utf8'));
    assert.ok(parsed.ok);
    return parsed.protocol;
  };

  it('elimination-tournament is Darwinist and eliminates', () => {
    const p = load('elimination-tournament.yml');
    assert.equal(p.mode, 'darwinist');
    assert.equal(p.mechanics.exit, 'elimination');
  });

  it('emergency-response is authoritarian and still records', () => {
    const p = load('emergency-response-ics.yml');
    assert.equal(p.mode, 'authoritarian');
    assert.ok(!p.no_record);
  });

  it('emergency-response gives the Safety Officer a domain veto', () => {
    const p = load('emergency-response-ics.yml');
    assert.deepEqual([...p.domain_veto], ['OBSERVER']);
    assert.equal(p.roles.OBSERVER, 'Safety Officer');
  });

  it('peer-review grants a reviewer-level domain veto', () => {
    assert.deepEqual([...load('peer-review.yml').domain_veto], ['OPERATOR']);
  });

  it('every protocol that keeps a record declares a non-ephemeral record mode', () => {
    for (const file of manifests) {
      const p = load(file);
      if (!p.no_record) {
        assert.notEqual(p.record_mode, 'ephemeral', `${file} contradicts itself`);
      }
    }
  });
});

describe('linter — errors', () => {
  const base = {
    name: 'test',
    version: '1.0.0',
    mode: 'constitutional' as const,
    record_mode: 'anchored' as const,
    roles: { AUTHORITY: 'A', DELEGATE: 'B', OPERATOR: 'C', MEMBER: 'D', OBSERVER: 'E' },
    primitives: {},
    domain_veto: [],
    no_escalation: false,
    no_record: false,
    immutable_charter: false,
    mechanics: { resolution: 'majority', exit: 'division', termination: 'objective' },
  };

  it('rejects a name that is not lower-kebab-case', () => {
    const result = lintProtocol({ ...base, name: 'Peer Review' });
    assert.ok(!result.ok);
    assert.ok(result.findings.some((f) => f.field === 'name' && f.severity === 'error'));
  });

  it('rejects a term that is not a CANON primitive or verb', () => {
    const result = lintProtocol({ ...base, primitives: { SPRINT_GOAL: 'Sprint Goal' } });
    assert.ok(!result.ok);
    assert.ok(result.findings.some((f) => f.field === 'primitives.SPRINT_GOAL'));
  });

  it('accepts translations of both primitives and verbs', () => {
    const result = lintProtocol({
      ...base,
      primitives: { MOTION: 'Pull Request', ASSENT: 'Merge' },
    });
    assert.ok(result.ok);
  });

  it('rejects two roles sharing one term', () => {
    const result = lintProtocol({
      ...base,
      roles: { ...base.roles, OPERATOR: 'Lead', MEMBER: 'Lead' },
    });
    assert.ok(!result.ok);
    assert.ok(result.findings.some((f) => f.message.includes('duplicate term')));
  });

  it('rejects an ephemeral record mode that still claims to record', () => {
    const result = lintProtocol({ ...base, record_mode: 'ephemeral', no_record: false });
    assert.ok(!result.ok);
  });
});

describe('linter — warnings', () => {
  const base = {
    name: 'test',
    version: '1.0.0',
    mode: 'darwinist' as const,
    record_mode: 'anchored' as const,
    roles: { AUTHORITY: 'A', DELEGATE: 'B', OPERATOR: 'C', MEMBER: 'D', OBSERVER: 'E' },
    primitives: {},
    domain_veto: [],
    no_escalation: true,
    no_record: false,
    immutable_charter: false,
    mechanics: { resolution: 'majority', exit: 'division', termination: 'objective' },
  };

  it('warns on a non-semver version without failing', () => {
    const result = lintProtocol({ ...base, version: '1.0' });
    assert.ok(result.ok, 'a bad version must not be fatal');
    assert.ok(result.findings.some((f) => f.field === 'version'));
  });

  it('warns when AUTHORITY is given a redundant domain veto', () => {
    const result = lintProtocol({ ...base, domain_veto: ['AUTHORITY'] });
    assert.ok(result.ok);
    assert.ok(result.findings.some((f) => f.field === 'domain_veto'));
  });

  it('warns when a constitutional protocol forbids escalation', () => {
    const result = lintProtocol({ ...base, mode: 'constitutional', no_escalation: true });
    assert.ok(result.ok, 'a mode mismatch is a warning, not an error');
    assert.ok(result.findings.some((f) => f.field === 'no_escalation'));
  });

  it('warns on an unmapped role', () => {
    const { OBSERVER: _drop, ...roles } = base.roles;
    const result = lintProtocol({ ...base, roles });
    assert.ok(result.ok);
    assert.ok(result.findings.some((f) => f.field === 'roles.OBSERVER'));
  });
});

describe('generator', () => {
  const generated = generateProtocol({ name: 'my-protocol' });

  it('generates a manifest that parses and lints clean', () => {
    const parsed = parseProtocol(generated);
    assert.ok(parsed.ok, `generated manifest failed to parse: ${JSON.stringify(parsed)}`);
    const result = lintSource(generated);
    assert.deepEqual(
      result.findings.filter((f) => f.severity === 'error'),
      [],
      'generated manifest has lint errors',
    );
  });

  it('exposes the full translatable surface', () => {
    for (const term of [...PRIMITIVES, ...VERBS]) {
      assert.ok(generated.includes(`${term}: ${term}`), `${term} missing from skeleton`);
    }
    for (const role of ROLES) {
      assert.ok(generated.includes(`${role}: ${role}`), `${role} missing from skeleton`);
    }
  });

  it('sets flags consistent with the requested mode', () => {
    const ephemeral = generateProtocol({ name: 'spy', mode: 'ephemeral' });
    const parsed = parseProtocol(ephemeral);
    assert.ok(parsed.ok);
    assert.ok(parsed.protocol.no_record, 'ephemeral skeleton must set no_record');
  });

  it('honours supplied role terms', () => {
    const custom = generateProtocol({
      name: 'kitchen',
      roles: { AUTHORITY: 'Head Chef', MEMBER: 'Line Cook' },
    });
    const parsed = parseProtocol(custom);
    assert.ok(parsed.ok);
    assert.equal(parsed.protocol.roles.AUTHORITY, 'Head Chef');
    assert.equal(parsed.protocol.roles.MEMBER, 'Line Cook');
  });
});

describe('manifests carry mechanics (ADR-0007 plumbing)', () => {
  it('elimination-tournament declares elimination + last-standing', () => {
    const parsed = parseProtocol(readFileSync(join(PROTOCOL_DIR, 'elimination-tournament.yml'), 'utf8'));
    assert.ok(parsed.ok);
    assert.equal(parsed.protocol.mechanics.exit, 'elimination');
    assert.equal(parsed.protocol.mechanics.termination, 'last-standing');
  });

  it('peer-review declares a verdict termination', () => {
    const parsed = parseProtocol(readFileSync(join(PROTOCOL_DIR, 'peer-review.yml'), 'utf8'));
    assert.ok(parsed.ok);
    assert.equal(parsed.protocol.mechanics.termination, 'verdict');
  });

  it('a manifest with no mechanics block defaults to Parliament', () => {
    const parsed = parseProtocol(
      'protocol:\n  name: x\n  version: 1.0.0\n  mode: constitutional\n  record_mode: distributed\n' +
        '  roles:\n    AUTHORITY: A\n    DELEGATE: B\n    OPERATOR: C\n    MEMBER: D\n    OBSERVER: E\n',
    );
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.protocol.mechanics, { resolution: 'majority', exit: 'division', termination: 'objective' });
  });
});
