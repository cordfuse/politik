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

import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'yaml';

import {
  isMergeStrategy,
  isRole,
  type MergeStrategy,
  type Role,
} from './canon.ts';
import type { ProtocolRecordMode } from './protocol.ts';
import { isResolution, isExitPolicy, type Resolution, type ExitPolicy } from './division.ts';
import { isTerminationPolicy, type TerminationPolicy } from './prorogation.ts';

/**
 * A content fingerprint of a Charter's source text.
 *
 * Recorded on the WRIT_DROP entry at session open so an immutable-charter
 * protocol (ADR-0007 `immutable_charter`) can prove its constitution has not
 * been edited since. The raw CHARTER.md bytes are hashed — not the parsed
 * object — so any change the operator makes to the file, meaningful or not, is
 * detectable; the immutability contract is about the text on disk, not its
 * interpretation.
 */
export const charterFingerprint = (source: string): string =>
  createHash('sha256').update(source, 'utf8').digest('hex');

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
  /**
   * Spend at which the Speaker is warned, before the ceiling stops the session.
   * The low-fuel light: a proceeding that dies at its ceiling with no warning
   * gives nobody the chance to extend the budget or wind down gracefully.
   */
  readonly cost_warning_usd: number | null;
  /** What a breached ceiling does. */
  readonly deadline_action: 'escalate' | 'suspend' | 'dissolve';
}

export interface SessionBlock {
  readonly quorum: number;
  readonly escalation: EscalationSetting;
  readonly heartbeat_timeout_hours: number;
  /** What a stale heartbeat does. RUNTIME.md § Session Heartbeat. */
  readonly stale_action: 'suspend' | 'dissolve';
  /** Hours between STATE_SNAPSHOT commits, or null for none. */
  readonly checkpoint_interval_hours: number | null;
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

/**
 * Constitutional-capture mitigations (RUNTIME.md § Constitutional Capture).
 *
 * These were implemented in `src/crisis.ts` but never parsed, so the YAML the
 * documentation shows was inert — a Speaker could declare a Witness Council and
 * get nothing. Parsed here so the declaration has effect.
 */
export interface Governance {
  readonly witness_council: {
    readonly enabled: boolean;
    readonly roles: readonly Role[];
  };
  readonly consensus_suspension: {
    readonly enabled: boolean;
    readonly threshold: number;
  };
}

export interface Charter {
  readonly charter_version: string;
  readonly protocol: string;
  readonly inherits_from: string | null;
  readonly session: SessionBlock;
  readonly ledger: LedgerBlock;
  readonly minimum_cast: Readonly<Partial<Record<Role, number>>>;
  readonly domain_veto: readonly Role[];
  /** Protocol override points (ADR-0007). Absent selections default to the
   * parliamentary behavior, so an older Charter is unchanged. */
  readonly mechanics: {
    readonly resolution: Resolution;
    readonly exit: ExitPolicy;
    readonly termination: TerminationPolicy;
  };
  readonly governance: Governance;
  /** PATH_A auto-recovery policy (RUNTIME.md § Three Resolution Paths). */
  readonly fault_handling: {
    readonly auto_retry_max: number;
    readonly auto_retry_delay_minutes: number;
  };
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
      // Default only when absent. A present-but-invalid value is preserved so
      // Writ Drop rule 7 can reject it — coercing it to AUTHORITY here masked the
      // rule and let a bad assent silently open a session (AUDIT #8).
      assent: session['assent'] === undefined ? 'AUTHORITY' : (session['assent'] as Role),
      stale_action: session['stale_action'] === 'dissolve' ? 'dissolve' : 'suspend',
      checkpoint_interval_hours: asNumberOrNull(session['checkpoint_interval_hours']),
      endurance: {
        max_motions: asNumberOrNull(endurance['max_motions']),
        max_cost_usd: asNumberOrNull(endurance['max_cost_usd']),
        // RUNTIME.md shows these under `session:` as well as under
        // `session.endurance:`. Read both, because a Charter written from the
        // documentation should work rather than be silently ignored.
        cost_warning_usd:
          asNumberOrNull(endurance['cost_warning_usd']) ??
          asNumberOrNull(session['cost_warning_usd']),
        deadline_action:
          session['deadline_action'] === 'dissolve'
            ? 'dissolve'
            : session['deadline_action'] === 'suspend'
              ? 'suspend'
              : 'escalate',
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
    mechanics: (() => {
      const m = isObject(raw['mechanics']) ? raw['mechanics'] : {};
      return {
        resolution: isResolution(m['resolution']) ? m['resolution'] : 'majority',
        exit: isExitPolicy(m['exit']) ? m['exit'] : 'division',
        termination: isTerminationPolicy(m['termination']) ? m['termination'] : 'objective',
      };
    })(),
    fault_handling: (() => {
      const f = isObject(raw['fault_handling']) ? raw['fault_handling'] : {};
      const max = asNumberOrNull(f['auto_retry_max']);
      const delay = asNumberOrNull(f['auto_retry_delay_minutes']);
      return {
        // RUNTIME.md's documented defaults. A Charter that says nothing gets
        // retry rather than an immediate escalation, because a rate limit is
        // not something to wake a Speaker for.
        auto_retry_max: max !== null && max >= 0 ? max : 3,
        auto_retry_delay_minutes: delay !== null && delay >= 0 ? delay : 5,
      };
    })(),
    governance: (() => {
      const g = isObject(raw['governance']) ? raw['governance'] : {};
      const witness = isObject(g['witness_council']) ? g['witness_council'] : {};
      const consensus = isObject(g['consensus_suspension']) ? g['consensus_suspension'] : {};
      const roles = asStringArray(witness['roles']).filter(isRole);
      return {
        witness_council: {
          enabled: witness['enabled'] === true && roles.length > 0,
          roles,
        },
        consensus_suspension: {
          // Defaults to enabled: a constitutional protocol that silently had no
          // capture mechanism would be worse than one that declares it off.
          enabled: consensus['enabled'] !== false,
          threshold:
            typeof consensus['threshold'] === 'number' &&
            consensus['threshold'] > 0 &&
            consensus['threshold'] <= 1
              ? consensus['threshold']
              : 0.75,
        },
      };
    })(),
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

  // Rule 7 — assent must name a CANON role. Parsing now defaults only when the
  // key is absent, so a present-but-invalid value reaches here and is rejected.
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
