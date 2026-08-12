/**
 * Tournament — the MATCH primitive and pairing (ADR-0009).
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { appendEntry } from '../src/hansard.ts';
import {
  TournamentError, gamesToWin, isPairingFormat, matchCreatedEntry, matches,
  pairRound, reportMatch,
} from '../src/tournament.ts';
import type { Standing } from '../src/standings.ts';

const T = '2026-01-01T00:00:00Z';
const st = (actor: string, wins: number, losses: number): Standing =>
  ({ actor, seat: null, wins, losses, eliminated: losses > 0, eliminated_at: null, buchholz: 0 });

const key = (p: { a: string; b: string | null }) => `${p.a}-${p.b ?? 'bye'}`;

describe('isPairingFormat', () => {
  it('accepts the three formats and nothing else', () => {
    assert.ok(isPairingFormat('swiss'));
    assert.ok(isPairingFormat('single-elim'));
    assert.equal(isPairingFormat('knockout'), false);
  });
});

describe('pairRound — single-elim', () => {
  const table = [st('a', 0, 0), st('b', 0, 0), st('c', 0, 0), st('d', 0, 0)];

  it('pairs the whole undefeated field in round 1', () => {
    const pairs = pairRound(['a', 'b', 'c', 'd'], table, 'single-elim', 1, []);
    assert.equal(pairs.length, 2);
    // seeded by score then name → a-b, c-d
    assert.deepEqual(pairs.map(key), ['a-b', 'c-d']);
  });

  it('drops a defeated contestant from the bracket', () => {
    const t2 = [st('a', 1, 0), st('c', 1, 0), st('b', 0, 1), st('d', 0, 1)];
    const pairs = pairRound(['a', 'b', 'c', 'd'], t2, 'single-elim', 2, []);
    // only a and c are undefeated
    assert.deepEqual(pairs.map(key), ['a-c']);
  });

  it('returns no pairings once one contestant remains undefeated (champion)', () => {
    const t3 = [st('a', 2, 0), st('c', 1, 1), st('b', 0, 1), st('d', 0, 1)];
    assert.deepEqual(pairRound(['a', 'b', 'c', 'd'], t3, 'single-elim', 3, []), []);
  });
});

describe('pairRound — swiss and round-robin', () => {
  it('swiss pairs by score and never rematches', () => {
    const table = [st('a', 1, 0), st('b', 1, 0), st('c', 0, 1), st('d', 0, 1)];
    // a and b already played round 1
    const played = matches(appendEntry('# H\n', matchCreatedEntry({ a: 'a', b: 'b' }, 1, T)));
    const pairs = pairRound(['a', 'b', 'c', 'd'], table, 'swiss', 2, played);
    // a can't face b again → a-c, then b-d
    assert.deepEqual(pairs.map(key), ['a-c', 'b-d']);
  });

  it('round-robin gives a bye when no un-played opponent remains', () => {
    const table = [st('a', 0, 0), st('b', 0, 0), st('c', 0, 0)];
    let h = '# H\n';
    for (const p of [{ a: 'a', b: 'b' }, { a: 'a', b: 'c' }, { a: 'b', b: 'c' }]) {
      h = appendEntry(h, matchCreatedEntry(p, 1, T));
    }
    // everyone has played everyone → all byes
    const pairs = pairRound(['a', 'b', 'c'], table, 'round-robin', 2, matches(h));
    assert.ok(pairs.every((p) => p.b === null));
  });
});

describe('pairRound — seeding', () => {
  const table = [st('a', 0, 0), st('b', 0, 0), st('c', 0, 0), st('d', 0, 0)];

  it('folds the seeded field in round 1 — top half vs bottom half', () => {
    // seed strongest→weakest a,b,c,d → top [a,b] vs bottom [c,d] → a-c, b-d
    // (not the a-b, c-d a name sort would give), so #1 and #2 avoid each other.
    const pairs = pairRound(['a', 'b', 'c', 'd'], table, 'single-elim', 1, [], ['a', 'b', 'c', 'd']);
    assert.deepEqual(pairs.map(key), ['a-c', 'b-d']);
  });

  it('gives the lowest top-half seed a bye on an odd seeded field', () => {
    const t3 = [st('a', 0, 0), st('b', 0, 0), st('c', 0, 0)];
    // top = [a,b], bottom = [c] → a-c, then b has no bottom partner → bye
    const pairs = pairRound(['a', 'b', 'c'], t3, 'single-elim', 1, [], ['a', 'b', 'c']);
    assert.deepEqual(pairs.map(key), ['a-c', 'b-bye']);
  });

  it('breaks equal-score ties by seed in later rounds', () => {
    // all 1-0 after round 1; c is seeded above b, so among equals c pairs before b.
    const t = [st('a', 1, 0), st('b', 1, 0), st('c', 1, 0), st('d', 1, 0)];
    const played = matches(appendEntry('# H\n', matchCreatedEntry({ a: 'x', b: 'y' }, 1, T)));
    const seeded = pairRound(['a', 'b', 'c', 'd'], t, 'swiss', 2, played, ['a', 'c', 'b', 'd']);
    // order by seed within the 1-0 group: a, c, b, d → a-c, b-d
    assert.deepEqual(seeded.map(key), ['a-c', 'b-d']);
  });
});

describe('reportMatch — best of one', () => {
  const withMatch = () => appendEntry('# H\n', matchCreatedEntry({ a: 'a', b: 'b' }, 1, T));

  it('records the winner and derives the loser', () => {
    const r = reportMatch('r1-a-b', 'a', T, 'ref', withMatch());
    assert.equal(r.entry.type, 'MATCH_DECIDED');
    assert.equal(r.decided, true);
    assert.equal(r.entry.fields?.['Winner'], 'a');
    assert.equal(r.entry.fields?.['Loser'], 'b');
    assert.equal(matches(r.hansard)[0]?.winner, 'a');
  });

  it('refuses a winner who is not in the match', () => {
    assert.throws(() => reportMatch('r1-a-b', 'z', T, 'ref', withMatch()), /not in match/);
  });

  it('refuses an unknown match', () => {
    assert.throws(() => reportMatch('r9-x-y', 'x', T, 'ref', withMatch()), TournamentError);
  });

  it('refuses to re-decide a settled match', () => {
    const decided = reportMatch('r1-a-b', 'a', T, 'ref', withMatch()).hansard;
    assert.throws(() => reportMatch('r1-a-b', 'b', T, 'ref', decided), /already decided/);
  });
});

describe('reportMatch — best of N', () => {
  const bo3 = () => appendEntry('# H\n', matchCreatedEntry({ a: 'a', b: 'b' }, 1, T, 3));

  it('gamesToWin is the majority', () => {
    assert.equal(gamesToWin(1), 1);
    assert.equal(gamesToWin(3), 2);
    assert.equal(gamesToWin(5), 3);
  });

  it('records a game without settling until a side wins the majority', () => {
    const g1 = reportMatch('r1-a-b', 'a', T, 'ref', bo3());
    assert.equal(g1.entry.type, 'MATCH_GAME');
    assert.equal(g1.decided, false);
    assert.deepEqual(g1.games, { a: 1, b: 0 });
    assert.equal(matches(g1.hansard)[0]?.winner, null, 'one game does not decide a best-of-three');

    // b levels it, then a takes the third game and the match.
    const g2 = reportMatch('r1-a-b', 'b', T, 'ref', g1.hansard);
    assert.deepEqual(g2.games, { a: 1, b: 1 });
    assert.equal(g2.decided, false);

    const g3 = reportMatch('r1-a-b', 'a', T, 'ref', g2.hansard);
    assert.deepEqual(g3.games, { a: 2, b: 1 });
    assert.equal(g3.decided, true);
    assert.equal(matches(g3.hansard)[0]?.winner, 'a');
  });

  it('a sweep settles in the minimum number of games', () => {
    let h = bo3();
    h = reportMatch('r1-a-b', 'b', T, 'ref', h).hansard;
    const clincher = reportMatch('r1-a-b', 'b', T, 'ref', h);
    assert.equal(clincher.decided, true);
    assert.deepEqual(clincher.games, { a: 0, b: 2 });
    assert.equal(matches(clincher.hansard)[0]?.winner, 'b');
  });

  it('refuses another game once the match is settled', () => {
    let h = bo3();
    h = reportMatch('r1-a-b', 'a', T, 'ref', h).hansard;
    h = reportMatch('r1-a-b', 'a', T, 'ref', h).hansard; // a wins 2-0
    assert.throws(() => reportMatch('r1-a-b', 'b', T, 'ref', h), /already decided/);
  });
});
