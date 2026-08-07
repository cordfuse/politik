import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConflictError,
  IS_GOVERNANCE_FAILURE,
  conflictEntry,
  detectConflicts,
  detectRecordConflicts,
  mayResolve,
  openConflicts,
  resolveConflict,
} from '../src/conflict.ts';
import { SUSPENSION_CAUSES } from '../src/canon.ts';
import { appendEntry } from '../src/hansard.ts';

const AT = '2026-04-08T14:00:00Z';
const BASE = '# HANSARD\n\n---\n';

describe('detection', () => {
  it('finds two Motions touching the same file', () => {
    const conflicts = detectConflicts([
      { motion: 'motion-001', files: ['src/a.ts', 'README.md'] },
      { motion: 'motion-002', files: ['src/a.ts'] },
    ]);
    assert.equal(conflicts.length, 1);
    assert.deepEqual([...(conflicts[0]?.files ?? [])], ['src/a.ts']);
  });

  it('finds nothing when Motions touch different files', () => {
    assert.deepEqual(
      detectConflicts([
        { motion: 'a', files: ['x.ts'] },
        { motion: 'b', files: ['y.ts'] },
      ]),
      [],
    );
  });

  it('reports each pair once, not twice', () => {
    assert.equal(
      detectConflicts([
        { motion: 'a', files: ['x'] },
        { motion: 'b', files: ['x'] },
      ]).length,
      1,
    );
  });

  it('finds every conflicting pair among three Motions', () => {
    const conflicts = detectConflicts([
      { motion: 'a', files: ['x'] },
      { motion: 'b', files: ['x'] },
      { motion: 'c', files: ['x'] },
    ]);
    assert.equal(conflicts.length, 3);
  });

  it('handles a single Motion and an empty set', () => {
    assert.deepEqual(detectConflicts([{ motion: 'a', files: ['x'] }]), []);
    assert.deepEqual(detectConflicts([]), []);
  });
});

describe('detecting conflicts from the record', () => {
  const turn = (actor: string, at: string, files: string) => ({
    type: 'MOTION_TABLED' as const,
    at,
    actor,
    role: 'OPERATOR' as const,
    fields: { 'Files touched': files },
  });

  const record = (...entries: ReturnType<typeof turn>[]) =>
    entries.reduce((h, e) => appendEntry(h, e), '# HANSARD\n\n---\n');

  it('flags two agent turns that touch the same file, though neither carries a Motion id', () => {
    // The regression: agent turns carry "Files touched" but no Motion id. Keying
    // by the file list collapsed both turns into one unit and reported nothing.
    const conflicts = detectRecordConflicts(
      record(turn('claude-1', 'T1', 'src/shared.ts'), turn('codex-1', 'T2', 'src/shared.ts, src/x.ts')),
    );
    assert.equal(conflicts.length, 1, 'the overlap on src/shared.ts must be detected');
    assert.deepEqual([...conflicts[0]!.files], ['src/shared.ts']);
    assert.equal(conflicts[0]!.motions.length, 2, 'both turns are named as distinct parties');
  });

  it('does not flag turns that touch different files', () => {
    assert.deepEqual(
      detectRecordConflicts(record(turn('a', 'T1', 'src/a.ts'), turn('b', 'T2', 'src/b.ts'))),
      [],
    );
  });

  it('ignores entries with no files touched', () => {
    assert.deepEqual(detectRecordConflicts(record(turn('a', 'T1', 'none'))), []);
  });
});

describe('CONFLICT is not a governance failure', () => {
  it('is not a suspension cause', () => {
    // The line the primitive exists to draw. DEADLOCK is a governance failure
    // and suspends; CONFLICT is routine and must never appear here.
    assert.ok(!(SUSPENSION_CAUSES as readonly string[]).includes('CONFLICT'));
    assert.ok((SUSPENSION_CAUSES as readonly string[]).includes('DEADLOCK'));
    assert.equal(IS_GOVERNANCE_FAILURE, false);
  });

  it('records the session as still CONVENED', () => {
    const entry = conflictEntry(
      { motions: ['a', 'b'], files: ['x.ts'] },
      AT,
      'RECORD',
      'OPERATOR',
    );
    assert.equal(entry.type, 'CONFLICT');
    assert.match(entry.fields?.['Session status'] ?? '', /CONVENED/);
    assert.match(entry.fields?.['Session status'] ?? '', /not a governance failure/);
  });

  it('carries no resolution path — it is work, not a fault', () => {
    const entry = conflictEntry({ motions: ['a', 'b'], files: ['x'] }, AT, 'RECORD', 'OPERATOR');
    assert.equal(entry.fields?.['Resolution path'], undefined);
    assert.equal(entry.fields?.['Fault type'], undefined);
  });
});

describe('standing to resolve', () => {
  it('admits any actor holding WRITE', () => {
    assert.ok(mayResolve(['READ', 'WRITE']));
    assert.ok(mayResolve(['WRITE']));
  });

  it('refuses an actor without WRITE', () => {
    assert.ok(!mayResolve(['READ', 'VOTE']));
    assert.ok(!mayResolve([]));
  });

  it('does not require AUTHORITY — that would make every merge a Speaker interruption', () => {
    const result = resolveConflict(
      {
        at: AT,
        actor: 'minister-alpha',
        role: 'OPERATOR',
        verbs: ['READ', 'WRITE'],
        motions: ['motion-001', 'motion-002'],
        resolution: 'Took the later edit; both changes preserved.',
      },
      BASE,
    );
    assert.equal(result.entry.type, 'CONFLICT_RESOLVED');
    assert.match(result.entry.fields?.['Speaker intervention'] ?? '', /none/);
  });

  it('refuses to name a resolver who could not have done the work', () => {
    assert.throws(
      () =>
        resolveConflict(
          { at: AT, actor: 'gallery', role: 'OBSERVER', verbs: ['READ'], motions: ['a', 'b'], resolution: 'x' },
          BASE,
        ),
      /requires WRITE/,
    );
  });

  it('requires two Motions and a stated resolution', () => {
    const base = { at: AT, actor: 'a', role: 'OPERATOR', verbs: ['WRITE'] } as const;
    assert.throws(() => resolveConflict({ ...base, motions: ['only-one'], resolution: 'x' }, BASE), ConflictError);
    assert.throws(() => resolveConflict({ ...base, motions: ['a', 'b'], resolution: '  ' }, BASE), ConflictError);
  });
});

describe('open conflicts', () => {
  it('tracks a conflict until it is resolved', () => {
    let h = appendEntry(BASE, conflictEntry({ motions: ['a', 'b'], files: ['x'] }, AT, 'RECORD', 'OPERATOR'));
    assert.equal(openConflicts(h).length, 1);

    h = resolveConflict(
      { at: AT, actor: 'm', role: 'OPERATOR', verbs: ['WRITE'], motions: ['a', 'b'], resolution: 'settled' },
      h,
    ).hansard;
    assert.equal(openConflicts(h).length, 0);
  });

  it('reports none on a clean record', () => {
    assert.deepEqual(openConflicts(BASE), []);
  });
});
