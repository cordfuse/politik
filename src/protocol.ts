/**
 * Protocol layer — vocabulary translation manifests over CANON.
 *
 * The engine is protocol-agnostic. It speaks CANON; a protocol translates CANON
 * terms into an industry vocabulary for the user interface and the record.
 *
 *     CANON (engine) -> protocol schema (manifest) -> user interface
 *
 * Parliamentary is not a privileged mode. It is protocol #1 — the reference
 * implementation — and every industry is equally a protocol
 * (POLITIK-ARCHITECTURE.md § Protocol Schema Format).
 *
 * Translation is presentation only. Nothing here changes engine behaviour: a
 * DIVISION is a DIVISION whether it renders as "Division" or "Sprint Review".
 * The four behavioural flags below are the sole exception, and they are
 * declared, never inferred.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { parse as parseYaml } from 'yaml';

import { isRole, ROLES, type Primitive, type Role, type Verb } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

export const PROTOCOL_MODES = [
  'constitutional',
  'authoritarian',
  'darwinist',
  'ephemeral',
  'immutable',
] as const;

export type ProtocolMode = (typeof PROTOCOL_MODES)[number];

export const RECORD_MODES = ['distributed', 'anchored', 'ephemeral'] as const;

export type ProtocolRecordMode = (typeof RECORD_MODES)[number];

export interface Protocol {
  readonly name: string;
  readonly version: string;
  readonly mode: ProtocolMode;
  readonly record_mode: ProtocolRecordMode;
  /** CANON role -> industry term. Every role should be mapped. */
  readonly roles: Readonly<Partial<Record<Role, string>>>;
  /** CANON primitive or verb -> industry term. Partial by design. */
  readonly primitives: Readonly<Record<string, string>>;
  readonly domain_veto: readonly Role[];
  /** True for Darwinist/Authoritarian — no appeals. */
  readonly no_escalation: boolean;
  /** True for Ephemeral — no RECORD by design. */
  readonly no_record: boolean;
  /** True when Standing Orders cannot be amended mid-session. */
  readonly immutable_charter: boolean;
}

export interface ProtocolIssue {
  readonly field: string;
  readonly message: string;
}

export type ProtocolParseResult =
  | { readonly ok: true; readonly protocol: Protocol; readonly warnings: readonly ProtocolIssue[] }
  | { readonly ok: false; readonly issues: readonly ProtocolIssue[] };

/* -------------------------------------------------------------------------- */
/* Parse                                                                       */
/* -------------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const stringMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObject(v)) {
    for (const [key, value] of Object.entries(v)) {
      if (typeof value === 'string') out[key] = value;
    }
  }
  return out;
};

/**
 * Parse a `.politik/protocol.yml` manifest.
 *
 * Unmapped roles are a *warning*, not an error: a protocol that omits a term
 * simply falls back to the CANON word, which is always readable. Refusing to
 * load an incomplete manifest would make authoring a protocol needlessly
 * brittle.
 */
export const parseProtocol = (source: string): ProtocolParseResult => {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          field: 'protocol',
          message: `malformed YAML: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // The manifest nests everything under a `protocol:` key.
  const block = isObject(raw) && isObject(raw['protocol']) ? raw['protocol'] : raw;
  if (!isObject(block)) {
    return { ok: false, issues: [{ field: 'protocol', message: 'expected a YAML mapping' }] };
  }

  const issues: ProtocolIssue[] = [];
  const warnings: ProtocolIssue[] = [];

  const name = typeof block['name'] === 'string' ? block['name'] : '';
  if (name === '') issues.push({ field: 'name', message: 'required' });

  const mode = block['mode'];
  if (!(PROTOCOL_MODES as readonly unknown[]).includes(mode)) {
    issues.push({
      field: 'mode',
      message: `must be one of ${PROTOCOL_MODES.join(' | ')}`,
    });
  }

  const recordMode = block['record_mode'];
  if (!(RECORD_MODES as readonly unknown[]).includes(recordMode)) {
    issues.push({
      field: 'record_mode',
      message: `must be one of ${RECORD_MODES.join(' | ')}`,
    });
  }

  const roleMap = stringMap(block['roles']);
  const roles: Partial<Record<Role, string>> = {};
  for (const [key, value] of Object.entries(roleMap)) {
    if (isRole(key)) roles[key] = value;
    else issues.push({ field: `roles.${key}`, message: 'not a CANON role' });
  }
  for (const role of ROLES) {
    if (roles[role] === undefined) {
      warnings.push({ field: `roles.${role}`, message: 'unmapped — falls back to the CANON term' });
    }
  }

  const domain_veto: Role[] = [];
  if (Array.isArray(block['domain_veto'])) {
    for (const entry of block['domain_veto']) {
      if (isRole(entry)) domain_veto.push(entry);
      else issues.push({ field: 'domain_veto', message: `not a CANON role: ${String(entry)}` });
    }
  }

  const no_record = block['no_record'] === true;

  // An ephemeral record mode and a recording protocol are contradictory. The
  // Hansard either exists or it does not; a manifest cannot have it both ways.
  if (recordMode === 'ephemeral' && !no_record) {
    warnings.push({
      field: 'record_mode',
      message: 'ephemeral record_mode with no_record: false — the record will not persist',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    warnings,
    protocol: {
      name,
      version: typeof block['version'] === 'string' ? block['version'] : '0.0.0',
      mode: mode as ProtocolMode,
      record_mode: recordMode as ProtocolRecordMode,
      roles,
      primitives: stringMap(block['primitives']),
      domain_veto,
      no_escalation: block['no_escalation'] === true,
      no_record,
      immutable_charter: block['immutable_charter'] === true,
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Translation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Render a CANON role in the protocol's vocabulary.
 * Falls back to the CANON term, which is always readable by design.
 */
export const roleTerm = (protocol: Protocol, role: Role): string =>
  protocol.roles[role] ?? role;

/** Render a CANON primitive or verb in the protocol's vocabulary. */
export const term = (protocol: Protocol, canon: Primitive | Verb | string): string =>
  protocol.primitives[canon] ?? canon;

/**
 * Does this protocol permit escalation?
 *
 * Darwinist and Authoritarian protocols set `no_escalation`. A Point of Order
 * filed under one of those is not a governance event — it is a category error,
 * and the engine must refuse it rather than suspend a session that has no
 * appeal mechanism to resume from.
 */
export const allowsEscalation = (protocol: Protocol): boolean => !protocol.no_escalation;

/** Does this protocol keep a Hansard? False only for Ephemeral protocols. */
export const keepsRecord = (protocol: Protocol): boolean => !protocol.no_record;

/** May the Charter be amended mid-session? */
export const allowsCharterAmendment = (protocol: Protocol): boolean =>
  !protocol.immutable_charter;
