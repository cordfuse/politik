import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DivisionError,
  alreadyEnacted,
  callDivision,
  castVote,
  grantAssent,
  recordOutcome,
  tallyDivision,
  votesFor,
} from '../src/division.ts';
import { createState } from '../src/state.ts';
import { parseEntries } from '../src/hansard.ts';

const CONVENED = createState({
  session_guid: 'div-test',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const SUSPENDED = createState({
  ...CONVENED,
  state: 'SUSPENDED',
  updated_at: '2026-04-08T14:00:00Z',
  suspension: {
    cause: 'POINT_OF_ORDER',
    since: '2026-04-08T14:00:00Z',
    record_ref: null,
    escalation_ref: null,
  },
});

const AT = '2026-04-08T15:00:00Z';
const BASE = '# HANSARD\n\n---\n';

/** Cast a run of votes onto a Hansard. */
const withVotes = (
  votes: readonly { actor: string; vote: 'AYE' | 'NO' | 'ABSTAIN' }[],
  motion = 'motion-001',
): string =>
  votes.reduce(
    (hansard, v) =>
      castVote(
        { motion, at: AT, actor: v.actor, role: 'OPERATOR', vote: v.vote, state: CONVENED },
        hansard,
      ).hansard,
    BASE,
  );

describe('calling a Division', () => {
  it('records the Motion and reviewers', () => {
    const result = callDivision(
      {
        motion: 'motion-001',
        at: AT,
        actor: 'speaker',
        role: 'AUTHORITY',
        reviewers: ['alpha', 'bravo'],
        state: CONVENED,
      },
      BASE,
    );
    assert.equal(result.entry.type, 'DIVISION_CALLED');
    assert.equal(result.entry.fields?.['Reviewers'], 'alpha, bravo');
  });

  it('refuses while the session is suspended', () => {
    assert.throws(
      () =>
        callDivision(
          { motion: 'm', at: AT, actor: 's', role: 'AUTHORITY', reviewers: [], state: SUSPENDED },
          BASE,
        ),
      DivisionError,
    );
  });
});

describe('casting votes', () => {
  it('records a vote against the Motion', () => {
    const hansard = withVotes([{ actor: 'alpha', vote: 'AYE' }]);
    const votes = votesFor(hansard, 'motion-001');
    assert.equal(votes.length, 1);
    assert.equal(votes[0]?.vote, 'AYE');
    assert.equal(votes[0]?.actor, 'alpha');
  });

  it('scopes votes to their Motion', () => {
    let hansard = withVotes([{ actor: 'alpha', vote: 'AYE' }]);
    hansard = castVote(
      { motion: 'motion-002', at: AT, actor: 'alpha', role: 'OPERATOR', vote: 'NO', state: CONVENED },
      hansard,
    ).hansard;
    assert.equal(votesFor(hansard, 'motion-001').length, 1);
    assert.equal(votesFor(hansard, 'motion-002').length, 1);
  });

  it('refuses a second vote from the same actor', () => {
    const hansard = withVotes([{ actor: 'alpha', vote: 'AYE' }]);
    assert.throws(
      () =>
        castVote(
          { motion: 'motion-001', at: AT, actor: 'alpha', role: 'OPERATOR', vote: 'NO', state: CONVENED },
          hansard,
        ),
      /already voted AYE/,
    );
  });

  it('refuses an OBSERVER — no floor rights', () => {
    assert.throws(
      () =>
        castVote(
          { motion: 'm', at: AT, actor: 'gallery', role: 'OBSERVER', vote: 'AYE', state: CONVENED },
          BASE,
        ),
      /no floor rights/,
    );
  });

  it('refuses while the session is suspended', () => {
    assert.throws(
      () =>
        castVote(
          { motion: 'm', at: AT, actor: 'a', role: 'OPERATOR', vote: 'AYE', state: SUSPENDED },
          BASE,
        ),
      DivisionError,
    );
  });
});

describe('tallying', () => {
  it('carries on a majority with quorum', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]),
      'motion-001',
      2,
    );
    assert.ok(outcome.carried);
    assert.equal(outcome.ayes, 2);
    assert.match(outcome.reason, /carried 2 to 0/);
  });

  it('rejects on a minority', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'NO' }, { actor: 'c', vote: 'NO' }]),
      'motion-001',
      2,
    );
    assert.ok(!outcome.carried);
    assert.match(outcome.reason, /rejected/);
  });

  it('does not carry a tie — no majority is a DEADLOCK, not a pass', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'NO' }]),
      'motion-001',
      2,
    );
    assert.ok(!outcome.carried);
    assert.match(outcome.reason, /DEADLOCK/);
  });

  it('excludes abstentions from quorum', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'ABSTAIN' }]),
      'motion-001',
      2,
    );
    assert.ok(!outcome.quorum_met, 'an abstention must not make quorum');
    assert.ok(!outcome.carried);
    assert.equal(outcome.abstentions, 1);
  });

  it('fails a Division with no votes at all', () => {
    const outcome = tallyDivision(BASE, 'motion-001', 2);
    assert.ok(!outcome.carried);
    assert.ok(!outcome.quorum_met);
  });

  it('carries under an acknowledged degraded quorum', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }]),
      'motion-001',
      2,
      { enabled: true, reason: 'second Minister unavailable', acknowledged_by: 'AUTHORITY' },
    );
    assert.ok(outcome.carried);
    assert.match(outcome.reason, /degraded/);
  });

  it('records the quorum threshold in force, not merely that it was met', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]),
      'motion-001',
      2,
    );
    assert.equal(outcome.quorum_required, 2);
    const result = recordOutcome(outcome, AT, 'speaker', 'AUTHORITY', BASE);
    // A Division entry must be auditable on its own terms: a reader should not
    // have to recover the Charter as it stood to know what "met" meant.
    assert.equal(result.entry.fields?.['Quorum'], 'met (2 required)');
  });

  it('records the threshold even when quorum failed', () => {
    const outcome = tallyDivision(withVotes([{ actor: 'a', vote: 'AYE' }]), 'motion-001', 3);
    assert.equal(outcome.quorum_required, 3);
    const result = recordOutcome(outcome, AT, 'speaker', 'AUTHORITY', BASE);
    assert.equal(result.entry.fields?.['Quorum'], 'NOT MET (3 required)');
  });

  it('records the outcome as a typed entry', () => {
    const outcome = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]),
      'motion-001',
      2,
    );
    const result = recordOutcome(outcome, AT, 'speaker', 'AUTHORITY', BASE);
    assert.equal(result.entry.type, 'MOTION_CARRIED');
    assert.equal(result.entry.fields?.['Ayes'], '2');
  });
});

