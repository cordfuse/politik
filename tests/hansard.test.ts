import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HansardError,
  RECORD_TYPES,
  appendEntries,
  appendEntry,
  lastEntry,
  parseEntries,
  renderEntry,
  type HansardEntry,
} from '../src/hansard.ts';

const ENTRY: HansardEntry = {
  type: RECORD_TYPES.SESSION_FAULT,
  at: '2026-04-08T14:04:00Z',
  actor: 'OPERATOR-1',
  role: 'OPERATOR',
  fields: {
    'Action attempted': 'Deploy authentication module to staging',
    'Fault type': 'FAULT_INFRA',
    'Actor penalised': 'No — infrastructure fault, actor blameless',
  },
};

const HEADER = '# HANSARD\n\nAppend-only attributed record.\n\n---\n';

describe('rendering', () => {
  const rendered = renderEntry(ENTRY);

  it('leads with timestamp and record type', () => {
    assert.match(rendered, /^## 2026-04-08T14:04:00Z — SESSION_FAULT/);
  });

  it('attributes the actor with their CANON role', () => {
    assert.match(rendered, /\*\*Actor:\*\* OPERATOR-1 \(OPERATOR\)/);
  });

  it('renders bold-label fields in insertion order', () => {
    const order = [...rendered.matchAll(/\*\*(.+?):\*\*/g)].map((m) => m[1]);
    assert.deepEqual(order, [
      'Actor',
      'Action attempted',
      'Fault type',
      'Actor penalised',
    ]);
  });

  it('appends prose body after the fields', () => {
    const withBody = renderEntry({ ...ENTRY, body: 'Long form explanation.' });
    const fieldsEnd = withBody.indexOf('Actor penalised');
    assert.ok(withBody.indexOf('Long form explanation.') > fieldsEnd);
  });

  it('collapses multi-line field values to one line', () => {
    const rendered = renderEntry({
      ...ENTRY,
      fields: { Detail: 'line one\nline two' },
    });
    assert.match(rendered, /\*\*Detail:\*\* line one line two/);
  });
});

describe('attribution is mandatory', () => {
  it('refuses an entry with no actor', () => {
    assert.throws(() => renderEntry({ ...ENTRY, actor: '  ' }), HansardError);
  });

  it('refuses an entry with no record type', () => {
    assert.throws(() => renderEntry({ ...ENTRY, type: '' }), HansardError);
  });

  it('refuses an entry with no timestamp', () => {
    assert.throws(() => renderEntry({ ...ENTRY, at: '' }), HansardError);
  });
});

describe('append-only guarantee', () => {
  it('preserves the existing document verbatim as a prefix', () => {
    const next = appendEntry(HEADER, ENTRY);
    assert.ok(next.startsWith(HEADER), 'existing content was modified');
  });

  it('preserves every prior entry across many appends', () => {
    let doc = HEADER;
    const snapshots: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      snapshots.push(doc);
      doc = appendEntry(doc, { ...ENTRY, at: `2026-04-08T14:0${i}:00Z` });
    }
    for (const snapshot of snapshots) {
      assert.ok(doc.startsWith(snapshot), 'an earlier revision was rewritten');
    }
  });

  it('appends to an empty document', () => {
    assert.match(appendEntry('', ENTRY), /^\n?## /);
  });

  it('normalises a document with no trailing newline', () => {
    const doc = appendEntry('# HANSARD', ENTRY);
    assert.ok(doc.includes('# HANSARD\n'));
  });

  it('appends several entries in order', () => {
    const doc = appendEntries(HEADER, [
      { ...ENTRY, type: 'WRIT_DROP', at: '2026-04-08T14:00:00Z' },
      { ...ENTRY, type: 'SESSION_FAULT', at: '2026-04-08T14:04:00Z' },
    ]);
    const parsed = parseEntries(doc);
    assert.deepEqual(parsed.map((e) => e.type), ['WRIT_DROP', 'SESSION_FAULT']);
  });
});

describe('reading back', () => {
  it('round-trips an entry', () => {
    const parsed = parseEntries(appendEntry(HEADER, ENTRY));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.type, 'SESSION_FAULT');
    assert.equal(parsed[0]?.at, '2026-04-08T14:04:00Z');
    assert.equal(parsed[0]?.actor, 'OPERATOR-1');
    assert.equal(parsed[0]?.role, 'OPERATOR');
    assert.equal(parsed[0]?.fields['Fault type'], 'FAULT_INFRA');
  });

  it('does not repeat Actor inside the field map', () => {
    const parsed = parseEntries(appendEntry(HEADER, ENTRY));
    assert.equal(parsed[0]?.fields['Actor'], undefined);
  });

  it('ignores the document preamble', () => {
    assert.deepEqual(parseEntries(HEADER), []);
  });

  it('returns the most recent entry', () => {
    const doc = appendEntries(HEADER, [
      { ...ENTRY, type: 'WRIT_DROP', at: '2026-04-08T14:00:00Z' },
      { ...ENTRY, type: 'FAULT_RESOLVED', at: '2026-04-08T15:00:00Z' },
    ]);
    assert.equal(lastEntry(doc)?.type, 'FAULT_RESOLVED');
  });

  it('returns null for an empty Hansard', () => {
    assert.equal(lastEntry(HEADER), null);
  });
});

describe('record types are open', () => {
  it('accepts a type the documents never name', () => {
    const doc = appendEntry(HEADER, { ...ENTRY, type: 'PROTOCOL_SPECIFIC_EVENT' });
    assert.equal(lastEntry(doc)?.type, 'PROTOCOL_SPECIFIC_EVENT');
  });
});
