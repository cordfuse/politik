/**
 * CHARTER.md — parser and Writ Drop validator.
 *
 * The Charter is the sovereign law of a session: markdown with a single YAML
 * frontmatter block. The frontmatter carries every machine-read field; the
 * markdown body carries human-readable Standing Orders which the engine never
 * parses.
 *
 * Schema and the eight validation rules are fixed by ADR-0002 (with rules 5-7
 * refined by ADR-0004). This module implements them and invents nothing.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { parse as parseYaml } from 'yaml';

import {
  isMergeStrategy,
  isRole,
  type MergeStrategy,
  type Role,
} from './canon.ts';
import type { ProtocolRecordMode } from './protocol.ts';

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

export type EscalationSetting = 'enabled' | 'disabled';
export type LedgerVisibility = 'public' | 'private';

/**
 * Record mode of the resolved protocol.
 *
 * Re-exported from the protocol layer rather than redeclared. This module
 * previously declared its own `'centralised' | 'distributed'` — a vocabulary
 * that existed nowhere else, and which could not represent `anchored`, the mode
 * 8 of the 10 shipped protocols declare. Rule 5 was therefore checking a value
 * most real protocols could not express.
 */
export type RecordMode = ProtocolRecordMode;

export interface Endurance {
  readonly max_motions: number | null;
  readonly max_cost_usd: number | null;
}

export interface SessionBlock {
  readonly quorum: number;
  readonly escalation: EscalationSetting;
  readonly heartbeat_timeout_hours: number;
  readonly deadline: string | null;
  readonly merge_strategy: MergeStrategy;
  readonly assent: Role;
  readonly endurance: Endurance;
}

export interface LedgerBlock {
  readonly enabled: boolean;
  readonly visibility: LedgerVisibility;
  readonly path: string;
}

export interface ModelRequirement {
  readonly required: string | null;
  readonly preferred: string | null;
  readonly knowledge_cutoff_minimum: string | null;
}

export interface HardSkills {
  readonly required: readonly string[];
  readonly excluded: readonly string[];
}

export interface Constituency {
  readonly role: Role;
  /**
   * Registry id of the agent seated here, when the seat is machine-filled.
   *
   * Absent means the seat is human-filled. This is the field that makes the
   * AUTHORITY-is-human rule checkable at all: without somewhere for a Charter
   * to declare a machine, the rule could not be enforced and was — for the
   * whole of Phases 2-7 — a comment asserting a check that did not exist.
   */
  readonly agent: string | null;
  readonly slots: number;
  readonly auto_demotion: boolean;
  readonly hard_skills: HardSkills;
  readonly model: ModelRequirement;
  readonly mandate_alignment: string | null;
}