describe('Assent — the Division decides, the Assent enacts', () => {
  const carried = () =>
    tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]),
      'motion-001',
      2,
    );

  const base = {
    motion: 'motion-001',
    at: AT,
    assent_role: 'AUTHORITY',
    state: CONVENED,
  } as const;

  it('enacts a carried Motion', () => {
    const result = grantAssent(
      { ...base, actor: 'speaker', role: 'AUTHORITY', outcome: carried() },
      BASE,
    );
    assert.equal(result.entry.type, 'ASSENT_GRANTED');
    assert.equal(result.entry.fields?.['Effect'], 'enacted');
  });

  it('refuses an actor who does not hold ASSENT', () => {
    for (const role of ['DELEGATE', 'OPERATOR', 'MEMBER', 'OBSERVER'] as const) {
      assert.throws(
        () => grantAssent({ ...base, actor: 'x', role, outcome: carried() }, BASE),
        /ASSENT is held by AUTHORITY/,
        `${role} must not grant Assent`,
      );
    }
  });

  it('honours a Charter that grants ASSENT elsewhere', () => {
    const result = grantAssent(
      { ...base, actor: 'deputy', role: 'DELEGATE', assent_role: 'DELEGATE', outcome: carried() },
      BASE,
    );
    assert.equal(result.entry.type, 'ASSENT_GRANTED');
  });

  it('refuses a Motion that did not carry', () => {
    const rejected = tallyDivision(
      withVotes([{ actor: 'a', vote: 'NO' }, { actor: 'b', vote: 'NO' }]),
      'motion-001',
      2,
    );
    assert.throws(
      () => grantAssent({ ...base, actor: 'speaker', role: 'AUTHORITY', outcome: rejected }, BASE),
      /nothing to enact/,
    );
  });

  it('refuses while the session is suspended', () => {
    assert.throws(
      () =>
        grantAssent(
          { ...base, actor: 'speaker', role: 'AUTHORITY', outcome: carried(), state: SUSPENDED },
          BASE,
        ),
      DivisionError,
    );
  });

  it('refuses Assent while a veto stands (ADR-0004 fourth condition)', () => {
    assert.throws(
      () =>
        grantAssent(
          { ...base, actor: 'speaker', role: 'AUTHORITY', outcome: carried(), veto_outstanding: true },
          BASE,
        ),
      /a veto stands against/,
    );
  });

  it('refuses to enact the same Motion twice', () => {
    const first = grantAssent(
      { ...base, actor: 'speaker', role: 'AUTHORITY', outcome: carried() },
      BASE,
    );
    assert.ok(alreadyEnacted(first.hansard, 'motion-001'));
    assert.throws(
      () =>
        grantAssent(
          { ...base, actor: 'speaker', role: 'AUTHORITY', outcome: carried() },
          first.hansard,
        ),
      /already received Assent/,
    );
  });
});

describe('the full cycle on one record', () => {
  it('reads back as an ordered, attributed governance history', () => {
    let hansard = BASE;
    hansard = callDivision(
      { motion: 'motion-001', at: AT, actor: 'speaker', role: 'AUTHORITY', reviewers: ['a', 'b'], state: CONVENED },
      hansard,
    ).hansard;
    for (const actor of ['a', 'b']) {
      hansard = castVote(
        { motion: 'motion-001', at: AT, actor, role: 'OPERATOR', vote: 'AYE', state: CONVENED },
        hansard,
      ).hansard;
    }
    const outcome = tallyDivision(hansard, 'motion-001', 2);
    hansard = recordOutcome(outcome, AT, 'speaker', 'AUTHORITY', hansard).hansard;
    hansard = grantAssent(
      { motion: 'motion-001', at: AT, actor: 'speaker', role: 'AUTHORITY', assent_role: 'AUTHORITY', outcome, state: CONVENED },
      hansard,
    ).hansard;

    assert.deepEqual(parseEntries(hansard).map((e) => e.type), [
      'DIVISION_CALLED',
      'VOTE_CAST',
      'VOTE_CAST',
      'MOTION_CARRIED',
      'ASSENT_GRANTED',
    ]);
  });
});
