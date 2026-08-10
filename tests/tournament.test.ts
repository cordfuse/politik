/**
 * Tournament — the MATCH primitive and pairing (ADR-0009).
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { appendEntry } from '../src/hansard.ts';
import {
  TournamentError, isPairingFormat, matchCreatedEntry, matches, pairRound, reportMatch,
} from '../src/tournament.ts';
import type { Standing } from '../src/standings.ts';

const T = '2026-01-01T00:00:00Z';
const st = (actor: string, wins: number, losses: number): Standing =>
  ({ actor, seat: null, wins, losses, eliminated: losses > 0, eliminated_at: null });

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

describe('reportMatch', () => {
  const withMatch = () => appendEntry('# H\n', matchCreatedEntry({ a: 'a', b: 'b' }, 1, T));

  it('records the winner and derives the loser', () => {
    const r = reportMatch('r1-a-b', 'a', T, 'ref', withMatch());
    assert.equal(r.entry.type, 'MATCH_DECIDED');
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
