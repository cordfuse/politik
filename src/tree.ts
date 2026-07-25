/**
 * The Politik Tree — hierarchical inheritance and cascade.
 *
 * Every node is a Proceeding. A leaf is a session; a node with children governs
 * them. There is no fixed depth and no special migration when a leaf gains a
 * child — just a new repo whose Charter names its parent in `inherits_from`.
 *
 * The rule that governs everything here (EXECUTION.md § The Politik Tree):
 *
 *     Settings inherit downward. Restrictions compound. Nothing overrides upward.
 *
 * A child may bind itself more tightly than its parent. It may never loosen
 * what the parent set. That single asymmetry is what makes a constraint at the
 * root mean something: without it, any node could opt out of governance by
 * declaring a laxer Charter one level down, and the tree would be advisory.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Charter } from './charter.ts';
import { appendEntry, parseEntries, type HansardEntry } from './hansard.ts';
import type { Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Inheritance                                                                 */
/* -------------------------------------------------------------------------- */

export interface InheritanceViolation {
  readonly field: string;
  readonly message: string;
}

export interface ResolvedCharter {
  readonly charter: Charter;
  /** Fields the child tightened relative to its parent. */
  readonly tightened: readonly string[];
  /** Attempts to loosen a parent constraint. Always rejected. */
  readonly violations: readonly InheritanceViolation[];
}

/** The tighter of two ceilings, treating null as "no ceiling". */
const tighterCeiling = (parent: number | null, child: number | null): number | null => {
  if (parent === null) return child;
  if (child === null) return parent;
  return Math.min(parent, child);
};

/**
 * Resolve a child Charter against its parent.
 *
 * Returns the effective Charter the child actually runs under — which is not
 * necessarily the one it declared. A child that tries to loosen a parent
 * constraint does not fail to load; it runs under the parent's value, and the
 * attempt is reported so it can be recorded rather than silently corrected.
 *
 * Silent correction would be the worse failure: a Speaker would believe their
 * Charter was in force when it was not.
 */
export const resolveInheritance = (parent: Charter, child: Charter): ResolvedCharter => {
  const tightened: string[] = [];
  const violations: InheritanceViolation[] = [];

  // Quorum: a child may require more actors, never fewer.
  let quorum = child.session.quorum;
  if (child.session.quorum < parent.session.quorum) {
    violations.push({
      field: 'session.quorum',
      message: `child declares ${child.session.quorum}, parent requires ${parent.session.quorum} — the parent value stands`,
    });
    quorum = parent.session.quorum;
  } else if (child.session.quorum > parent.session.quorum) {
    tightened.push('session.quorum');
  }

  // Escalation: a parent that permits appeals cannot have them removed below.
  let escalation = child.session.escalation;
  if (parent.session.escalation === 'enabled' && child.session.escalation === 'disabled') {
    violations.push({
      field: 'session.escalation',
      message: 'a child may not disable escalation its parent permits — the parent value stands',
    });
    escalation = 'enabled';
  }

  // Ceilings: the tighter of the two always wins, from either side.
  const maxCost = tighterCeiling(
    parent.session.endurance.max_cost_usd,
    child.session.endurance.max_cost_usd,
  );
  if (maxCost !== child.session.endurance.max_cost_usd) tightened.push('session.endurance.max_cost_usd');

  const maxMotions = tighterCeiling(
    parent.session.endurance.max_motions,
    child.session.endurance.max_motions,
  );
  if (maxMotions !== child.session.endurance.max_motions) tightened.push('session.endurance.max_motions');

  const heartbeat = Math.min(
    parent.session.heartbeat_timeout_hours,
    child.session.heartbeat_timeout_hours,
  );
  if (heartbeat !== child.session.heartbeat_timeout_hours) tightened.push('session.heartbeat_timeout_hours');

  // minimum_cast: a child may require more of a role, never fewer.
  const minimumCast: Partial<Record<Role, number>> = { ...child.minimum_cast };
  for (const [role, required] of Object.entries(parent.minimum_cast) as [Role, number][]) {
    const declared = minimumCast[role];
    if (declared === undefined || declared < required) {
      if (declared !== undefined && declared < required) {
        violations.push({
          field: `minimum_cast.${role}`,
          message: `child declares ${declared}, parent requires ${required} — the parent value stands`,
        });
      }
      minimumCast[role] = required;
    }
  }

  // A parent's domain vetoes always carry down, and a child may add its own.
  //
  // Omission is not revocation. A child that simply does not restate a parent
  // grant has not tried to remove it — and since the schema offers no way to
  // express revocation, the two are indistinguishable. Treating silence as an
  // attempted override would flag almost every child Charter ever written.
  const domainVeto = [...new Set([...parent.domain_veto, ...child.domain_veto])];
  if (domainVeto.length > child.domain_veto.length) {
    tightened.push('domain_veto');
  }

  return {
    charter: {
      ...child,
      session: {
        ...child.session,
        quorum,
        escalation,
        heartbeat_timeout_hours: heartbeat,
        endurance: { max_cost_usd: maxCost, max_motions: maxMotions },
      },
      minimum_cast: minimumCast,
      domain_veto: domainVeto,
    },
    tightened,
    violations,
  };
};

/**
 * Record an inheritance resolution.
 *
 * Committed at the child's Writ Drop so the node's own Hansard states what it
 * actually runs under — including any constraint it tried to loosen and did
 * not get.
 */
