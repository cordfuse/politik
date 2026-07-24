/**
 * Protocol SDK — lint, generate, and discover protocols.
 *
 * `parseProtocol` answers "is this manifest loadable?". The linter answers a
 * different and stricter question: "is this manifest *coherent*?" — does it
 * translate terms CANON actually has, are its behavioural flags consistent with
 * its declared mode, and will a Charter written against it survive Writ Drop.
 *
 * A loadable manifest can still be incoherent. `mode: darwinist` with
 * `no_escalation: false` loads cleanly and then produces a session that accepts
 * appeals a Darwinist protocol has no mechanism to resolve.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { PRIMITIVES, ROLES, VERBS, type Role } from './canon.ts';
import {
  parseProtocol,
  type Protocol,
  type ProtocolMode,
} from './protocol.ts';

/* -------------------------------------------------------------------------- */
/* Lint                                                                        */
/* -------------------------------------------------------------------------- */

export type LintSeverity = 'error' | 'warning';

export interface LintFinding {
  readonly severity: LintSeverity;
  readonly field: string;
  readonly message: string;
}

export interface LintResult {
  readonly ok: boolean;
  readonly findings: readonly LintFinding[];
}

/** Every CANON term a protocol may legitimately translate. */
const TRANSLATABLE: readonly string[] = Object.freeze([...PRIMITIVES, ...VERBS]);

/**
 * Behavioural expectations implied by each mode.
 *
 * These are *warnings*, not errors: the architecture describes modes as
 * families, not as constraints, and a protocol author may have a reason. But a
 * mismatch is nearly always a mistake, and silently shipping one produces
 * sessions that behave unlike every sibling protocol in their family.
 */
const MODE_EXPECTATIONS: Readonly<
  Record<ProtocolMode, { no_escalation?: boolean; no_record?: boolean; immutable_charter?: boolean }>
> = Object.freeze({
  constitutional: { no_escalation: false, no_record: false },
  authoritarian: { no_record: false },
  darwinist: { no_record: false },
  ephemeral: { no_record: true },
  immutable: { immutable_charter: true },
});

/**
 * Lint a protocol manifest against CANON.
 *
 * Errors make a protocol unusable. Warnings flag likely authoring mistakes.
 */
export const lintProtocol = (protocol: Protocol): LintResult => {
  const findings: LintFinding[] = [];

  if (!/^[a-z0-9][a-z0-9-]*$/.test(protocol.name)) {
    findings.push({
      severity: 'error',
      field: 'name',
      message: 'must be lower-kebab-case — it is a filename and a Charter key',
    });
  }

  if (!/^\d+\.\d+\.\d+$/.test(protocol.version)) {
    findings.push({
      severity: 'warning',
      field: 'version',
      message: `not semver: "${protocol.version}"`,
    });
  }

  // Translating a term CANON does not have is always an error: it will never be
  // looked up, so it is dead vocabulary that misleads whoever reads the file.
  for (const key of Object.keys(protocol.primitives)) {
    if (!TRANSLATABLE.includes(key)) {
      findings.push({
        severity: 'error',
        field: `primitives.${key}`,
        message: 'not a CANON primitive or verb — this term will never be used',
      });
    }
  }

  for (const role of ROLES) {
    if (protocol.roles[role] === undefined) {
      findings.push({
        severity: 'warning',
        field: `roles.${role}`,
        message: 'unmapped — falls back to the CANON term',
      });
    }
  }

  // Duplicate role terms make the interface ambiguous: two constituencies would
  // render identically and a human could not tell which one acted.
  const seen = new Map<string, Role>();
  for (const role of ROLES) {
    const label = protocol.roles[role];
    if (label === undefined) continue;
    const prior = seen.get(label.toLowerCase());
    if (prior !== undefined) {
      findings.push({
        severity: 'error',
        field: `roles.${role}`,
        message: `duplicate term "${label}" — already maps ${prior}`,
      });
    }
    seen.set(label.toLowerCase(), role);
  }

  const expectations = MODE_EXPECTATIONS[protocol.mode];
  for (const [flag, expected] of Object.entries(expectations)) {
    const actual = protocol[flag as 'no_escalation' | 'no_record' | 'immutable_charter'];
    if (actual !== expected) {
      findings.push({
        severity: 'warning',
        field: flag,
        message: `${protocol.mode} protocols normally set ${flag}: ${String(expected)}`,
      });
    }
  }

  // A recording protocol whose record evaporates is self-contradictory.
  if (protocol.record_mode === 'ephemeral' && !protocol.no_record) {
    findings.push({
      severity: 'error',
      field: 'record_mode',
      message: 'ephemeral record_mode requires no_record: true — the record cannot both persist and not',
    });
  }

  if (protocol.no_record && protocol.record_mode !== 'ephemeral') {
    findings.push({
      severity: 'warning',
      field: 'no_record',
      message: `no_record: true with record_mode: ${protocol.record_mode} — expected ephemeral`,
    });
  }

  // AUTHORITY holding a domain veto is redundant: AUTHORITY already holds VETO
  // as a constitutional power. Declaring it says less than it appears to.
  if (protocol.domain_veto.includes('AUTHORITY')) {
    findings.push({
      severity: 'warning',
      field: 'domain_veto',
      message: 'AUTHORITY already holds VETO — a domain veto adds nothing',
    });
  }

  return { ok: !findings.some((f) => f.severity === 'error'), findings };
};

