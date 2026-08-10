import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DivisionError,
  suspendForDeadlock,
  breakDeadlock,
  alreadyEnacted,
  callDivision,
  castVote,
  grantAssent,
  recordOutcome,
  tallyDivision,
  votesFor,
} from '../src/division.ts';
import { cull } from '../src/division.ts';
import { hire } from '../src/actors.ts';
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

/** A Hansard with a Division already called on the motion — the precondition
 * for any vote. Votes cannot be cast into a Division that was never called. */
const withCall = (hansard: string, motion = 'motion-001'): string =>
  callDivision(
    { motion, at: AT, actor: 'speaker', role: 'AUTHORITY', reviewers: [], state: CONVENED },
    hansard,
  ).hansard;

/** Cast a run of votes onto a Hansard, calling the Division first. */
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
    withCall(BASE, motion),
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
    hansard = withCall(hansard, 'motion-002');
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

describe('deadlock suspends rather than silently passing', () => {
  const tied = () =>
    tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'NO' }]),
      'motion-001',
      2,
    );

  it('suspends with cause DEADLOCK', () => {
    const result = suspendForDeadlock(tied(), AT, CONVENED, BASE);
    assert.equal(result.state.state, 'SUSPENDED');
    assert.equal(result.state.suspension?.cause, 'DEADLOCK');
    assert.equal(result.entry.type, 'DEADLOCK');
  });

  it('routes resolution to AUTHORITY — a tie is the absence of a decision', () => {
    assert.match(suspendForDeadlock(tied(), AT, CONVENED, BASE).entry.fields?.['Resolution'] ?? '', /AUTHORITY/);
  });

  it('refuses when the Division actually decided something', () => {
    const carried = tallyDivision(
      withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]),
      'motion-001',
      2,
    );
    assert.throws(() => suspendForDeadlock(carried, AT, CONVENED, BASE), DivisionError);
  });

  describe('AUTHORITY breaks it with a casting vote', () => {
    const deadlockState = suspendForDeadlock(tied(), AT, CONVENED, BASE).state;
    const votes = withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'NO' }]);

    it('carry casts an AYE, decides the Motion, and resumes', () => {
      const r = breakDeadlock('motion-001', 'carry', AT, 'speaker', deadlockState, votes, 2);
      assert.equal(r.outcome.carried, true);
      assert.equal(r.state.state, 'CONVENED');
      assert.equal(r.state.suspension, null);
      // the casting vote is recorded, then the outcome it produces
      assert.equal(r.entries[0]?.type, 'VOTE_CAST');
      assert.equal(r.entries[0]?.fields?.['Vote'], 'AYE');
      assert.equal(r.entries[1]?.type, 'MOTION_CARRIED');
    });

    it('reject casts a NO and the Motion falls', () => {
      const r = breakDeadlock('motion-001', 'reject', AT, 'speaker', deadlockState, votes, 2);
      assert.equal(r.outcome.carried, false);
      assert.equal(r.entries[0]?.fields?.['Vote'], 'NO');
      assert.equal(r.entries[1]?.type, 'MOTION_REJECTED');
    });

    it('refuses on a session that is not deadlocked', () => {
      assert.throws(() => breakDeadlock('motion-001', 'carry', AT, 'speaker', CONVENED, votes, 2), DivisionError);
    });
  });
});

describe('a vote requires a Division to have been called', () => {
  it('refuses a vote on a Motion no Division was called on', () => {
    assert.throws(
      () =>
        castVote(
          { motion: 'never-called', at: AT, actor: 'a', role: 'OPERATOR', vote: 'AYE', state: CONVENED },
          BASE,
        ),
      (error: unknown) =>
        error instanceof DivisionError && /no Division has been called/.test(error.message),
      'phantom votes would let an un-called Motion be tallied as carried',
    );
  });

  it('accepts the vote once the Division is called', () => {
    const hansard = withCall(BASE, 'real-motion');
    const result = castVote(
      { motion: 'real-motion', at: AT, actor: 'a', role: 'OPERATOR', vote: 'AYE', state: CONVENED },
      hansard,
    );
    assert.equal(result.entry.type, 'VOTE_CAST');
  });
});

