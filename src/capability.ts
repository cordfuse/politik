/**
 * Actor capability profiles — the five dimensions.
 *
 * A Charter declares what a constituency *requires*; an actor declares what
 * they *are*. This module decides whether the two match, at Writ Drop and again
 * before an agent is spawned.
 *
 * The dimensions (POLITIK-ARCHITECTURE.md § Actor Capability Profile):
 *
 *  1. Role tier — trust and verbs. Already enforced elsewhere.
 *  2. Personality archetype — how the actor collaborates under pressure.
 *  3. Soft skills — how it reasons and communicates.
 *  4. Hard skills — domain competence, `required` and `excluded`.
 *  5. Model / knowledge grade — the underlying intelligence, per seat.
 *
 * `excluded` matters as much as `required`, and is the less obvious of the two:
 * an actor working outside its domain does not fail loudly, it produces
 * confident wrong output. Excluding a skill is how a Charter says "not this,
 * even though you could".
 *
 * This module is also the instrument the research layer depends on. If profile
 * composition has measurable effects, the profiles have to be real and recorded
 * rather than declared and ignored.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { parse as parseYaml } from 'yaml';

import { splitFrontmatter, type Constituency } from './charter.ts';
import type { HansardEntry } from './hansard.ts';
import type { Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Dimensions 2 and 3                                                          */
/* -------------------------------------------------------------------------- */

export const ARCHETYPES = [
  'HARDLINER',
  'DIPLOMAT',
  'ANALYST',
  'CREATIVE',
  'LONE_WOLF',
  'TEAM_PLAYER',
  'JOKESTER',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export const SOFT_SKILLS = [
  'COMMUNICATION',
  'CREATIVITY',
  'ANALYTICAL_THINKING',
  'PERSUASION',
  'TECHNICAL_ACUMEN',
] as const;

export type SoftSkill = (typeof SOFT_SKILLS)[number];

export const isArchetype = (v: unknown): v is Archetype =>
  typeof v === 'string' && (ARCHETYPES as readonly string[]).includes(v);

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

export interface ActorProfile {
  readonly actor: string;
  readonly role: Role;
  readonly archetype?: Archetype | null;
  readonly soft_skills?: Readonly<Partial<Record<SoftSkill, number>>>;
  readonly hard_skills?: readonly string[];
  readonly model?: string | null;
  /** ISO year-month, e.g. `2025-01`. */
  readonly knowledge_cutoff?: string | null;
  readonly mandate_alignment?: string | null;
}

export interface CapabilityIssue {
  readonly dimension: 'hard_skills' | 'model' | 'knowledge_cutoff' | 'archetype' | 'mandate';
  readonly severity: 'fail' | 'warn';
  readonly message: string;
}

export interface CapabilityCheck {
  readonly ok: boolean;
  readonly issues: readonly CapabilityIssue[];
}

/* -------------------------------------------------------------------------- */
/* Model grade                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Does the actor's model satisfy the seat's requirement?
 *
 * Deliberately an exact-match check rather than a capability ranking. Ordering
 * models by "smartness" would mean this module carrying an opinion about every
 * vendor's lineup, going stale the week a new one ships, and silently
 * downgrading a session when it guessed wrong. A Charter that wants to accept
 * several models can name the one it requires and leave `preferred` advisory.
 */
const modelSatisfies = (required: string | null, actual: string | null): boolean => {
  if (required === null) return true;
  if (actual === null) return false;
  // Tolerate vendor suffixes: `claude-opus-4-8[1m]` satisfies `claude-opus-4-8`.
  return actual === required || actual.startsWith(`${required}[`);
};

/** Is the actor's knowledge cutoff at or after the seat's minimum? */
const cutoffSatisfies = (minimum: string | null, actual: string | null): boolean => {
  if (minimum === null) return true;
  if (actual === null) return false;
  return actual >= minimum;
};

/* -------------------------------------------------------------------------- */
/* Check                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Check an actor against the constituency it would be seated in.
 *
 * Hard failures block the seating; warnings are recorded and proceed. The split
 * follows the architecture: the engine "validates model compliance at Writ Drop
 * and refuses to spawn a mismatched model", while a preferred-but-absent model
 * or an unstated archetype are configuration gaps, not disqualifications.
 */
export const checkCapability = (
  profile: ActorProfile,
  constituency: Constituency,
): CapabilityCheck => {
  const issues: CapabilityIssue[] = [];
  const held = new Set(profile.hard_skills ?? []);

  for (const required of constituency.hard_skills.required) {
    if (!held.has(required)) {
      issues.push({
        dimension: 'hard_skills',
        severity: 'fail',
        message: `missing required hard skill: ${required}`,
      });
    }
  }

  for (const excluded of constituency.hard_skills.excluded) {
    if (held.has(excluded)) {
      // Not a warning: an actor working an excluded domain produces confident
      // wrong output, which is worse than producing nothing.
      issues.push({
        dimension: 'hard_skills',
        severity: 'fail',
        message: `holds excluded skill: ${excluded} — this seat excludes that domain`,
      });
    }
  }

  if (!modelSatisfies(constituency.model.required, profile.model ?? null)) {
    issues.push({
      dimension: 'model',
      severity: 'fail',
      message: `model ${profile.model ?? 'unknown'} does not satisfy required ${constituency.model.required}`,
    });
  }

  if (
    constituency.model.preferred !== null &&
    profile.model !== null &&
    profile.model !== undefined &&
    !modelSatisfies(constituency.model.preferred, profile.model)
  ) {
    issues.push({
      dimension: 'model',
      severity: 'warn',
      message: `model ${profile.model} is not the preferred ${constituency.model.preferred}`,
    });
  }

  if (!cutoffSatisfies(constituency.model.knowledge_cutoff_minimum, profile.knowledge_cutoff ?? null)) {
    issues.push({
      dimension: 'knowledge_cutoff',
      severity: 'fail',
      message: `knowledge cutoff ${profile.knowledge_cutoff ?? 'unknown'} is before the required ${constituency.model.knowledge_cutoff_minimum}`,
    });
  }

  if (
    constituency.mandate_alignment !== null &&
    profile.mandate_alignment !== constituency.mandate_alignment
  ) {
    issues.push({
      dimension: 'mandate',
      severity: 'warn',
      message: `mandate ${profile.mandate_alignment ?? 'unstated'} does not match the seat's ${constituency.mandate_alignment}`,
    });
  }

  if (profile.archetype !== undefined && profile.archetype !== null && !isArchetype(profile.archetype)) {
    issues.push({
      dimension: 'archetype',
      severity: 'warn',
      message: `unknown archetype: ${String(profile.archetype)}`,
    });
  }

  return { ok: !issues.some((i) => i.severity === 'fail'), issues };
};

/* -------------------------------------------------------------------------- */
/* Skill mismatch                                                              */
/* -------------------------------------------------------------------------- */

export interface MismatchInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  /** What the actor produced that fell outside its competence. */
  readonly observed: string;
  readonly excluded_domain: string;
  /** Charter setting for this constituency. */
  readonly auto_demotion: boolean;
}

