/**
 * Standings — scoring a competitive protocol from the record.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { appendEntry } from '../src/hansard.ts';
import { standings, type Standing } from '../src/standings.ts';

const T = '2026-01-01T00:00:00Z';
const at = (n: number) => `2026-01-0${n}T00:00:00Z`;

const hired = (h: string, actor: string, role = 'MEMBER') =>
  appendEntry(h, { type: 'ACTOR_HIRED', at: T, actor: 'speaker', role: role as never, fields: { 'Actor affected': actor, Role: role } });
const vote = (h: string, actor: string, motion: string, v: string) =>
  appendEntry(h, { type: 'VOTE_CAST', at: T, actor, role: 'MEMBER', fields: { Motion: motion, Vote: v } });
const outcome = (h: string, motion: string, carried: boolean) =>
  appendEntry(h, { type: carried ? 'MOTION_CARRIED' : 'MOTION_REJECTED', at: T, actor: 'RECORD', role: 'OPERATOR', fields: { Motion: motion } });
const exited = (h: string, actor: string, when: string) =>
  appendEntry(h, { type: 'ACTOR_EXITED', at: when, actor: 'RECORD', role: 'MEMBER', fields: { 'Actor affected': actor, 'Exit type': 'EXIT_DARWINIST' } });

const find = (rows: readonly Standing[], a: string): Standing | undefined => rows.find((r) => r.actor === a);

describe('standings — win-loss', () => {
  it('a vote on the carrying side is a win; the other side a loss; abstain neither', () => {
    let h = '# HANSARD\n';
    h = hired(h, 'a'); h = hired(h, 'b'); h = hired(h, 'c');
    h = vote(h, 'a', 'm1', 'AYE'); h = vote(h, 'b', 'm1', 'NO'); h = vote(h, 'c', 'm1', 'ABSTAIN');
    h = outcome(h, 'm1', true); // carried: a wins, b loses, c neither

    const table = standings(h, 'win-loss');
    assert.deepEqual([find(table, 'a')?.wins, find(table, 'a')?.losses], [1, 0]);
    assert.deepEqual([find(table, 'b')?.wins, find(table, 'b')?.losses], [0, 1]);
    assert.deepEqual([find(table, 'c')?.wins, find(table, 'c')?.losses], [0, 0]);
    // ranked: a (winner) first
    assert.equal(table[0]?.actor, 'a');
  });

  it('a rejected Motion flips the sides — a NO vote wins', () => {
    let h = '# HANSARD\n';
    h = hired(h, 'a'); h = hired(h, 'b');
    h = vote(h, 'a', 'm1', 'AYE'); h = vote(h, 'b', 'm1', 'NO');
    h = outcome(h, 'm1', false); // rejected: b (NO) wins, a (AYE) loses

    assert.equal(find(standings(h), 'b')?.wins, 1);
    assert.equal(find(standings(h), 'a')?.losses, 1);
  });

  it('does not score a Division with no recorded outcome', () => {
    let h = '# HANSARD\n';
    h = hired(h, 'a');
    h = vote(h, 'a', 'open', 'AYE'); // never tallied
    assert.deepEqual([find(standings(h), 'a')?.wins, find(standings(h), 'a')?.losses], [0, 0]);
  });
});

describe('standings — survival', () => {
  it('still-standing rank above the eliminated; the last one out ranks higher', () => {
    let h = '# HANSARD\n';
    h = hired(h, 'a'); h = hired(h, 'b'); h = hired(h, 'c'); h = hired(h, 'd');
    // d eliminated first, c later; a and b still seated
    h = exited(h, 'd', at(1));
    h = exited(h, 'c', at(2));

    const table = standings(h, 'survival');
    const order = table.map((r) => r.actor);
    // a, b (some order) then c then d
    assert.ok(order.indexOf('c') < order.indexOf('d'), 'c survived longer than d');
    assert.ok(order.indexOf('a') < order.indexOf('c'), 'still-seated ahead of eliminated');
    assert.equal(find(table, 'c')?.eliminated, true);
    assert.equal(find(table, 'a')?.eliminated, false);
  });

  it('a reinstated actor is not counted as eliminated', () => {
    let h = '# HANSARD\n';
    h = hired(h, 'a');
    h = exited(h, 'a', at(1));
    h = hired(h, 'a'); // reinstated — seats() shows a again
    assert.equal(find(standings(h), 'a')?.eliminated, false);
  });
});
