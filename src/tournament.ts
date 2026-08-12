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
  /** Games needed to win: 1 for a single game, 3 for best-of-three, etc. */
  readonly best_of: number;
  /** Games won so far, per side — only ever above zero for a best-of-N match. */
  readonly games: { readonly a: number; readonly b: number };
}

class TournamentError extends Error {}
export { TournamentError };

/** Games one side must win to take a best-of-N match. */
export const gamesToWin = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');
const matchId = (round: number, a: string, b: string | null): string => `r${round}-${a}-${b ?? 'bye'}`;

/* -------------------------------------------------------------------------- */
/* Reading the record                                                          */
/* -------------------------------------------------------------------------- */

/** Every MATCH on the record, with its result if one has been reported. */
export const matches = (hansard: string): readonly Match[] => {
  const created = new Map<string, { round: number; a: string; b: string | null; bestOf: number }>();
  const winners = new Map<string, string>();
  const gameWinners = new Map<string, string[]>();

  for (const entry of parseEntries(hansard)) {
    const id = entry.fields['Match'];
    if (id === undefined) continue;
    if (entry.type === 'MATCH_CREATED') {
      const b = entry.fields['B'];
      created.set(id, {
        round: Number(entry.fields['Round'] ?? '0'),
        a: entry.fields['A'] ?? '',
        b: b === undefined || b === 'bye' ? null : b,
        bestOf: Math.max(1, Number(entry.fields['Best of'] ?? '1')),
      });
    } else if (entry.type === 'MATCH_DECIDED') {
      const w = entry.fields['Winner'];
      if (w !== undefined) winners.set(id, w);
    } else if (entry.type === 'MATCH_GAME') {
      const w = entry.fields['Winner'];
      if (w !== undefined) gameWinners.set(id, [...(gameWinners.get(id) ?? []), w]);
    }
  }

  return [...created.entries()].map(([id, m]) => {
    const gw = gameWinners.get(id) ?? [];
    return {
      id, round: m.round, a: m.a, b: m.b, best_of: m.bestOf,
      games: { a: gw.filter((w) => w === m.a).length, b: gw.filter((w) => w === m.b).length },
      winner: winners.get(id) ?? null,
    };
  });
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
 *
 * `seed` is an optional strength order (strongest first). When given, the first
 * round of a swiss or single-elim event pairs by the *fold* method — the top
 * half against the bottom half (#1 vs the first of the lower half), so strong
 * seeds meet late rather than by luck of the name sort — and in every later
 * round the seed breaks ties within an equal-score group. A contestant absent
 * from `seed` is treated as the weakest, ranked after every seeded one.
 */
export const pairRound = (
  contestants: readonly string[],
  table: readonly Standing[],
  format: PairingFormat,
  round: number,
  played: readonly Match[],
  seed: readonly string[] = [],
): readonly Pairing[] => {
  const score = new Map(table.map((s) => [s.actor, s]));
  const losses = (a: string): number => score.get(a)?.losses ?? 0;
  const wins = (a: string): number => score.get(a)?.wins ?? 0;
  const seedRank = new Map(seed.map((a, i) => [a, i] as const));
  const bySeed = (a: string): number => seedRank.get(a) ?? Number.MAX_SAFE_INTEGER;

  let pool = [...contestants];
  if (format === 'single-elim') pool = pool.filter((a) => losses(a) === 0);
  if (pool.length < 2) return [];

  // Seed the order: by score for swiss/single-elim (seed, then name, break
  // ties), by seed-or-name for round-robin.
  pool.sort((a, b) => format === 'round-robin'
    ? (bySeed(a) - bySeed(b)) || a.localeCompare(b)
    : (wins(b) - wins(a)) || (losses(a) - losses(b)) || (bySeed(a) - bySeed(b)) || a.localeCompare(b));

  // First round of a seeded bracket: fold the ordered field, top half against
  // bottom half. An odd field gives the lowest top-half seed a bye.
  if (seed.length > 0 && format !== 'round-robin' && played.length === 0) {
    const mid = Math.ceil(pool.length / 2);
    const top = pool.slice(0, mid);
    const bottom = pool.slice(mid);
    return top.map((a, i) => ({ a, b: bottom[i] ?? null }));
  }

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

/**
 * Record a created MATCH. A bye is created already decided in the caller.
 * `bestOf` above 1 records a best-of-N match; the field is omitted for a plain
 * single game so the common record is unchanged.
 */
export const matchCreatedEntry = (
  pairing: Pairing,
  round: number,
  at: string,
  bestOf = 1,
): HansardEntry => ({
  type: 'MATCH_CREATED',
  at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Match: matchId(round, pairing.a, pairing.b),
    Round: String(round),
    A: pairing.a,
    B: pairing.b ?? 'bye',
    ...(bestOf > 1 ? { 'Best of': String(bestOf) } : {}),
  },
});

/** Record one game of a best-of-N match. The match is decided separately. */
export const matchGameEntry = (
  id: string,
  round: number,
  winner: string,
  at: string,
  by: string,
): HansardEntry => ({
  type: 'MATCH_GAME',
  at,
  actor: by,
  role: 'AUTHORITY',
  fields: {
    Match: id,
    Round: String(round),
    Winner: winner,
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

export interface MatchReport {
  /** The terminal entry appended — MATCH_DECIDED when the match is settled, the
   *  MATCH_GAME otherwise. Kept for callers that only need the last act. */
  readonly entry: HansardEntry;
  /** Every entry appended, in order (a game, optionally its deciding entry). */
  readonly entries: readonly HansardEntry[];
  readonly hansard: string;
  /** True when this report settled the match. */
  readonly decided: boolean;
  readonly winner: string;
  /** Game wins per side after this report — {a,b} both 0 for a settled best-of-1. */
  readonly games: { readonly a: number; readonly b: number };
}

/**
 * Report a result. Validates the match exists, is undecided, and the winner is
 * one of its contestants — a referee cannot crown a party that never played.
 *
 * A best-of-1 match settles on the single report (MATCH_DECIDED). A best-of-N
 * match records the reported game (MATCH_GAME) and settles only once a side has
 * won a majority — so `match report` is called per game and the caller sees the
 * running tally until the deciding game lands.
 */
export const reportMatch = (
  matchRef: string,
  winner: string,
  at: string,
  referee: string,
  hansard: string,
): MatchReport => {
  const match = matches(hansard).find((m) => m.id === matchRef);
  if (match === undefined) throw new TournamentError(`no match ${matchRef} on the record`);
  if (match.winner !== null) throw new TournamentError(`match ${matchRef} is already decided — ${match.winner} won`);
  if (winner !== match.a && winner !== match.b) {
    throw new TournamentError(`${winner} is not in match ${matchRef} (${match.a} vs ${match.b ?? 'bye'})`);
  }
  const loser = winner === match.a ? match.b : match.a;

  // Best-of-1: one report decides it, exactly as before.
  if (match.best_of <= 1) {
    const decided = matchDecidedEntry(match.id, match.round, winner, loser, at, referee);
    return {
      entry: decided, entries: [decided], hansard: appendEntry(hansard, decided),
      decided: true, winner, games: { a: 0, b: 0 },
    };
  }

  // Best-of-N: this game counts toward the winner; the match settles on a majority.
  const games = winner === match.a
    ? { a: match.games.a + 1, b: match.games.b }
    : { a: match.games.a, b: match.games.b + 1 };
  const game = matchGameEntry(match.id, match.round, winner, at, referee);
  const entries: HansardEntry[] = [game];
  let doc = appendEntry(hansard, game);

  const wonEnough = (winner === match.a ? games.a : games.b) >= gamesToWin(match.best_of);
  if (wonEnough) {
    const decided = matchDecidedEntry(match.id, match.round, winner, loser, at, referee);
    entries.push(decided);
    doc = appendEntry(doc, decided);
  }

  return {
    entry: entries[entries.length - 1] as HansardEntry,
    entries, hansard: doc, decided: wonEnough, winner, games,
  };
};

/** The undefeated contestants — for single-elim, the ones still in the bracket. */
export const undefeated = (contestants: readonly string[], hansard: string): readonly string[] => {
  const table = standings(hansard);
  const losses = new Map(table.map((s) => [s.actor, s.losses]));
  return contestants.filter((a) => (losses.get(a) ?? 0) === 0);
};