export interface Charter {
  readonly charter_version: string;
  readonly protocol: string;
  readonly inherits_from: string | null;
  readonly session: SessionBlock;
  readonly ledger: LedgerBlock;
  readonly minimum_cast: Readonly<Partial<Record<Role, number>>>;
  readonly domain_veto: readonly Role[];
  readonly constituencies: readonly Constituency[];
  /** Unparsed Standing Orders prose. Carried, never interpreted. */
  readonly body: string;
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export interface CharterIssue {
  /** Dotted path to the offending field, or `frontmatter` for structural faults. */
  readonly field: string;
  readonly message: string;
  /** ADR rule number this enforces, when it maps to one. */
  readonly rule?: number;
}

export type ParseResult =
  | { readonly ok: true; readonly charter: Charter }
  | { readonly ok: false; readonly issues: readonly CharterIssue[] };

export interface ValidationResult {
  /** False means SESSION_INVALID — the session never opens. */
  readonly valid: boolean;
  readonly issues: readonly CharterIssue[];
}

/** Facts about the resolved protocol needed by rules 2 and 5. */
export interface ProtocolContext {
  readonly name: string;
  readonly record_mode?: RecordMode;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter                                                                 */
/* -------------------------------------------------------------------------- */

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

/** Split a CHARTER.md into its YAML frontmatter and prose body. */
export const splitFrontmatter = (
  source: string,
): { yaml: string; body: string } | null => {
  const match = FRONTMATTER.exec(source);
  if (!match) return null;
  return { yaml: match[1] ?? '', body: (match[2] ?? '').trim() };
};

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                            */
/* -------------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const asNumberOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const asStringOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

/* -------------------------------------------------------------------------- */
/* Parse                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Parse CHARTER.md source into a Charter.
 *
 * Rule 1: malformed YAML or a missing frontmatter block is a structural fault —
 * the caller must treat it as SESSION_INVALID. Parsing applies documented
 * defaults but performs no governance validation; call `validateCharter` for
 * that.
 */
export const parseCharter = (source: string): ParseResult => {
  const split = splitFrontmatter(source);
  if (!split) {
    return {
      ok: false,
      issues: [
        {
          field: 'frontmatter',
          message: 'CHARTER.md must open with a YAML frontmatter block delimited by ---',
          rule: 1,
        },
      ],
    };
  }

  let raw: unknown;
  try {
    raw = parseYaml(split.yaml);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          field: 'frontmatter',
          message: `malformed YAML: ${err instanceof Error ? err.message : String(err)}`,
          rule: 1,
        },
      ],
    };
  }

  if (!isObject(raw)) {
    return {
      ok: false,
      issues: [
        { field: 'frontmatter', message: 'frontmatter must be a YAML mapping', rule: 1 },
      ],
    };
  }

  const session = isObject(raw['session']) ? raw['session'] : {};
  const endurance = isObject(session['endurance']) ? session['endurance'] : {};
  const ledger = isObject(raw['ledger']) ? raw['ledger'] : {};

  const minimum_cast: Partial<Record<Role, number>> = {};
  if (isObject(raw['minimum_cast'])) {
    for (const [key, value] of Object.entries(raw['minimum_cast'])) {
      if (isRole(key) && typeof value === 'number') minimum_cast[key] = value;
    }
  }

  const constituencies: Constituency[] = [];
  if (Array.isArray(raw['constituencies'])) {
    for (const entry of raw['constituencies']) {
      if (!isObject(entry)) continue;
      const hard = isObject(entry['hard_skills']) ? entry['hard_skills'] : {};
      const model = isObject(entry['model']) ? entry['model'] : {};
      constituencies.push({
        role: (isRole(entry['role']) ? entry['role'] : 'MEMBER') as Role,
        agent: asStringOrNull(entry['agent']),
        slots: typeof entry['slots'] === 'number' ? entry['slots'] : 1,
        auto_demotion: entry['auto_demotion'] === true,
        hard_skills: {
          required: asStringArray(hard['required']),
          excluded: asStringArray(hard['excluded']),
        },
        model: {
          required: asStringOrNull(model['required']),
          preferred: asStringOrNull(model['preferred']),
          knowledge_cutoff_minimum: asStringOrNull(model['knowledge_cutoff_minimum']),
        },
        mandate_alignment: asStringOrNull(entry['mandate_alignment']),
      });
    }
  }

  const visibility: LedgerVisibility =
    ledger['visibility'] === 'private' ? 'private' : 'public';

  const charter: Charter = {
    charter_version: typeof raw['charter_version'] === 'string' ? raw['charter_version'] : '',
    protocol: typeof raw['protocol'] === 'string' ? raw['protocol'] : '',
    inherits_from: asStringOrNull(raw['inherits_from']),
    session: {
      quorum: typeof session['quorum'] === 'number' ? session['quorum'] : 1,
      escalation: session['escalation'] === 'disabled' ? 'disabled' : 'enabled',
      heartbeat_timeout_hours:
        typeof session['heartbeat_timeout_hours'] === 'number'
          ? session['heartbeat_timeout_hours']
          : 4,
      deadline: asStringOrNull(session['deadline']),
      // Defaults per ADR-0002 frontmatter comments.
      merge_strategy: isMergeStrategy(session['merge_strategy'])
        ? session['merge_strategy']
        : 'merge_commit',
      assent: isRole(session['assent']) ? session['assent'] : 'AUTHORITY',
      endurance: {
        max_motions: asNumberOrNull(endurance['max_motions']),
        max_cost_usd: asNumberOrNull(endurance['max_cost_usd']),
      },
    },
    ledger: {
      enabled: ledger['enabled'] !== false,
      visibility,
      path:
        typeof ledger['path'] === 'string'
          ? ledger['path']
          : visibility === 'private'
            ? '.politik/LEDGER.md'
            : 'LEDGER.md',
    },
    minimum_cast,
    domain_veto: asStringArray(raw['domain_veto']).filter(isRole),
    constituencies,
    body: split.body,
  };

  return { ok: true, charter };
};

/* -------------------------------------------------------------------------- */
/* Validate — Writ Drop                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Apply the Writ Drop validation rules (ADR-0002 § Validation rules).
 *
 * A failing result means SESSION_INVALID: the session never opens and the
 * issues are committed to the Hansard naming what failed.
 *
 * `protocol` is optional. Rule 2 (protocol resolution) and rule 5 (squash vs
 * distributed record mode) are only enforced when the resolved protocol is
 * supplied — the caller resolves `.politik/protocol.yml`, not this module.
 */
