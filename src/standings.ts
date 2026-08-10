/**
 * Standings — scoring a competitive protocol from the record.
 *
 * A tournament or league protocol runs as a series of Divisions; who fared how
 * is already in the Hansard, so — like `integrity.ts` and `federation.ts` — this
 * is a pure read over the record, not new state. A "win" is voting with the side
 * a Division carried; elimination is the cull an `exit: elimination` protocol
 * records (ADR-0007). Two rankings, because two questions get asked of a
 * tournament: who won the most (win-loss) and who lasted longest (survival).
 *
 * On `pairing`: Swiss / round-robin / single-elimination are 1v1-match formats,
 * and a Politik Division is an N-actor vote on a Motion — there is no match to
 * pair. Matchmaking needs a *match primitive* the Division model does not have;
 * that is an additive design, not a scoring read, and is deliberately not faked
 * here.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { parseEntries } from './hansard.ts';
import { seats } from './actors.ts';

export interface Standing {
  readonly actor: string;
  /** Current role, or null if the actor is no longer seated. */
  readonly seat: string | null;
  /** Divisions won: voted with the side that carried (or lost, for rejected). */
  readonly wins: number;
  readonly losses: number;
  readonly eliminated: boolean;
  /** When the actor was removed, for survival ranking. Null if still standing. */
  readonly eliminated_at: string | null;
}

export type RankBy = 'win-loss' | 'survival';

/**
 * Score every actor who took part. A win is a vote on the carrying side of a
 * decided Division; a loss is a vote on the other side; an abstention is neither.
 * Elimination and current seat come from the actor record.
 */
export const standings = (hansard: string, by: RankBy = 'win-loss'): readonly Standing[] => {
  const entries = parseEntries(hansard);

  // motion -> voter -> vote, and motion -> carried?
  const votes = new Map<string, Map<string, string>>();
  const carried = new Map<string, boolean>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const eliminatedAt = new Map<string, string>();
  const participants = new Set<string>();

  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const entry of entries) {
    const motion = entry.fields['Motion'];
    const subject = entry.fields['Actor affected'];

    switch (entry.type) {
      case 'VOTE_CAST': {
        if (motion === undefined) break;
        const cast = votes.get(motion) ?? new Map<string, string>();
        cast.set(entry.actor, entry.fields['Vote'] ?? 'ABSTAIN');
        votes.set(motion, cast);
        participants.add(entry.actor);
        break;
      }
      case 'MOTION_CARRIED':
        if (motion !== undefined) carried.set(motion, true);
        break;
      case 'MOTION_REJECTED':
        if (motion !== undefined) carried.set(motion, false);
        break;
      case 'MATCH_DECIDED': {
        // A tournament (ADR-0009) scores the same table: the winner takes a win,
        // the loser a loss. A bye ('bye') gives its winner a win and no one a loss.
        const winner = entry.fields['Winner'];
        const loser = entry.fields['Loser'];
        if (winner !== undefined) { bump(wins, winner); participants.add(winner); }
        if (loser !== undefined && loser !== 'bye') { bump(losses, loser); participants.add(loser); }
        break;
      }
      case 'ACTOR_HIRED':
        if (subject !== undefined) participants.add(subject);
        break;
      case 'ACTOR_EXITED':
        // A re-seating (reinstatement) clears the elimination; seats() is the
        // authority on who is currently out, so only stamp the time here.
        if (subject !== undefined) eliminatedAt.set(subject, entry.at);
        break;
      default:
        break;
    }
  }

  // Score decided Divisions.
  for (const [motion, decided] of carried) {
    const cast = votes.get(motion);
    if (cast === undefined) continue;
    for (const [actor, vote] of cast) {
      if (vote === 'ABSTAIN') continue;
      const wonSide = (vote === 'AYE' && decided) || (vote === 'NO' && !decided);
      bump(wonSide ? wins : losses, actor);
    }
  }

  const seated = new Map(seats(hansard).map((s) => [s.actor, s.role]));

  const rows: Standing[] = [...participants].map((actor) => ({
    actor,
    seat: seated.get(actor) ?? null,
    wins: wins.get(actor) ?? 0,
    losses: losses.get(actor) ?? 0,
    // Eliminated = has an exit on the record and is not currently seated (a
    // reinstated actor is back in, not eliminated).
    eliminated: eliminatedAt.has(actor) && !seated.has(actor),
    eliminated_at: seated.has(actor) ? null : (eliminatedAt.get(actor) ?? null),
  }));

  return rank(rows, by);
};

/** Order the table. Ties break on the other metric, then the name, for stability. */
const rank = (rows: readonly Standing[], by: RankBy): readonly Standing[] => {
  const sorted = [...rows];
  if (by === 'survival') {
    // Still standing first; among the eliminated, the last one out ranks highest.
    sorted.sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated && b.eliminated) {
        const t = (b.eliminated_at ?? '').localeCompare(a.eliminated_at ?? '');
        if (t !== 0) return t;
      }
      return (b.wins - a.wins) || a.actor.localeCompare(b.actor);
    });
  } else {
    sorted.sort((a, b) =>
      (b.wins - a.wins) || (a.losses - b.losses) || a.actor.localeCompare(b.actor));
  }
  return sorted;
};
