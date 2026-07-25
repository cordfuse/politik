import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorError,
  disputeExit,
  speakerOrder,
  EXIT_TYPES,
  demote,
  exitActor,
  hire,
  isVoluntary,
  promote,
  seatOf,
  seats,
  spawnChild,
  veto,
  vetoOutstanding,
} from '../src/actors.ts';
import { createState } from '../src/state.ts';

const CONVENED = createState({
  session_guid: 'actors',
  protocol: 'parliamentary',
  state: 'CONVENED',
  quorum: { required: 2, present: 2 },
  updated_at: '2026-04-08T14:00:00Z',
});

const SUSPENDED = createState({
  ...CONVENED,
  state: 'SUSPENDED',
  updated_at: '2026-04-08T14:00:00Z',
  suspension: { cause: 'POINT_OF_ORDER', since: '2026-04-08T14:00:00Z', record_ref: null, escalation_ref: null },
});

const AT = '2026-04-08T15:00:00Z';
const BASE = '# HANSARD\n\n---\n';
const speaker = { at: AT, actor: 'speaker', role: 'AUTHORITY', state: CONVENED } as const;

const seated = (): string =>
  hire({ ...speaker, subject: 'alpha', seat: 'OPERATOR', reason: 'seated' }, BASE).hansard;

describe('HIRE', () => {
  it('seats an actor', () => {
    const h = seated();
    assert.equal(seatOf(h, 'alpha')?.role, 'OPERATOR');
  });

  it('refuses a non-AUTHORITY actor', () => {
    assert.throws(
      () => hire({ ...speaker, actor: 'alpha', role: 'OPERATOR', subject: 'x', seat: 'MEMBER', reason: 'r' }, BASE),
      /AUTHORITY power/,
    );
  });

  it('refuses to grant AUTHORITY — the Speaker is constitutional, not appointed', () => {
    assert.throws(
      () => hire({ ...speaker, subject: 'x', seat: 'AUTHORITY', reason: 'r' }, BASE),
      /cannot be granted by HIRE/,
    );
  });

  it('refuses to double-seat an actor', () => {
    assert.throws(
      () => hire({ ...speaker, subject: 'alpha', seat: 'MEMBER', reason: 'r' }, seated()),
      /already holds a seat/,
    );
  });

  it('refuses while suspended', () => {
    assert.throws(
      () => hire({ ...speaker, state: SUSPENDED, subject: 'x', seat: 'MEMBER', reason: 'r' }, BASE),
      ActorError,
    );
  });
});

describe('PROMOTE and DEMOTE', () => {
  it('promotes upward and the roster reflects it', () => {
    const h = hire({ ...speaker, subject: 'back', seat: 'MEMBER', reason: 'r' }, BASE).hansard;
    const promoted = promote({ ...speaker, subject: 'back', to: 'OPERATOR', reason: 'earned' }, h).hansard;
    assert.equal(seatOf(promoted, 'back')?.role, 'OPERATOR');
  });

  it('demotes downward', () => {
    const demoted = demote({ ...speaker, subject: 'alpha', to: 'MEMBER', reason: 'scope' }, seated()).hansard;
    assert.equal(seatOf(demoted, 'alpha')?.role, 'MEMBER');
  });

  it('refuses a PROMOTE that is really a demotion', () => {
    assert.throws(
      () => promote({ ...speaker, subject: 'alpha', to: 'MEMBER', reason: 'r' }, seated()),
      /that is a DEMOTE/,
    );
  });

  it('refuses a DEMOTE that is really a promotion', () => {
    assert.throws(
      () => demote({ ...speaker, subject: 'alpha', to: 'DELEGATE', reason: 'r' }, seated()),
      /that is a PROMOTE/,
    );
  });

  it('refuses promotion into AUTHORITY', () => {
    assert.throws(
      () => promote({ ...speaker, subject: 'alpha', to: 'AUTHORITY', reason: 'r' }, seated()),
      /may be promoted into AUTHORITY/,
    );
  });

  it('refuses to move an actor holding no seat', () => {
    assert.throws(
      () => promote({ ...speaker, subject: 'ghost', to: 'OPERATOR', reason: 'r' }, BASE),
      /holds no seat/,
    );
  });
});

