/**
 * Tournament — the MATCH primitive and pairing (ADR-0009).
 *
 * A Politik Division is an N-actor vote on a Motion; it has no notion of a
 * contest between two named parties, so the 1v1-match formats (Swiss,
 * round-robin, single-elimination) had nothing to pair. MATCH is the additive
 * primitive that supplies it: a contest between two contestants that resolves to
 * a winner. Pairing generates a round of MATCHes from the field and the standings;
 * reporting a result closes one; standings (scoring, `standings.ts`) reads the
 * results the same way it reads Division outcomes.
 *
 * Pure, like the rest of the governance core: these functions produce entries
 * and pairings; the caller commits them.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import { standings, type Standing } from './standings.ts';

export type PairingFormat = 'swiss' | 'round-robin' | 'single-elim';

export const isPairingFormat = (v: unknown): v is PairingFormat =>
  v === 'swiss' || v === 'round-robin' || v === 'single-elim';

/** A proposed contest. `b` null is a bye — `a` advances unopposed. */
export interface Pairing {
  readonly a: string;
  readonly b: string | null;
}

export interface Match {
  readonly id: string;
  readonly round: number;
  readonly a: string;
  readonly b: string | null;
  readonly winner: string | null;
}

class TournamentError extends Error {}
export { TournamentError };

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');
const matchId = (round: number, a: string, b: string | null): string => `r${round}-${a}-${b ?? 'bye'}`;

/* -------------------------------------------------------------------------- */
/* Reading the record                                                          */
/* -------------------------------------------------------------------------- */

/** Every MATCH on the record, with its result if one has been reported. */
export const matches = (hansard: string): readonly Match[] => {
  const created = new Map<string, { round: number; a: string; b: string | null }>();
  const winners = new Map<string, string>();

  for (const entry of parseEntries(hansard)) {
    const id = entry.fields['Match'];
    if (id === undefined) continue;
    if (entry.type === 'MATCH_CREATED') {
      const b = entry.fields['B'];
      created.set(id, {
        round: Number(entry.fields['Round'] ?? '0'),
        a: entry.fields['A'] ?? '',
        b: b === undefined || b === 'bye' ? null : b,
      });
    } else if (entry.type === 'MATCH_DECIDED') {
      const w = entry.fields['Winner'];
      if (w !== undefined) winners.set(id, w);
    }
  }

  return [...created.entries()].map(([id, m]) => ({
    id, round: m.round, a: m.a, b: m.b, winner: winners.get(id) ?? null,
  }));
};

/** Pairs already contested, so a format never rematches them. */
const playedPairs = (played: readonly Match[]): Set<string> => {
  const set = new Set<string>();
  for (const m of played) if (m.b !== null) set.add(pairKey(m.a, m.b));
  return set;
};

/* -------------------------------------------------------------------------- */
/* Pairing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The field for the next round, by format:
 *  - single-elim: only the still-undefeated (losses === 0); the bracket narrows
 *    by loss, so no cull is needed — a defeated contestant is simply never paired
 *    again. One left undefeated is the champion (returns no pairings).
 *  - swiss: everyone, seeded by score, adjacent pairs, no rematches.
 *  - round-robin: everyone, greedily paired with an opponent not yet played.
 */
export const pairRound = (
  contestants: readonly string[],
  table: readonly Standing[],
  format: PairingFormat,
  round: number,
  played: readonly Match[],
): readonly Pairing[] => {
  const score = new Map(table.map((s) => [s.actor, s]));
  const losses = (a: string): number => score.get(a)?.losses ?? 0;
  const wins = (a: string): number => score.get(a)?.wins ?? 0;

  let pool = [...contestants];
  if (format === 'single-elim') pool = pool.filter((a) => losses(a) === 0);
  if (pool.length < 2) return [];

  // Seed the order: by score for swiss/single-elim, by name for round-robin.
  pool.sort((a, b) => format === 'round-robin'
    ? a.localeCompare(b)
    : (wins(b) - wins(a)) || (losses(a) - losses(b)) || a.localeCompare(b));

  const done = playedPairs(played);
  const used = new Set<string>();
  const pairings: Pairing[] = [];

  for (let i = 0; i < pool.length; i += 1) {
    const a = pool[i];
    if (a === undefined || used.has(a)) continue;
    let opponent: string | null = null;
    for (let j = i + 1; j < pool.length; j += 1) {
      const b = pool[j];
      if (b === undefined || used.has(b) || done.has(pairKey(a, b))) continue;
      opponent = b;
      break;
    }
    used.add(a);
    if (opponent !== null) { used.add(opponent); pairings.push({ a, b: opponent }); }
    else pairings.push({ a, b: null }); // no un-played opponent left — a bye
    void round;
  }

  return pairings;
};

/** Record a created MATCH. A bye is created already decided in the caller. */
export const matchCreatedEntry = (pairing: Pairing, round: number, at: string): HansardEntry => ({
  type: 'MATCH_CREATED',
  at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Match: matchId(round, pairing.a, pairing.b),
    Round: String(round),
    A: pairing.a,
    B: pairing.b ?? 'bye',
  },
});

/** Decide a MATCH: name the winner; the loser is the other contestant. */
export const matchDecidedEntry = (
  id: string,
  round: number,
  winner: string,
  loser: string | null,
  at: string,
  by: string,
): HansardEntry => ({
  type: 'MATCH_DECIDED',
  at,
  actor: by,
  role: 'AUTHORITY',
  fields: {
    Match: id,
    Round: String(round),
    Winner: winner,
    Loser: loser ?? 'bye',
  },
});

/**
 * Report a result. Validates the match exists, is undecided, and the winner is
 * one of its contestants — a referee cannot crown a party that never played.
 */
export const reportMatch = (
  matchRef: string,
  winner: string,
  at: string,
  referee: string,
  hansard: string,
): { readonly entry: HansardEntry; readonly hansard: string } => {
  const match = matches(hansard).find((m) => m.id === matchRef);
  if (match === undefined) throw new TournamentError(`no match ${matchRef} on the record`);
  if (match.winner !== null) throw new TournamentError(`match ${matchRef} is already decided — ${match.winner} won`);
  if (winner !== match.a && winner !== match.b) {
    throw new TournamentError(`${winner} is not in match ${matchRef} (${match.a} vs ${match.b ?? 'bye'})`);
  }
  const loser = winner === match.a ? match.b : match.a;
  const entry = matchDecidedEntry(match.id, match.round, winner, loser, at, referee);
  return { entry, hansard: appendEntry(hansard, entry) };
};

/** The undefeated contestants — for single-elim, the ones still in the bracket. */
export const undefeated = (contestants: readonly string[], hansard: string): readonly string[] => {
  const table = standings(hansard);
  const losses = new Map(table.map((s) => [s.actor, s.losses]));
  return contestants.filter((a) => (losses.get(a) ?? 0) === 0);
};
