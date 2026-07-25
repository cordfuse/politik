/**
 * Hard Containment — agents may never traverse above the session directory.
 *
 * POLITIK-ARCHITECTURE.md § Hard Containment Rule:
 *
 *     Agents MAY NEVER traverse above CWD.
 *     Reading ../anything = Standing Orders violation
 *     Logged to Hansard immediately
 *     Escalated to Speaker automatically
 *     Session paused pending ruling
 *
 * ## What this module is, and what it is not
 *
 * This is **detection, not prevention.** A spawned process runs with the
 * operating system's permissions, and nothing in userspace can stop it reading
 * a path it is entitled to read. Claiming otherwise would be the more dangerous
 * error: an operator who believes the framework sandboxes agents will not
 * reach for the thing that actually does.
 *
 * Real prevention is a deployment concern — a container, a `bwrap` jail, a user
 * with no read access above the session. `politik doctor` reports whether the
 * session is containerised, and RUNTIME.md's platform matrix is where that
 * belongs.
 *
 * What is detectable after the fact is still worth having: an agent that
 * *wrote* outside the session, or that *reports* having read above it, leaves
 * evidence. The Hansard records what happened, which is the framework's answer
 * to most things it cannot prevent.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { isAbsolute, relative, resolve } from 'node:path';

import type { Role } from './canon.ts';
import type { HansardEntry } from './hansard.ts';

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

export type BreachKind =
  /** A file was written outside the session directory. */
  | 'WROTE_OUTSIDE'
  /** The agent's own report references a path above the session. */
  | 'REPORTED_TRAVERSAL';

export interface Breach {
  readonly kind: BreachKind;
  readonly evidence: string;
}

export interface ContainmentCheck {
  readonly contained: boolean;
  readonly breaches: readonly Breach[];
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/** Is `path` inside `root`? */
export const isInside = (root: string, path: string): boolean => {
  const target = isAbsolute(path) ? path : resolve(root, path);
  const rel = relative(resolve(root), target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Paths in agent output that reach above the session.
 *
 * Deliberately conservative. This scans prose written by a model, so it looks
 * only for shapes that are unambiguous — a leading `../`, or an absolute path
 * to a place a session has no business touching. Matching every mention of
 * ".." would flag an agent that merely *discussed* the containment rule, and a
 * detector that cries wolf teaches operators to ignore it.
 */
const TRAVERSAL = /(?:^|[\s'"`(])(\.\.\/[\w.\-/]+)/g;
const SENSITIVE = /(?:^|[\s'"`(])((?:\/etc\/|\/root\/|~\/\.ssh|\/home\/[\w.-]+\/\.(?:ssh|aws|config))[\w.\-/]*)/g;

export const scanOutput = (output: string): readonly Breach[] => {
  const breaches: Breach[] = [];
  const seen = new Set<string>();

  for (const pattern of [TRAVERSAL, SENSITIVE]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output)) !== null) {
      const evidence = (match[1] ?? '').trim();
      if (evidence === '' || seen.has(evidence)) continue;
      seen.add(evidence);
      breaches.push({ kind: 'REPORTED_TRAVERSAL', evidence });
    }
  }

  return breaches;
};

/**
 * Check a completed turn for containment breaches.
 *
 * `touched` comes from git and is therefore already session-relative; an
 * absolute path or a `..` prefix in that list means the agent wrote somewhere
 * it should not have been able to.
 */
export const checkContainment = (
  sessionDir: string,
  touched: readonly string[],
  output: string,
): ContainmentCheck => {
  const breaches: Breach[] = [];

  for (const path of touched) {
    if (!isInside(sessionDir, path)) {
      breaches.push({ kind: 'WROTE_OUTSIDE', evidence: path });
    }
  }

  breaches.push(...scanOutput(output));

  return { contained: breaches.length === 0, breaches };
};

/* -------------------------------------------------------------------------- */
/* Record                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Record a containment breach.
 *
 * The spec is unambiguous about the consequence: logged immediately, escalated
 * to the Speaker, session paused pending a ruling. That is the Point of Order
 * flow, so the breach reuses it rather than inventing a parallel path — the
 * Speaker rules, and `politik rule` resumes.
 */
export const breachEntry = (
  check: ContainmentCheck,
  at: string,
  actor: string,
  role: Role,
): HansardEntry => ({
  type: 'CONTAINMENT_BREACH',
  at,
  actor,
  role,
  fields: {
    Breaches: String(check.breaches.length),
    Evidence: check.breaches.map((b) => `${b.kind}: ${b.evidence}`).join('; '),
    'Session status': 'SUSPENDED — escalated to the Speaker pending a ruling',
    Note: 'detection, not prevention — a spawned process runs with the operating system\'s permissions',
  },
  body:
    'An actor reached above the session directory. Standing Orders forbid it. ' +
    'The sitting is suspended until the Speaker rules.',
});
