import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dropWrit, type WritDropInput } from '../src/init.ts';
import { parseState, validateState } from '../src/state.ts';

const CHARTER = `---
charter_version: 1.0.0
protocol: parliamentary
inherits_from: null

session:
  quorum: 2
  merge_strategy: merge_commit
  assent: AUTHORITY

ledger:
  enabled: true
  visibility: public
  path: LEDGER.md

minimum_cast:
  AUTHORITY: 1
  OPERATOR: 1

constituencies:
  - role: AUTHORITY
    slots: 1
  - role: OPERATOR
    slots: 2
---

# Standing Orders

Prose.
`;

const INPUT: WritDropInput = {
  charter_source: CHARTER,
  session_guid: '0f9c1b3e-0000-4000-8000-000000000000',
  now: '2026-04-08T14:02:11Z',
  speaker: 'speaker-handle',
  protocol: { name: 'parliamentary' },
};

const fileMap = (files: readonly { path: string; content: string }[]) =>
  new Map(files.map((f) => [f.path, f.content]));

describe('Writ Drop — success', () => {
  const result = dropWrit(INPUT);
  assert.ok(result.ok, 'expected a valid Writ Drop');
  const files = fileMap(result.files);

  it('writes the session repo structure', () => {
    for (const path of ['CHARTER.md', 'STATE.json', 'HANSARD.md', 'WRIT.md', 'LEDGER.md']) {
      assert.ok(files.has(path), `missing ${path}`);
    }
    for (const dir of ['roles', 'actors', 'motions', 'escalations']) {
      assert.ok(files.has(`${dir}/.gitkeep`), `missing ${dir}/`);
    }
  });

  it('commits the Charter verbatim', () => {
    assert.equal(files.get('CHARTER.md'), CHARTER);
  });

  it('opens the session CONVENED (rule 8)', () => {
    assert.equal(result.state.state, 'CONVENED');
    assert.equal(result.state.suspension, null);
    assert.equal(result.state.quorum.required, 2);
    assert.equal(result.state.updated_by, 'RECORD');
  });

  it('writes a STATE.json that parses and self-validates', () => {
    const parsed = parseState(files.get('STATE.json') ?? '');
    assert.ok(parsed);
    assert.deepEqual(validateState(parsed), []);
    assert.equal(parsed.schema_version, '1.0.0');
    assert.equal(parsed.hansard_head, null);
  });

  it('records the Writ Drop in the Hansard, attributed', () => {
    const record = files.get('HANSARD.md') ?? '';
    assert.match(record, /WRIT_DROP/);
    assert.match(record, /speaker-handle \(AUTHORITY\)/);
    assert.match(record, /2026-04-08T14:02:11Z/);
  });

  it('names the session and protocol in the Writ', () => {
    const doc = files.get('WRIT.md') ?? '';
    assert.match(doc, /0f9c1b3e-0000-4000-8000-000000000000/);
    assert.match(doc, /parliamentary/);
    assert.match(doc, /none \(root node\)/);
  });
});

describe('Writ Drop — ledger routing', () => {
  it('routes a private ledger under .politik/', () => {
    const result = dropWrit({
      ...INPUT,
      charter_source: CHARTER.replace('visibility: public', 'visibility: private')
        .replace('path: LEDGER.md', ''),
    });
    assert.ok(result.ok);
    assert.ok(fileMap(result.files).has('.politik/LEDGER.md'));
  });

  it('omits the ledger when disabled', () => {
    const result = dropWrit({
      ...INPUT,
      charter_source: CHARTER.replace('enabled: true', 'enabled: false'),
    });
    assert.ok(result.ok);
    assert.ok(!fileMap(result.files).has('LEDGER.md'));
  });
});

describe('Writ Drop — refusal', () => {
  it('refuses a Charter with a minimum_cast shortfall', () => {
    const result = dropWrit({
      ...INPUT,
      charter_source: CHARTER.replace('  - role: OPERATOR\n    slots: 2', ''),
    });
    assert.ok(!result.ok);
    assert.equal(result.state.state, 'INVALID');
    assert.ok(result.issues.some((i) => i.rule === 3));
  });

  it('refuses a Charter that removes the Speaker (rule 4)', () => {
    const result = dropWrit({
      ...INPUT,
      charter_source: CHARTER.replace('  AUTHORITY: 1', '  AUTHORITY: 0'),
    });
    assert.ok(!result.ok);
    assert.ok(result.issues.some((i) => i.rule === 4));
  });

  it('refuses malformed source without a charter', () => {
    const result = dropWrit({ ...INPUT, charter_source: 'not a charter' });
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.rule, 1);
  });

  it('puts the refusal on the record, naming every violated rule', () => {
    const result = dropWrit({
      ...INPUT,
      charter_source: CHARTER.replace('  AUTHORITY: 1', '  AUTHORITY: 0'),
    });
    assert.ok(!result.ok);
    const record = fileMap(result.files).get('HANSARD.md') ?? '';
    assert.match(record, /SESSION_INVALID/);
    assert.match(record, /never opened/);
    assert.match(record, /minimum_cast\.AUTHORITY/);
    assert.match(record, /ADR-0002 rule 4/);
  });

  it('still commits an INVALID STATE.json that self-validates', () => {
    const result = dropWrit({ ...INPUT, charter_source: 'not a charter' });
    assert.ok(!result.ok);
    const parsed = parseState(fileMap(result.files).get('STATE.json') ?? '');
    assert.ok(parsed);
    assert.equal(parsed.state, 'INVALID');
    assert.deepEqual(validateState(parsed), []);
  });
});

describe('Writ Drop — purity', () => {
  it('is deterministic for identical input', () => {
    const a = dropWrit(INPUT);
    const b = dropWrit(INPUT);
    assert.ok(a.ok && b.ok);
    assert.deepEqual(a.files, b.files);
  });
});
