/**
 * CONFLICT — two Motions touching the same lines.
 *
 * The primitive exists to draw one line, and the whole module is built around
 * keeping it (POLITIK-ARCHITECTURE.md § Session Primitives, ADR-0004
 * Proposal 3):
 *
 *   CONFLICT — mechanical, routine, resolved by any actor holding WRITE.
 *              **Not a governance failure.**
 *   DEADLOCK — no valid Division outcome. A governance failure.
 *
 * A merge conflict is an ordinary event in concurrent work. Treating it as a
 * fault would suspend sessions for something two Ministers can settle between
 * themselves, train actors to escalate routine work, and bury the genuinely
 * undecidable cases in noise. So nothing here suspends, nothing escalates, and
 * nothing reaches for AUTHORITY.
 *
 * The temptation is to reuse the fault machinery because the plumbing is
 * similar. That would be the error: it is the *governance meaning* that
 * differs, not the mechanics.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { VERBS, type Role, type Verb } from './canon.ts';
import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

export interface MotionFiles {
  readonly motion: string;
  readonly files: readonly string[];
}

export interface Conflict {
  readonly motions: readonly string[];
  /** Files both Motions touch. */
  readonly files: readonly string[];
}

/**
 * Which Motions touch the same files?
 *
 * File-level overlap, not line-level. Two Motions editing distant parts of one
 * file usually merge cleanly, so this over-reports — but a CONFLICT costs
 * nothing to record and resolve, while a missed one surfaces later as a failed
 * merge with no explanation in the record. Over-reporting a routine event is
 * the cheaper mistake.
 */
export const detectConflicts = (motions: readonly MotionFiles[]): readonly Conflict[] => {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < motions.length; i += 1) {
    for (let j = i + 1; j < motions.length; j += 1) {
      const a = motions[i];
      const b = motions[j];
      if (a === undefined || b === undefined) continue;

      const shared = a.files.filter((f) => b.files.includes(f));
      if (shared.length > 0) {
        conflicts.push({ motions: [a.motion, b.motion], files: shared });
      }
    }
  }

  return conflicts;
};

/* -------------------------------------------------------------------------- */
/* Standing                                                                    */
/* -------------------------------------------------------------------------- */

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * May this role resolve a conflict?
 *
 * Any actor holding WRITE — which is the substance of the CANON entry, and the
 * reason a conflict is not a governance event. Requiring AUTHORITY would turn
 * every merge conflict into a Speaker interruption.
 */
export const mayResolve = (verbs: readonly Verb[]): boolean => verbs.includes('WRITE');

/* -------------------------------------------------------------------------- */
/* Records                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Record that a conflict exists.
 *
 * Deliberately not a `SESSION_FAULT`, and it carries no resolution path: this
 * is work to be done, not a failure to be attributed. Nothing about the
 * session's state changes.
 */
export const conflictEntry = (
  conflict: Conflict,
  at: string,
  actor: string,
  role: Role,
): HansardEntry => ({
  type: 'CONFLICT',
  at,
  actor,
  role,
  fields: {
    Motions: conflict.motions.join(', '),
    Files: conflict.files.join(', '),
    Standing: 'any actor holding WRITE may resolve this',
    'Session status': 'CONVENED — a conflict is routine, not a governance failure',
  },
  body:
    'Two Motions touch the same files. This is an ordinary event in concurrent ' +
    'work and requires no ruling.',
});

export interface ResolutionInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly verbs: readonly Verb[];
  readonly motions: readonly string[];
  /** How it was settled, in the resolver's own words. */
  readonly resolution: string;
}

/**
 * Record a conflict resolved.
 *
 * Refuses an actor without WRITE — not because resolving is dangerous, but
 * because a record naming someone who could not have done the work is a false
 * record.
 */
export const resolveConflict = (
  input: ResolutionInput,
  hansard: string,
): { readonly entry: HansardEntry; readonly hansard: string } => {
  if (!mayResolve(input.verbs)) {
    throw new ConflictError(
      `resolving a conflict requires WRITE — ${input.actor} (${input.role}) holds ${
        input.verbs.length > 0 ? input.verbs.join(', ') : 'no verbs'
      }`,
    );
  }
  if (input.motions.length < 2) {
    throw new ConflictError('a conflict is between two or more Motions');
  }
  if (input.resolution.trim() === '') {
    throw new ConflictError('a resolution must state how the conflict was settled');
  }

  const entry: HansardEntry = {
    type: 'CONFLICT_RESOLVED',
    at: input.at,
    actor: input.actor,
    role: input.role,
    fields: {
      Motions: input.motions.join(', '),
      'Resolved by': `${input.actor} (${input.role}) — holding WRITE`,
      'Speaker intervention': 'none — a conflict is not a governance failure',
    },
    body: input.resolution.trim(),
  };

  return { entry, hansard: appendEntry(hansard, entry) };
};

/** Conflicts recorded and not yet resolved. */
export const openConflicts = (hansard: string): readonly string[] => {
  const open = new Set<string>();
  for (const entry of parseEntries(hansard)) {
    const motions = entry.fields['Motions'];
    if (motions === undefined) continue;
    if (entry.type === 'CONFLICT') open.add(motions);
    if (entry.type === 'CONFLICT_RESOLVED') open.delete(motions);
  }
  return [...open];
};

/** Sanity: CONFLICT must never be confused for a suspension cause. */
export const IS_GOVERNANCE_FAILURE = false;

/** Every CANON verb, for callers that need the full grant. */
export const ALL_VERBS: readonly Verb[] = VERBS;