describe('EXIT', () => {
  it('records every CANON exit type', () => {
    assert.equal(EXIT_TYPES.length, 9);
  });

  it('removes the actor from the roster', () => {
    const h = exitActor(
      { ...speaker, subject: 'alpha', exit_type: 'EXIT_PERFORMANCE', reason: 'missed criteria' },
      seated(),
    ).hansard;
    assert.equal(seatOf(h, 'alpha'), null);
    assert.equal(seats(h).length, 0);
  });

  it('refuses a third party recording a voluntary exit — the voluntold pattern', () => {
    // The most dangerous exit type in the taxonomy: it produces the outcome of
    // an expulsion while generating none of the evidence one would leave.
    for (const type of EXIT_TYPES.filter(isVoluntary)) {
      assert.throws(
        () => exitActor({ ...speaker, subject: 'alpha', exit_type: type, reason: 'he agreed' }, seated()),
        /only be declared by the actor leaving/,
        `${type} must be self-declared`,
      );
    }
  });

  it('lets an actor declare their own withdrawal', () => {
    const h = exitActor(
      {
        at: AT, actor: 'alpha', role: 'OPERATOR', state: CONVENED,
        subject: 'alpha', exit_type: 'EXIT_VOLUNTARY_CONCESSION',
        reason: 'I accept the evidence went against me.',
      },
      seated(),
    ).hansard;
    assert.equal(seatOf(h, 'alpha'), null);
  });

  it('refuses an involuntary removal by a non-AUTHORITY actor', () => {
    assert.throws(
      () =>
        exitActor(
          { at: AT, actor: 'bravo', role: 'OPERATOR', state: CONVENED, subject: 'alpha', exit_type: 'EXIT_PROTOCOL', reason: 'r' },
          seated(),
        ),
      /AUTHORITY power/,
    );
  });

  it('refuses an exit with no stated reason', () => {
    assert.throws(
      () => exitActor({ ...speaker, subject: 'alpha', exit_type: 'EXIT_PERFORMANCE', reason: '  ' }, seated()),
      /must state its reason/,
    );
  });

  it('enforces a Charter concession requirement', () => {
    assert.throws(
      () =>
        exitActor(
          {
            at: AT, actor: 'alpha', role: 'OPERATOR', state: CONVENED, subject: 'alpha',
            exit_type: 'EXIT_VOLUNTARY_STRATEGIC', reason: '', require_concession: true,
          },
          seated(),
        ),
      ActorError,
    );
  });

  it('records who declared the exit', () => {
    const result = exitActor(
      { ...speaker, subject: 'alpha', exit_type: 'EXIT_PROTOCOL', reason: 'violated Standing Orders' },
      seated(),
    );
    assert.match(result.entry.fields?.['Declared'] ?? '', /speaker \(AUTHORITY\)/);
    assert.equal(result.entry.fields?.['Exit type'], 'EXIT_PROTOCOL');
  });
});

describe('VETO', () => {
  it('lets AUTHORITY veto constitutionally', () => {
    const result = veto({ ...speaker, motion: 'm1', reason: 'irreversible', domain_veto: [] }, BASE);
    assert.match(result.entry.fields?.['Basis'] ?? '', /constitutional/);
    assert.ok(vetoOutstanding(result.hansard, 'm1'));
  });

  it('honours a Charter-granted DOMAIN_VETO on a lower-trust role', () => {
    const result = veto(
      { at: AT, actor: 'jury', role: 'OBSERVER', state: CONVENED, motion: 'm1', reason: 'not proven', domain_veto: ['OBSERVER'] },
      BASE,
    );
    assert.match(result.entry.fields?.['Basis'] ?? '', /DOMAIN_VETO/);
  });

  it('refuses a role holding no veto', () => {
    assert.throws(
      () => veto({ at: AT, actor: 'x', role: 'MEMBER', state: CONVENED, motion: 'm1', reason: 'r', domain_veto: [] }, BASE),
      /holds no veto/,
    );
  });

  it('requires stated grounds', () => {
    assert.throws(
      () => veto({ ...speaker, motion: 'm1', reason: '  ', domain_veto: [] }, BASE),
      /must state its grounds/,
    );
  });

  it('reports no outstanding veto against an unvetoed Motion', () => {
    const h = veto({ ...speaker, motion: 'm1', reason: 'r', domain_veto: [] }, BASE).hansard;
    assert.ok(!vetoOutstanding(h, 'm2'));
  });
});