/** Parse and lint in one step. */
export const lintSource = (source: string): LintResult => {
  const parsed = parseProtocol(source);
  if (!parsed.ok) {
    return {
      ok: false,
      findings: parsed.issues.map((i) => ({
        severity: 'error' as const,
        field: i.field,
        message: i.message,
      })),
    };
  }
  const result = lintProtocol(parsed.protocol);
  return {
    ok: result.ok,
    findings: [
      ...parsed.warnings.map((w) => ({
        severity: 'warning' as const,
        field: w.field,
        message: w.message,
      })),
      ...result.findings.filter((f) => !f.field.startsWith('roles.')),
    ],
  };
};

/* -------------------------------------------------------------------------- */
/* Generate                                                                    */
/* -------------------------------------------------------------------------- */

export interface GenerateOptions {
  readonly name: string;
  readonly mode?: ProtocolMode;
  readonly roles?: Readonly<Partial<Record<Role, string>>>;
}

/**
 * Generate a protocol manifest skeleton.
 *
 * Every CANON role and primitive appears, mapped to itself where the author has
 * not supplied a term. That makes the full translatable surface visible in the
 * file rather than something to be discovered from documentation.
 */
export const generateProtocol = (options: GenerateOptions): string => {
  const mode = options.mode ?? 'constitutional';
  const expectations = MODE_EXPECTATIONS[mode];

  const roleLines = ROLES.map(
    (role) => `    ${role}: ${options.roles?.[role] ?? role}`,
  ).join('\n');

  const primitiveLines = PRIMITIVES.map((p) => `    ${p}: ${p}`).join('\n');
  const verbLines = VERBS.map((v) => `    ${v}: ${v}`).join('\n');

  return `# ${options.name} — protocol manifest.
#
# Generated skeleton. Replace the right-hand side of each mapping with your
# domain's vocabulary; delete any line you want to fall back to the CANON term.
#
# Lint before shipping:  politik protocol lint protocols/${options.name}.yml

protocol:
  name: ${options.name}
  version: 0.1.0
  mode: ${mode}
  record_mode: anchored

  roles:
${roleLines}

  primitives:
${primitiveLines}

    # Verbs
${verbLines}

  domain_veto: []
  no_escalation: ${expectations.no_escalation ?? false}
  no_record: ${expectations.no_record ?? false}
  immutable_charter: ${expectations.immutable_charter ?? false}
`;
};
