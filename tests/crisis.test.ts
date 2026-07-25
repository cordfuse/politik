import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CrisisError,
  checkCapture,
  externalReview,
  fileCrisis,
  filings,
  suspendForCrisis,
  type WitnessCouncil,
} from '../src/crisis.ts';
import { createState } from '../src/state.ts';
import { prorogue } from '../src/prorogation.ts';

const CONVENED = createState({
  session_guid: 'collapse',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const AT = '2026-04-08T15:00:00Z';
const BASE = '# HANSARD\n\n---\n';

const file = (
  hansard: string,
  actor: string,
  role: 'OPERATOR' | 'MEMBER' | 'OBSERVER' | 'AUTHORITY' | 'DELEGATE',
  witness: WitnessCouncil | null = null,
) =>
  fileCrisis(
    {
      at: AT,
      actor,
      role,
      grounds: 'Speaker overrode a carried Division.',
      against: 'corrupt-speaker',
      state: CONVENED,
      witness,
    },
    hansard,
  ).hansard;

describe('standing to file', () => {
  it('lets an OPERATOR file', () => {
    assert.equal(filings(file(BASE, 'alpha', 'OPERATOR')).length, 1);
  });

  it('refuses AUTHORITY filing against itself', () => {
    // Otherwise a Speaker could suspend at will while appearing to submit to
    // scrutiny — a capture technique, not a defence against one.
    assert.throws(() => file(BASE, 'speaker', 'AUTHORITY'), /may not file .* against itself/);
  });

  it('refuses a MEMBER', () => {
    assert.throws(() => file(BASE, 'back', 'MEMBER'), /may not file/);
  });

  it('refuses an OBSERVER with no Witness Council', () => {
    assert.throws(() => file(BASE, 'gallery', 'OBSERVER'), /may not file/);
  });

  it('lets a designated witness file', () => {
    const witness: WitnessCouncil = {
      enabled: true,
      roles: ['OBSERVER'],
      can_file: 'CONSTITUTIONAL_CRISIS',
    };
    assert.equal(filings(file(BASE, 'gallery', 'OBSERVER', witness)).length, 1);
  });

  it('refuses a filing with no grounds', () => {
    assert.throws(
      () =>
        fileCrisis(
          { at: AT, actor: 'a', role: 'OPERATOR', grounds: '  ', against: 's', state: CONVENED },
          BASE,
        ),
      /must state its grounds/,
    );
  });

  it('refuses a second filing from the same actor', () => {
    assert.throws(() => file(file(BASE, 'alpha', 'OPERATOR'), 'alpha', 'OPERATOR'), /already filed/);
  });
});

describe('supermajority threshold', () => {
  it('does not trigger on a single dissenting Minister', () => {
    const check = checkCapture(file(BASE, 'alpha', 'OPERATOR'), 2);
    assert.ok(!check.triggered);
    assert.equal(check.required, 2);
  });

  it('triggers when the supermajority concurs', () => {
    let h = file(BASE, 'alpha', 'OPERATOR');
    h = file(h, 'bravo', 'OPERATOR');
    const check = checkCapture(h, 2);
    assert.ok(check.triggered);
    assert.match(check.reason, /2 of 2 OPERATOR actors concur/);
  });

  it('computes 0.75 of a larger bench', () => {
    // ceil(4 * 0.75) = 3
    let h = BASE;
    for (const a of ['a', 'b']) h = file(h, a, 'OPERATOR');
    assert.ok(!checkCapture(h, 4).triggered);
    h = file(h, 'c', 'OPERATOR');
    assert.ok(checkCapture(h, 4).triggered);
  });

  it('lets a single witness bypass the count entirely', () => {
    const witness: WitnessCouncil = {
      enabled: true,
      roles: ['OBSERVER'],
      can_file: 'CONSTITUTIONAL_CRISIS',
    };
    const check = checkCapture(file(BASE, 'gallery', 'OBSERVER', witness), 8, witness);
    assert.ok(check.triggered, 'a witness must trigger regardless of bench size');
    assert.ok(check.by_witness);
  });

  it('does not trigger when consensus suspension is disabled', () => {
    let h = file(BASE, 'alpha', 'OPERATOR');
    h = file(h, 'bravo', 'OPERATOR');
    const check = checkCapture(h, 2, null, {
      enabled: false,
      threshold: 0.75,
      resume_requires: 'external_review',
    });
    assert.ok(!check.triggered);
  });
});

describe('suspension', () => {
  const captured = () => {
    let h = file(BASE, 'alpha', 'OPERATOR');
    h = file(h, 'bravo', 'OPERATOR');
    return h;
  };

  it('suspends with cause CONSTITUTIONAL_CRISIS', () => {
    const h = captured();
    const result = suspendForCrisis(checkCapture(h, 2), AT, CONVENED, h);
    assert.equal(result.state.state, 'SUSPENDED');
    assert.equal(result.state.suspension?.cause, 'CONSTITUTIONAL_CRISIS');
  });

  it('refuses to suspend below the threshold', () => {
    const h = file(BASE, 'alpha', 'OPERATOR');
    assert.throws(() => suspendForCrisis(checkCapture(h, 2), AT, CONVENED, h), CrisisError);
  });

  it('attributes the suspension to RECORD, not to a participant', () => {
    const h = captured();
    const result = suspendForCrisis(checkCapture(h, 2), AT, CONVENED, h);
    assert.equal(result.entry.actor, 'RECORD');
  });

  it('cannot be prorogued away — the receipts must survive', () => {
    const h = captured();
    const suspended = suspendForCrisis(checkCapture(h, 2), AT, CONVENED, h);
    assert.throws(
      () =>
        prorogue(
          { at: AT, actor: 'corrupt-speaker', role: 'AUTHORITY', trigger: 'TRIGGER_SPEAKER', state: suspended.state },
          suspended.hansard,
        ),
      /cannot be prorogued/,
    );
  });
});

describe('external review', () => {
  const suspended = () => {
    let h = file(BASE, 'alpha', 'OPERATOR');
    h = file(h, 'bravo', 'OPERATOR');
    return suspendForCrisis(checkCapture(h, 2), AT, CONVENED, h);
  };

  const base = {
    at: AT,
    accused: 'corrupt-speaker',
    reasons: 'The filings are made out on the record.',
  } as const;

  it('refuses the accused ruling on their own crisis', () => {
    const s = suspended();
    assert.throws(
      () =>
        externalReview(
          { ...base, reviewer: 'corrupt-speaker', ruling: 'DISMISSED', state: s.state },
          s.hansard,
        ),
      /subject of this crisis and may not rule on it/,
    );
  });

  it('keeps the session suspended when the crisis is UPHELD', () => {
    const s = suspended();
    const result = externalReview(
      { ...base, reviewer: 'external', ruling: 'UPHELD', state: s.state },
      s.hansard,
    );
    assert.equal(result.state.state, 'SUSPENDED');
    assert.equal(result.state.suspension?.cause, 'CONSTITUTIONAL_CRISIS');
  });

  it('resumes the session only when DISMISSED', () => {
    const s = suspended();
    const result = externalReview(
      { ...base, reviewer: 'external', ruling: 'DISMISSED', state: s.state },
      s.hansard,
    );
    assert.equal(result.state.state, 'CONVENED');
    assert.equal(result.state.suspension, null);
  });

  it('requires stated reasons', () => {
    const s = suspended();
    assert.throws(
      () =>
        externalReview(
          { ...base, reviewer: 'external', ruling: 'UPHELD', reasons: '   ', state: s.state },
          s.hansard,
        ),
      /must state its reasons/,
    );
  });

  it('refuses to review a session that is not in crisis', () => {
    assert.throws(
      () =>
        externalReview(
          { ...base, reviewer: 'external', ruling: 'UPHELD', state: CONVENED },
          BASE,
        ),
      /not in constitutional crisis/,
    );
  });
});