describe('SPAWN', () => {
  it('records a referral to committee', () => {
    const result = spawnChild({ ...speaker, child: 'politik-cttee-1', mandate: 'Examine the schema question.' }, BASE);
    assert.equal(result.entry.type, 'COMMITTEE_SPAWNED');
    assert.equal(result.entry.fields?.['Parent'], 'actors');
  });

  it('refuses a MEMBER or OBSERVER', () => {
    for (const role of ['MEMBER', 'OBSERVER'] as const) {
      assert.throws(
        () => spawnChild({ at: AT, actor: 'x', role, state: CONVENED, child: 'c', mandate: 'm' }, BASE),
        /may not refer business/,
      );
    }
  });

  it('requires a mandate', () => {
    assert.throws(() => spawnChild({ ...speaker, child: 'c', mandate: ' ' }, BASE), /must state the committee mandate/);
  });
});

describe('Speaker order — the plainest suspension', () => {
  it('suspends with cause SPEAKER_ORDER', () => {
    const result = speakerOrder(AT, 'speaker', 'AUTHORITY', 'Recess.', CONVENED, BASE);
    assert.equal(result.state.state, 'SUSPENDED');
    assert.equal(result.state.suspension?.cause, 'SPEAKER_ORDER');
  });

  it('refuses anyone but AUTHORITY', () => {
    assert.throws(
      () => speakerOrder(AT, 'alpha', 'OPERATOR', 'r', CONVENED, BASE),
      /only AUTHORITY may suspend/,
    );
  });

  it('requires a stated reason', () => {
    assert.throws(() => speakerOrder(AT, 'speaker', 'AUTHORITY', '  ', CONVENED, BASE), ActorError);
  });
});

describe('disputed exit', () => {
  const removed = () =>
    exitActor(
      { ...speaker, subject: 'alpha', exit_type: 'EXIT_PROTOCOL', reason: 'alleged violation' },
      seated(),
    ).hansard;

  it('suspends the sitting with cause DISPUTED_EXIT', () => {
    const result = disputeExit(AT, 'alpha', 'The violation is not in the record.', CONVENED, removed());
    assert.equal(result.state.suspension?.cause, 'DISPUTED_EXIT');
    assert.equal(result.entry.type, 'EXIT_DISPUTED');
    assert.equal(result.entry.fields?.['Removed by'], 'speaker');
  });

  it('refuses a dispute from an actor with no recorded exit', () => {
    assert.throws(() => disputeExit(AT, 'ghost', 'g', CONVENED, seated()), /no recorded exit/);
  });

  it('refuses disputing a departure the actor declared themselves', () => {
    // The mirror image of the voluntold problem: manufacturing a grievance the
    // actor never raised.
    const own = exitActor(
      { at: AT, actor: 'alpha', role: 'OPERATOR', state: CONVENED, subject: 'alpha', exit_type: 'EXIT_VOLUNTARY_CONCESSION', reason: 'I concede.' },
      seated(),
    ).hansard;
    assert.throws(() => disputeExit(AT, 'alpha', 'g', CONVENED, own), /declared themselves/);
  });

  it('requires stated grounds', () => {
    assert.throws(() => disputeExit(AT, 'alpha', '  ', CONVENED, removed()), ActorError);
  });
});
