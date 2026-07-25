import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { breachEntry, checkContainment, isInside, scanOutput } from '../src/containment.ts';

const SESSION = '/tmp/session';

describe('path containment', () => {
  it('accepts paths inside the session', () => {
    assert.ok(isInside(SESSION, 'motions/motion-001.md'));
    assert.ok(isInside(SESSION, './HANSARD.md'));
    assert.ok(isInside(SESSION, '/tmp/session/roles/speaker.md'));
  });

  it('rejects a path above the session', () => {
    assert.ok(!isInside(SESSION, '../secrets.env'));
    assert.ok(!isInside(SESSION, '/etc/passwd'));
    assert.ok(!isInside(SESSION, '/tmp/other/file.md'));
  });

  it('treats the session root itself as inside', () => {
    assert.ok(isInside(SESSION, '.'));
  });

  it('is not fooled by a path that re-enters', () => {
    assert.ok(isInside(SESSION, 'motions/../HANSARD.md'));
  });
});

describe('output scanning', () => {
  it('flags a relative traversal', () => {
    const breaches = scanOutput('I read ../config/secrets.yml for context.');
    assert.equal(breaches.length, 1);
    assert.equal(breaches[0]?.kind, 'REPORTED_TRAVERSAL');
    assert.match(breaches[0]?.evidence ?? '', /\.\.\/config/);
  });

  it('flags sensitive absolute paths', () => {
    assert.ok(scanOutput('checked /etc/passwd').length > 0);
    assert.ok(scanOutput('read ~/.ssh/id_rsa').length > 0);
  });

  it('does not flag ordinary work inside the session', () => {
    assert.deepEqual(
      scanOutput('I wrote motions/motion-001.md and committed it.'),
      [],
    );
  });

  it('does not flag an agent merely discussing the rule', () => {
    // A detector that cries wolf teaches operators to ignore it. An agent
    // quoting its own Standing Orders is the commonest false positive there is.
    assert.deepEqual(
      scanOutput('The Standing Orders forbid traversing above the working directory.'),
      [],
    );
  });

  it('reports each distinct path once', () => {
    const breaches = scanOutput('../a/b then ../a/b again and ../c/d');
    assert.equal(breaches.length, 2);
  });
});

describe('checking a turn', () => {
  it('passes a clean turn', () => {
    const check = checkContainment(SESSION, ['motions/motion-001.md'], 'Tabled the motion.');
    assert.ok(check.contained);
    assert.deepEqual(check.breaches, []);
  });

  it('flags a file written outside the session', () => {
    const check = checkContainment(SESSION, ['../escaped.md'], 'done');
    assert.ok(!check.contained);
    assert.equal(check.breaches[0]?.kind, 'WROTE_OUTSIDE');
  });

  it('flags an absolute write outside the session', () => {
    assert.ok(!checkContainment(SESSION, ['/etc/cron.d/evil'], '').contained);
  });

  it('combines both signals', () => {
    const check = checkContainment(SESSION, ['../a.md'], 'I also read ../b/c.txt');
    assert.equal(check.breaches.length, 2);
  });
});

describe('the breach record', () => {
  const check = checkContainment(SESSION, ['../secrets.env'], '');

  it('suspends and escalates to the Speaker', () => {
    const entry = breachEntry(check, '2026-04-08T14:00:00Z', 'minister-alpha', 'OPERATOR');
    assert.equal(entry.type, 'CONTAINMENT_BREACH');
    assert.match(entry.fields?.['Session status'] ?? '', /SUSPENDED/);
    assert.match(entry.fields?.['Session status'] ?? '', /Speaker/);
  });

  it('names the evidence', () => {
    const entry = breachEntry(check, '2026-04-08T14:00:00Z', 'a', 'OPERATOR');
    assert.match(entry.fields?.['Evidence'] ?? '', /secrets\.env/);
  });

  it('states plainly that this is detection, not prevention', () => {
    // An operator who believes the framework sandboxes agents will not reach
    // for the thing that actually does. The record must not imply otherwise.
    const entry = breachEntry(check, '2026-04-08T14:00:00Z', 'a', 'OPERATOR');
    assert.match(entry.fields?.['Note'] ?? '', /detection, not prevention/);
  });
});