export const inheritanceEntry = (
  resolved: ResolvedCharter,
  parent: string,
  at: string,
): HansardEntry => ({
  type: 'CHARTER_INHERITED',
  at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Parent: parent,
    Tightened: resolved.tightened.length > 0 ? resolved.tightened.join(', ') : 'nothing',
    Overridden:
      resolved.violations.length > 0
        ? resolved.violations.map((v) => v.field).join(', ')
        : 'nothing',
  },
  body:
    resolved.violations.length === 0
      ? 'The child Charter is consistent with its parent.'
      : [
          'The following were declared more loosely than the parent permits and',
          'do not take effect. The parent value stands:',
          '',
          ...resolved.violations.map((v) => `- \`${v.field}\` — ${v.message}`),
        ].join('\n'),
});

/* -------------------------------------------------------------------------- */
/* Cascade                                                                     */
/* -------------------------------------------------------------------------- */

export interface SiblingFault {
  /** Session GUID of the sibling node. */
  readonly node: string;
  /** Fault signature — the thing being matched across siblings. */
  readonly signature: string;
  readonly at: string;
}

export interface CascadeConfig {
  /** Filings of the same signature across siblings needed to alert. */
  readonly trigger: number;
  readonly window_days: number;
}

export const DEFAULT_CASCADE: CascadeConfig = Object.freeze({
  trigger: 2,
  window_days: 30,
});

export interface CascadeAlert {
  readonly triggered: boolean;
  readonly signature: string | null;
  readonly nodes: readonly string[];
  readonly reason: string;
}

/**
 * Detect a fault pattern repeating across sibling nodes.
 *
 * The architecture frames this as an epidemiological measure: if one failure is
 * producing more than one downstream failure across siblings, the pattern is
 * self-sustaining and needs intervention before it reaches the parent.
 *
 * Distinct *nodes* are counted, not filings. Ten faults in one unlucky session
 * are that session's problem; the same fault in two sessions is a pattern, and
 * conflating them would make every noisy node look like a systemic failure.
 */
export const checkCascade = (
  faults: readonly SiblingFault[],
  now: string,
  config: CascadeConfig = DEFAULT_CASCADE,
): CascadeAlert => {
  const current = Date.parse(now);
  const windowMs = config.window_days * 86_400_000;

  const bySignature = new Map<string, Set<string>>();
  for (const fault of faults) {
    const at = Date.parse(fault.at);
    if (Number.isNaN(at) || Number.isNaN(current)) continue;
    if (current - at > windowMs) continue;
    const nodes = bySignature.get(fault.signature) ?? new Set<string>();
    nodes.add(fault.node);
    bySignature.set(fault.signature, nodes);
  }

  for (const [signature, nodes] of bySignature) {
    if (nodes.size >= config.trigger) {
      return {
        triggered: true,
        signature,
        nodes: [...nodes],
        reason: `${signature} observed in ${nodes.size} sibling nodes within ${config.window_days} days`,
      };
    }
  }

  return {
    triggered: false,
    signature: null,
    nodes: [],
    reason: `no fault signature repeated across ${config.trigger} or more siblings`,
  };
};

/**
 * Record a CASCADE_ALERT on the parent node.
 *
 * Warns; does not block. Future sessions chartering the flagged configuration
 * receive the warning at Writ Drop and the Speaker may still proceed — but the
 * risk is documented and attributed, which is the difference between an
 * informed decision and an unlucky one.
 */
export const cascadeEntry = (alert: CascadeAlert, at: string): HansardEntry => {
  if (!alert.triggered) {
    throw new Error(`no cascade to record — ${alert.reason}`);
  }
  return {
    type: 'CASCADE_ALERT',
    at,
    actor: 'RECORD',
    role: 'OPERATOR',
    fields: {
      Signature: alert.signature ?? 'unknown',
      Nodes: alert.nodes.join(', '),
      Action: 'warn at Writ Drop for this configuration',
      Notify: 'AUTHORITY',
    },
    body: `${alert.reason}. Sessions chartering this configuration will carry this warning. The Speaker may proceed; the risk is on the record.`,
  };
};

/* -------------------------------------------------------------------------- */
/* Scope mobility                                                              */
/* -------------------------------------------------------------------------- */

export interface ScopeMoveInput {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly subject: string;
  /** Node the actor is being scoped to. */
  readonly to_node: string;
  readonly reason: string;
}

/**
 * Move an actor's scope up or down the tree.
 *
 * Recorded at the node where the decision was made — the level that had the
 * authority to make it. A promotion decided at the sprint node belongs in the
 * sprint node's Hansard, not the leaf's, because that is where the
 * accountability sits.
 */
export const scopeMove = (
  input: ScopeMoveInput,
  direction: 'PROMOTE_SCOPE' | 'DEMOTE_SCOPE',
): HansardEntry => ({
  type: direction,
  at: input.at,
  actor: input.actor,
  role: input.role,
  fields: {
    'Actor affected': input.subject,
    'Scoped to': input.to_node,
    Reason: input.reason,
  },
});

/* -------------------------------------------------------------------------- */
/* Quarantine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Quarantine a branch.
 *
 * The parent's response when a cascade cannot be contained at the child level.
 * Recorded on the parent, because a branch cannot quarantine itself — the whole
 * point is that the decision comes from above the failure.
 */
export const quarantineEntry = (
  node: string,
  at: string,
  actor: string,
  reason: string,
): HansardEntry => ({
  type: 'QUARANTINE',
  at,
  actor,
  role: 'AUTHORITY',
  fields: {
    Node: node,
    Effect: 'no further sessions convene under this node until released',
    Reason: reason,
  },
});

/** Every cascade alert already on a node's record. */
export const cascadeAlerts = (hansard: string): readonly string[] =>
  parseEntries(hansard)
    .filter((e) => e.type === 'CASCADE_ALERT')
    .map((e) => e.fields['Signature'] ?? '')
    .filter((s) => s.length > 0);

/** Append an entry to a node's Hansard. */
export const recordOnNode = (hansard: string, entry: HansardEntry): string =>
  appendEntry(hansard, entry);