describe('exit: elimination culls the losing side (ADR-0007)', () => {
  const speaker = { at: AT, actor: 'speaker', role: 'AUTHORITY' as const, state: CONVENED };
  const seated = (...names: string[]) =>
    names.reduce((h, n) => hire({ ...speaker, subject: n, seat: 'MEMBER', reason: 'seated' }, h).hansard, BASE);
  const ballot = (base: string, votes: readonly { actor: string; vote: 'AYE' | 'NO' | 'ABSTAIN' }[]) => {
    let h = withCall(base, 'm');
    for (const v of votes) {
      h = castVote({ motion: 'm', at: AT, actor: v.actor, role: 'MEMBER', vote: v.vote, state: CONVENED }, h).hansard;
    }
    return h;
  };

  it('culls the seated minority when the Motion carries', () => {
    const h = ballot(seated('alpha', 'bravo', 'charlie'), [
      { actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'AYE' }, { actor: 'charlie', vote: 'NO' },
    ]);
    const exits = cull(h, 'm', 'elimination', AT);
    assert.equal(exits.length, 1);
    assert.equal(exits[0]!.fields?.['Actor affected'], 'charlie');
    assert.equal(exits[0]!.fields?.['Exit type'], 'EXIT_DARWINIST');
  });

  it('culls the AYE side when the Motion is rejected', () => {
    const h = ballot(seated('alpha', 'bravo', 'charlie'), [
      { actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'NO' }, { actor: 'charlie', vote: 'NO' },
    ]);
    assert.deepEqual(cull(h, 'm', 'elimination', AT).map((e) => e.fields?.['Actor affected']), ['alpha']);
  });

  it('culls no one on a tie', () => {
    const h = ballot(seated('alpha', 'bravo'), [{ actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'NO' }]);
    assert.deepEqual(cull(h, 'm', 'elimination', AT), []);
  });

  it('spares abstainers — they took no side', () => {
    const h = ballot(seated('alpha', 'bravo', 'charlie'), [
      { actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'AYE' }, { actor: 'charlie', vote: 'ABSTAIN' },
    ]);
    assert.deepEqual(cull(h, 'm', 'elimination', AT), []);
  });

  it('does nothing under the default division policy', () => {
    const h = ballot(seated('alpha', 'bravo', 'charlie'), [
      { actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'AYE' }, { actor: 'charlie', vote: 'NO' },
    ]);
    assert.deepEqual(cull(h, 'm', 'division', AT), []);
  });

  it('does not cull an unseated loser — only seated actors can be eliminated', () => {
    const h = ballot(seated('alpha', 'bravo'), [
      { actor: 'alpha', vote: 'AYE' }, { actor: 'bravo', vote: 'AYE' }, { actor: 'charlie', vote: 'NO' },
    ]);
    assert.deepEqual(cull(h, 'm', 'elimination', AT), []);
  });
});

describe('resolution strategies — same ballot, different verdict (ADR-0007)', () => {
  // Two AYE, one NO — the ballot that separates the rules.
  const split = withVotes([
    { actor: 'a', vote: 'AYE' },
    { actor: 'b', vote: 'AYE' },
    { actor: 'c', vote: 'NO' },
  ]);

  it('majority carries 2 to 1', () => {
    assert.equal(tallyDivision(split, 'motion-001', 1).carried, true);
  });

  it('unanimity rejects the same ballot — one dissent hangs it', () => {
    const outcome = tallyDivision(split, 'motion-001', 1, null, 'unanimity');
    assert.equal(outcome.carried, false);
    assert.match(outcome.reason, /unanimity required/);
  });

  it('unanimity carries only when every vote is AYE', () => {
    const clean = withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]);
    assert.equal(tallyDivision(clean, 'motion-001', 1, null, 'unanimity').carried, true);
  });

  it('unanimity hangs on an abstention, not just a NO', () => {
    const abstained = withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'ABSTAIN' }]);
    assert.equal(tallyDivision(abstained, 'motion-001', 1, null, 'unanimity').carried, false);
  });

  it('supermajority carries 2 to 1 (two-thirds) but rejects 3 to 2', () => {
    assert.equal(tallyDivision(split, 'motion-001', 1, null, 'supermajority').carried, true);
    const threeTwo = withVotes([
      { actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }, { actor: 'c', vote: 'AYE' },
      { actor: 'd', vote: 'NO' }, { actor: 'e', vote: 'NO' },
    ]);
    assert.equal(tallyDivision(threeTwo, 'motion-001', 1, null, 'supermajority').carried, false);
  });

  it('defaults to majority when no strategy is given — behavior is unchanged', () => {
    assert.deepEqual(
      tallyDivision(split, 'motion-001', 1),
      tallyDivision(split, 'motion-001', 1, null, 'majority'),
    );
  });
});

describe('only a CANON role may act on a Division', () => {
  it('refuses a vote whose role is not a CANON role', () => {
    assert.throws(
      () =>
        castVote(
          { motion: 'motion-001', at: AT, actor: 'a', role: 'KING' as never, vote: 'AYE', state: CONVENED },
          withCall(BASE),
        ),
      (error: unknown) => error instanceof DivisionError && /not a CANON role/.test(error.message),
      'a non-CANON role must never reach the immutable record',
    );
  });

  it('refuses a Division call whose role is not a CANON role', () => {
    assert.throws(
      () =>
        callDivision(
          { motion: 'm', at: AT, actor: 'x', role: 'WIZARD' as never, reviewers: [], state: CONVENED },
          BASE,
        ),
      (error: unknown) => error instanceof DivisionError && /not a CANON role/.test(error.message),
    );
  });
});

describe('a decided Division is closed — one Division per Motion', () => {
  // A carried Motion, outcome recorded.
  const decided = (() => {
    const voted = withVotes([{ actor: 'a', vote: 'AYE' }, { actor: 'b', vote: 'AYE' }]);
    const outcome = tallyDivision(voted, 'motion-001', 2);
    return recordOutcome(outcome, AT, 'speaker', 'AUTHORITY', voted).hansard;
  })();

  it('refuses a late vote once the outcome is on the record', () => {
    assert.throws(
      () =>
        castVote(
          { motion: 'motion-001', at: AT, actor: 'latecomer', role: 'OPERATOR', vote: 'NO', state: CONVENED },
          decided,
        ),
      (error: unknown) => error instanceof DivisionError && /has closed/.test(error.message),
      'a settled decision must not be overturnable by a late vote',
    );
  });

  it('refuses a second Division call on the same Motion', () => {
    assert.throws(
      () =>
        callDivision(
          { motion: 'motion-001', at: AT, actor: 'speaker', role: 'AUTHORITY', reviewers: [], state: CONVENED },
          decided,
        ),
      (error: unknown) => error instanceof DivisionError && /already been called/.test(error.message),
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
