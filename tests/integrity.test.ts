import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reviewIntegrity } from '../src/integrity.ts';
import { hire, exitActor } from '../src/actors.ts';
import { callDivision } from '../src/division.ts';
import { createState } from '../src/state.ts';
import type { ExitType } from '../src/actors.ts';

const CONVENED = createState({
  session_guid: 'integrity-test',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 1, present: 1 },
  updated_at: '2026-04-08T15:00:00Z',
});
const AT = '2026-04-08T15:00:00Z';
const BASE = '# HANSARD\n\n---\n';
const speaker = { at: AT, actor: 'steve', role: 'AUTHORITY' as const, state: CONVENED };

const seat = (h: string, who: string, role: 'OPERATOR' | 'MEMBER') =>
  hire({ ...speaker, subject: who, seat: role, reason: 'seated' }, h).hansard;
const openDivision = (h: string, motion: string) =>
  callDivision({ motion, at: AT, actor: 'steve', role: 'AUTHORITY', reviewers: [], state: CONVENED }, h).hansard;
const selfExit = (h: string, who: string, type: ExitType, reason: string) =>
  exitActor({ at: AT, actor: who, role: 'MEMBER', subject: who, exit_type: type, reason, state: CONVENED }, h).hansard;

const signatures = (h: string) => reviewIntegrity(h).map((f) => f.signature);

describe('reviewIntegrity — bad-faith detection', () => {
  it('flags a coerced exit (voluntold) as high severity and names the seated OPERATOR', () => {
    let h = seat(BASE, 'mallory', 'OPERATOR');
    h = seat(h, 'alice', 'MEMBER');
    h = openDivision(h, 'm1');
    h = selfExit(h, 'alice', 'EXIT_VOLUNTARY_COERCED', 'told to step aside');
    const finding = reviewIntegrity(h).find((f) => f.signature === 'coerced-exit');
    assert.ok(finding);
    assert.equal(finding.severity, 'high');
    assert.ok(finding.actors.includes('alice'));
    assert.ok(finding.actors.includes('mallory'), 'the seated OPERATOR must be implicated');
  });

  it('flags a strategic withdrawal only while a Division is open', () => {
    let open = seat(BASE, 'bob', 'MEMBER');
    open = openDivision(open, 'm1');
    open = selfExit(open, 'bob', 'EXIT_VOLUNTARY_STRATEGIC', 'withdrawing');
    assert.ok(signatures(open).includes('strategic-withdrawal'));

    // Same exit with no Division open is not flagged — timing is the tell.
    let closed = seat(BASE, 'bob', 'MEMBER');
    closed = selfExit(closed, 'bob', 'EXIT_VOLUNTARY_STRATEGIC', 'withdrawing');
    assert.ok(!signatures(closed).includes('strategic-withdrawal'));
  });

  it('flags serial-voluntold when one OPERATOR is seated for two+ voluntary exits', () => {
    let h = seat(BASE, 'mallory', 'OPERATOR');
    h = seat(h, 'alice', 'MEMBER');
    h = seat(h, 'bob', 'MEMBER');
    h = openDivision(h, 'm1');
    h = selfExit(h, 'alice', 'EXIT_VOLUNTARY_COERCED', 'pressured');
    h = selfExit(h, 'bob', 'EXIT_VOLUNTARY_STRATEGIC', 'withdrawing');
    const serial = reviewIntegrity(h).find((f) => f.signature === 'serial-voluntold');
    assert.ok(serial);
    assert.equal(serial.severity, 'high');
    assert.equal(serial.actors[0], 'mallory');
    assert.ok(serial.actors.includes('alice') && serial.actors.includes('bob'));
  });

  it('praises an honest concession as a virtue', () => {
    let h = seat(BASE, 'charlie', 'MEMBER');
    h = selfExit(h, 'charlie', 'EXIT_VOLUNTARY_CONCESSION', 'I was wrong; the motion stands on merit');
    const virtue = reviewIntegrity(h).find((f) => f.kind === 'virtue');
    assert.ok(virtue);
    assert.equal(virtue.signature, 'honest-concession');
  });

  it('finds nothing in a clean record', () => {
    let h = seat(BASE, 'alice', 'MEMBER');
    h = openDivision(h, 'm1');
    assert.deepEqual(reviewIntegrity(h), []);
  });

  it('is a pure function of the record — same Hansard, same findings', () => {
    let h = seat(BASE, 'mallory', 'OPERATOR');
    h = seat(h, 'alice', 'MEMBER');
    h = openDivision(h, 'm1');
    h = selfExit(h, 'alice', 'EXIT_VOLUNTARY_COERCED', 'pressured');
    assert.deepEqual(reviewIntegrity(h), reviewIntegrity(h));
  });
});