/**
 * Record a SKILL_MISMATCH fault.
 *
 * Fires when Hansard performance reveals a mismatch that Writ Drop did not
 * catch — output in an excluded domain, or repeated failure on required domain
 * work. Consequence depends on the Charter: auto-demote where permitted,
 * otherwise escalate to the Speaker.
 *
 * The record is permanent either way. Future sessions plan against it, which is
 * the point of keeping actor performance history at all.
 */
export const skillMismatch = (input: MismatchInput): HansardEntry => ({
  type: 'FAULT_ACTOR',
  at: input.at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Subtype: 'SKILL_MISMATCH',
    'Actor affected': input.actor,
    'Seat held': input.role,
    'Excluded domain': input.excluded_domain,
    Observed: input.observed,
    Consequence: input.auto_demotion
      ? 'auto-demotion (permitted by Charter)'
      : 'escalated to the Speaker — auto_demotion is false',
    Record: 'permanent — future sessions plan against this',
  },
});

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

export interface Composition {
  readonly archetypes: Readonly<Partial<Record<Archetype, number>>>;
  readonly distinct: number;
  readonly homogeneous: boolean;
}

/**
 * Describe the archetype composition of a seated bench.
 *
 * Measured, never judged. RESEARCH.md asks whether complementary composition
 * outperforms homogeneous composition — that is an open empirical question, and
 * a framework that warned about "bad" mixes would be answering it by assumption
 * and contaminating its own instrument.
 */
export const composition = (profiles: readonly ActorProfile[]): Composition => {
  const archetypes: Partial<Record<Archetype, number>> = {};
  for (const p of profiles) {
    if (p.archetype === undefined || p.archetype === null) continue;
    archetypes[p.archetype] = (archetypes[p.archetype] ?? 0) + 1;
  }
  const distinct = Object.keys(archetypes).length;
  return {
    archetypes,
    distinct,
    homogeneous: distinct === 1 && profiles.length > 1,
  };
};

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * Parse an actor profile from `actors/<handle>.md`.
 *
 * Same shape as a Charter: YAML frontmatter the engine reads, prose the humans
 * read. An actor file with no frontmatter is not an error — it is a profile
 * that declares nothing, which a Charter requiring nothing will accept.
 */
export const parseProfile = (source: string, fallbackActor: string): ActorProfile | null => {
  const split = splitFrontmatter(source);
  if (split === null) return null;

  let raw: unknown;
  try {
    raw = parseYaml(split.yaml);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;

  const model = isObject(raw['model']) ? raw['model'] : {};
  const soft: Partial<Record<SoftSkill, number>> = {};
  if (isObject(raw['soft_skills'])) {
    for (const [key, value] of Object.entries(raw['soft_skills'])) {
      if ((SOFT_SKILLS as readonly string[]).includes(key) && typeof value === 'number') {
        soft[key as SoftSkill] = value;
      }
    }
  }

  return {
    actor: typeof raw['actor'] === 'string' ? raw['actor'] : fallbackActor,
    role: (typeof raw['role'] === 'string' ? raw['role'] : 'MEMBER') as Role,
    archetype: isArchetype(raw['archetype']) ? raw['archetype'] : null,
    soft_skills: soft,
    hard_skills: strings(raw['hard_skills']),
    model: typeof model['name'] === 'string' ? model['name'] : (typeof raw['model'] === 'string' ? raw['model'] : null),
    knowledge_cutoff:
      typeof model['knowledge_cutoff'] === 'string' ? model['knowledge_cutoff'] : null,
    mandate_alignment:
      typeof raw['mandate_alignment'] === 'string' ? raw['mandate_alignment'] : null,
  };
};
