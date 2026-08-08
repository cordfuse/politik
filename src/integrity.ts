/**
 * Integrity — the bad-faith detector.
 *
 * Skills are capability, declared before seating (`capability.ts`). Virtues and
 * vices are not capability: they appear only in behaviour, over time. So this
 * module does not read a profile — it reads the immutable Hansard for the vice
 * signatures RUNTIME.md § The Voluntold Problem spells out, and surfaces them to
 * the Speaker. It **detects and reports; it never punishes** — "the audit trail
 * is the deterrent". The one case it cannot catch is a bad-faith Speaker, and
 * nothing can, except the record being visible to everyone who can read the repo.
 *
 * Pure by construction: a function of the record and nothing else, so the same
 * Hansard always yields the same findings — the property auditability depends on.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';
import { parseEntries } from './hansard.ts';

export type FindingKind = 'vice' | 'virtue';
export type Severity = 'high' | 'medium' | 'low' | 'praise';

export interface IntegrityFinding {
  readonly kind: FindingKind;
  /** Stable slug for the pattern, e.g. 'coerced-exit', 'serial-voluntold'. */
  readonly signature: string;
  readonly severity: Severity;
  /** Actors named in the finding — the subject first, then any implicated. */
  readonly actors: readonly string[];
  /** Human-readable statement of the pattern, citing the record. */
  readonly evidence: string;
}

/**
 * Review a session's Hansard for bad-faith (and good-faith) patterns.
 *
 * v1 — single session (docs/plans/virtues-and-vices.md):
 *  - coerced-exit       (vice, high)   — an EXIT_VOLUNTARY_COERCED: a voluntold.
 *  - strategic-withdrawal (vice, medium) — a strategic exit while a Division is open.
 *  - serial-voluntold   (vice, high)   — one OPERATOR seated for two+ voluntary exits.
 *  - honest-concession  (virtue)       — a reasoned EXIT_VOLUNTARY_CONCESSION.
 */
export const reviewIntegrity = (hansard: string): readonly IntegrityFinding[] => {
  const entries = parseEntries(hansard);
  const findings: IntegrityFinding[] = [];

  // Replayed session state, in record order.
  const openDivisions = new Set<string>();
  const seated = new Map<string, Role>();
  // OPERATOR -> the actors whose voluntary exits they were seated for.
  const voluntaryUnder = new Map<string, string[]>();

  for (const entry of entries) {
    const f = entry.fields;
    switch (entry.type) {
      case 'DIVISION_CALLED': {
        const motion = f['Motion'];
        if (motion !== undefined) openDivisions.add(motion);
        break;
      }
      case 'MOTION_CARRIED':
      case 'MOTION_REJECTED': {
        const motion = f['Motion'];
        if (motion !== undefined) openDivisions.delete(motion);
        break;
      }
      case 'ACTOR_HIRED': {
        const who = f['Actor affected'];
        const role = f['Role'];
        if (who !== undefined && role !== undefined) seated.set(who, role as Role);
        break;
      }
      case 'ACTOR_PROMOTED':
      case 'ACTOR_DEMOTED': {
        const who = f['Actor affected'];
        const to = f['To'];
        if (who !== undefined && to !== undefined && seated.has(who)) seated.set(who, to as Role);
        break;
      }
      case 'ACTOR_EXITED': {
        const subject = f['Actor affected'] ?? entry.actor;
        const exitType = f['Exit type'] ?? '';
        const reason = (f['Reason'] ?? '').trim();
        const duringDivision = openDivisions.size > 0;
        const operatorsPresent = [...seated.entries()]
          .filter(([who, role]) => role === 'OPERATOR' && who !== subject)
          .map(([who]) => who);

        if (exitType === 'EXIT_VOLUNTARY_COERCED') {
          findings.push({
            kind: 'vice',
            signature: 'coerced-exit',
            severity: 'high',
            actors: [subject, ...operatorsPresent],
            evidence:
              `${subject} exited EXIT_VOLUNTARY_COERCED (voluntold) at ${entry.at}` +
              `${duringDivision ? ' while a Division was open' : ''}` +
              `${operatorsPresent.length > 0 ? ` — OPERATOR(s) seated: ${operatorsPresent.join(', ')}` : ''}`,
          });
        } else if (exitType === 'EXIT_VOLUNTARY_STRATEGIC' && duringDivision) {
          findings.push({
            kind: 'vice',
            signature: 'strategic-withdrawal',
            severity: 'medium',
            actors: [subject],
            evidence:
              `${subject} filed EXIT_VOLUNTARY_STRATEGIC while a Division was open ` +
              `(${[...openDivisions].join(', ')}) — withdrawing to affect a live vote`,
          });
        } else if (exitType === 'EXIT_VOLUNTARY_CONCESSION' && reason !== '') {
          findings.push({
            kind: 'virtue',
            signature: 'honest-concession',
            severity: 'praise',
            actors: [subject],
            evidence: `${subject} conceded on merit, with a stated reason: "${reason.slice(0, 80)}"`,
          });
        }

        if (exitType === 'EXIT_VOLUNTARY_COERCED' || exitType === 'EXIT_VOLUNTARY_STRATEGIC') {
          for (const operator of operatorsPresent) {
            const list = voluntaryUnder.get(operator) ?? [];
            list.push(subject);
            voluntaryUnder.set(operator, list);
          }
        }
        seated.delete(subject);
        break;
      }
      default:
        break;
    }
  }

  // Serial voluntold: one OPERATOR present for two or more voluntary exits is the
  // Hansard pattern that outlives any single deniable withdrawal.
  for (const [operator, affected] of voluntaryUnder) {
    if (affected.length >= 2) {
      findings.push({
        kind: 'vice',
        signature: 'serial-voluntold',
        severity: 'high',
        actors: [operator, ...affected],
        evidence:
          `${operator} (OPERATOR) was seated for ${affected.length} voluntary exits — ` +
          `${affected.join(', ')}. No single exit proves coercion; the pattern is the evidence.`,
      });
    }
  }

  return findings;
};