export const validateCharter = (
  charter: Charter,
  protocol?: ProtocolContext,
): ValidationResult => {
  const issues: CharterIssue[] = [];

  if (charter.charter_version.length === 0) {
    issues.push({ field: 'charter_version', message: 'required' });
  }

  // Rule 2 — resolve protocol.
  if (charter.protocol.length === 0) {
    issues.push({ field: 'protocol', message: 'required', rule: 2 });
  } else if (protocol && protocol.name !== charter.protocol) {
    issues.push({
      field: 'protocol',
      message: `does not resolve: charter declares "${charter.protocol}", resolved protocol is "${protocol.name}"`,
      rule: 2,
    });
  }

  if (!Number.isInteger(charter.session.quorum) || charter.session.quorum < 1) {
    issues.push({ field: 'session.quorum', message: 'must be an integer >= 1' });
  }

  // Rule 4 — AUTHORITY can never be dialled to zero.
  const requiredAuthority = charter.minimum_cast.AUTHORITY;
  if (requiredAuthority !== undefined && requiredAuthority < 1) {
    issues.push({
      field: 'minimum_cast.AUTHORITY',
      message: 'may never be overridden to 0 — a session with no Speaker cannot proceed',
      rule: 4,
    });
  }

  // The one hard constitutional rule (POLITIK-ARCHITECTURE.md § Roles):
  // AUTHORITY is always human. A Charter declaring a machine as AUTHORITY is
  // invalid and the session must never open.
  //
  // The rationale is accountability, not capability: a machine that captures a
  // session cannot be held responsible for it, and every other safeguard in the
  // framework assumes someone can be.
  for (const [i, c] of charter.constituencies.entries()) {
    if (c.role === 'AUTHORITY' && c.agent !== null) {
      issues.push({
        field: `constituencies[${i}].agent`,
        message: `AUTHORITY is always human — this Charter seats the agent "${c.agent}" as Speaker`,
      });
    }
  }

  // Rule 3 — declared constituencies must satisfy minimum_cast.
  //
  // ADR-0002 says "assigned constituencies", which reads ambiguously. It means
  // the seats this Charter assigns, not actors sitting in them: Writ Drop runs
  // *before* the session opens, so no actor has been seated yet and the other
  // reading would make the rule uncheckable at the only moment it runs.
  // Whether seats are actually filled is a runtime question, and quorum answers
  // it at Division time.
  const slotsByRole = new Map<Role, number>();
  for (const c of charter.constituencies) {
    slotsByRole.set(c.role, (slotsByRole.get(c.role) ?? 0) + c.slots);
  }
  for (const [role, required] of Object.entries(charter.minimum_cast) as [Role, number][]) {
    const assigned = slotsByRole.get(role) ?? 0;
    if (assigned < required) {
      issues.push({
        field: `minimum_cast.${role}`,
        message: `shortfall: requires ${required}, constituencies declare ${assigned}`,
        rule: 3,
      });
    }
  }

  // Rule 5 — squash destroys per-commit attribution that distributed guarantees.
  if (
    charter.session.merge_strategy === 'squash' &&
    protocol?.record_mode === 'distributed'
  ) {
    issues.push({
      field: 'session.merge_strategy',
      message: 'squash is rejected when protocol.record_mode is distributed — it destroys per-commit attribution',
      rule: 5,
    });
  }

  // Rule 6 — fast_forward leaves no merge node, so no evidence of a Division.
  if (charter.session.merge_strategy === 'fast_forward' && charter.session.quorum !== 1) {
    issues.push({
      field: 'session.merge_strategy',
      message: `fast_forward requires session.quorum: 1 (declared ${charter.session.quorum}) — it leaves no merge node to evidence a Division`,
      rule: 6,
    });
  }

  // Rule 7 — assent must name a CANON role. Parsing defaults it to AUTHORITY,
  // so an out-of-CANON value is only detectable pre-coercion; guard anyway.
  if (!isRole(charter.session.assent)) {
    issues.push({
      field: 'session.assent',
      message: 'must name a CANON role',
      rule: 7,
    });
  }

  for (const [i, c] of charter.constituencies.entries()) {
    if (!Number.isInteger(c.slots) || c.slots < 1) {
      issues.push({
        field: `constituencies[${i}].slots`,
        message: 'must be an integer >= 1',
      });
    }
  }

  return { valid: issues.length === 0, issues };
};

/**
 * Parse and validate in one step — the Writ Drop entry point.
 * Rule 8: on pass, the caller sets `STATE.json.state = CONVENED`.
 */
export const writDrop = (
  source: string,
  protocol?: ProtocolContext,
): ValidationResult & { readonly charter?: Charter } => {
  const parsed = parseCharter(source);
  if (!parsed.ok) return { valid: false, issues: parsed.issues };
  const result = validateCharter(parsed.charter, protocol);
  return { ...result, charter: parsed.charter };
};
