/**
 * Federation — the GLOBAL layer as local traversal (ADR-0008 phase 2).
 *
 * EXECUTION.md § The Politik Tree makes an organisation a 1:N hierarchy of
 * sessions. ADR-0008 makes that tree one repository of nested directories, and
 * this module is the payoff it promised: the registry ("all sessions and their
 * state"), cascade propagation, and roll-up are ordinary reads over one working
 * tree, not cross-repository orchestration. There is no federation *repo* — the
 * tree of directories IS the federation.
 *
 * The engine stayed storage-agnostic; nothing here changes how a session runs.
 * Discovery walks directories; everything downstream (buildTree, rollUp,
 * detectCascades) is pure and reuses tree.ts, ledger.ts and hansard.ts, so a
 * node in a federated tree obeys exactly the governance a standalone one does.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

import { parseCharter } from './charter.ts';
import { parseState } from './state.ts';
import { totals } from './ledger.ts';
import { parseEntries } from './hansard.ts';
import {
  checkCascade, DEFAULT_CASCADE, type CascadeAlert, type CascadeConfig, type SiblingFault,
} from './tree.ts';

/* -------------------------------------------------------------------------- */
/* Node model                                                                  */
/* -------------------------------------------------------------------------- */

export interface FederationNode {
  /** Absolute directory of the node's session. */
  readonly dir: string;
  /** Directory relative to the tree root — the human-facing identity. */
  readonly rel: string;
  readonly guid: string;
  readonly protocol: string;
  readonly state: string;
  /** Suspension cause, when SUSPENDED. */
  readonly cause: string | null;
  readonly since: string | null;
  readonly cost_usd: number;
  readonly tokens: number;
  /** Parent's absolute dir, or null for a root (inherits_from outside the tree). */
  readonly parent: string | null;
  /** Absolute dirs of the immediate children. */
  readonly children: readonly string[];
  readonly depth: number;
  /** Raw record, kept for fault and open-Motion scanning. */
  readonly hansard: string;
}

interface RawNode {
  readonly dir: string;
  readonly guid: string;
  readonly protocol: string;
  readonly state: string;
  readonly cause: string | null;
  readonly since: string | null;
  readonly cost_usd: number;
  readonly tokens: number;
  readonly parentDir: string | null;
  readonly hansard: string;
}

/* -------------------------------------------------------------------------- */
/* Discovery (I/O)                                                             */
/* -------------------------------------------------------------------------- */

const SKIP = new Set(['.git', 'node_modules', '.politik']);

/**
 * Every session directory under root — one that carries CHARTER.md and
 * STATE.json. Descends through session directories too: in monorepo mode a node
 * contains its children, so finding a session is never a reason to stop walking.
 */
export const findSessionDirs = async (root: string): Promise<readonly string[]> => {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (existsSync(join(dir, 'CHARTER.md')) && existsSync(join(dir, 'STATE.json'))) {
      found.push(dir);
    }
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      await walk(join(dir, entry.name));
    }
  };
  await walk(root);
  return found;
};

/** Read one node's records. Returns null if the directory is not a valid session. */
export const readNode = async (dir: string): Promise<RawNode | null> => {
  const [charterRaw, stateRaw] = await Promise.all([
    readFile(join(dir, 'CHARTER.md'), 'utf8').catch(() => null),
    readFile(join(dir, 'STATE.json'), 'utf8').catch(() => null),
  ]);
  if (charterRaw === null || stateRaw === null) return null;

  const parsed = parseCharter(charterRaw);
  const state = parseState(stateRaw);
  if (!parsed.ok || state === null) return null;
  const charter = parsed.charter;

  const ledgerDoc = await readFile(join(dir, charter.ledger.path), 'utf8').catch(() => '');
  const hansard = await readFile(join(dir, 'HANSARD.md'), 'utf8').catch(() => '');
  const cost = totals(ledgerDoc);

  // inherits_from is relative to the child; resolve it to the parent's directory.
  const parentDir = charter.inherits_from === null ? null : resolve(dir, charter.inherits_from);

  return {
    dir,
    guid: state.session_guid,
    protocol: charter.protocol,
    state: state.state,
    cause: state.suspension?.cause ?? null,
    since: state.suspension?.since ?? null,
    cost_usd: cost.cost_usd,
    tokens: cost.tokens,
    parentDir,
    hansard,
  };
};

/** Discover and assemble the whole tree rooted at `root`. */
export const discoverTree = async (root: string): Promise<readonly FederationNode[]> => {
  const dirs = await findSessionDirs(root);
  const raws = (await Promise.all(dirs.map(readNode))).filter((n): n is RawNode => n !== null);
  return buildTree(raws, root);
};

/* -------------------------------------------------------------------------- */
/* Assembly (pure)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Link parent→children and compute depth from the resolved `inherits_from`
 * pointers. A pointer that resolves outside the discovered set makes the node a
 * root — the tree is whatever was found under `root`, not the whole filesystem.
 */
export const buildTree = (raws: readonly RawNode[], root: string): readonly FederationNode[] => {
  const byDir = new Map(raws.map((r) => [r.dir, r]));
  const inTree = (dir: string | null): dir is string => dir !== null && byDir.has(dir);

  const children = new Map<string, string[]>();
  for (const r of raws) {
    if (inTree(r.parentDir)) {
      const list = children.get(r.parentDir) ?? [];
      list.push(r.dir);
      children.set(r.parentDir, list);
    }
  }

  const depthOf = (dir: string): number => {
    let depth = 0;
    const seen = new Set<string>();
    let cur = byDir.get(dir);
    while (cur && inTree(cur.parentDir) && !seen.has(cur.dir)) {
      seen.add(cur.dir);
      depth += 1;
      cur = byDir.get(cur.parentDir);
    }
    return depth;
  };

  const objByDir = new Map<string, FederationNode>(
    raws.map((r) => [r.dir, {
      dir: r.dir,
      rel: relative(root, r.dir) || '.',
      guid: r.guid,
      protocol: r.protocol,
      state: r.state,
      cause: r.cause,
      since: r.since,
      cost_usd: r.cost_usd,
      tokens: r.tokens,
      parent: inTree(r.parentDir) ? r.parentDir : null,
      children: (children.get(r.dir) ?? []).slice().sort(),
      depth: depthOf(r.dir),
      hansard: r.hansard,
    }]),
  );

  // Emit in pre-order (a node immediately before its children) so the flat list
  // reads as the tree it is — a child never appears detached from its parent.
  const ordered: FederationNode[] = [];
  const seen = new Set<string>();
  const visit = (dir: string): void => {
    const node = objByDir.get(dir);
    if (node === undefined || seen.has(dir)) return;
    seen.add(dir);
    ordered.push(node);
    for (const child of node.children) visit(child);
  };
  [...objByDir.values()]
    .filter((n) => n.parent === null)
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .forEach((root_) => visit(root_.dir));
  // Any node not reached from a root (a broken pointer or cycle) still shows.
  for (const node of objByDir.values()) if (!seen.has(node.dir)) visit(node.dir);

  return ordered;
};

/* -------------------------------------------------------------------------- */
/* Roll-up (pure)                                                              */
/* -------------------------------------------------------------------------- */

export interface RollUp {
  readonly nodes: number;
  readonly by_state: Readonly<Record<string, number>>;
  readonly total_cost_usd: number;
  readonly total_tokens: number;
  readonly open_divisions: number;
}

/** Motions on the floor: a Division was called and no outcome has been recorded. */
export const openDivisions = (hansard: string): number => {
  const open = new Set<string>();
  for (const entry of parseEntries(hansard)) {
    const motion = entry.fields['Motion'];
    if (motion === undefined) continue;
    if (entry.type === 'DIVISION_CALLED') open.add(motion);
    else if (entry.type === 'MOTION_CARRIED' || entry.type === 'MOTION_REJECTED') open.delete(motion);
  }
  return open.size;
};

export const rollUp = (nodes: readonly FederationNode[]): RollUp => {
  const by_state: Record<string, number> = {};
  let cost = 0;
  let tokens = 0;
  let open = 0;
  for (const node of nodes) {
    by_state[node.state] = (by_state[node.state] ?? 0) + 1;
    cost += node.cost_usd;
    tokens += node.tokens;
    open += openDivisions(node.hansard);
  }
  return {
    nodes: nodes.length,
    by_state,
    total_cost_usd: cost,
    total_tokens: tokens,
    open_divisions: open,
  };
};

/* -------------------------------------------------------------------------- */
/* Cascade detection (pure)                                                    */
/* -------------------------------------------------------------------------- */

export interface CascadeFinding {
  readonly parent: FederationNode;
  readonly alert: CascadeAlert;
}

/**
 * A fault propagating across siblings. For every parent, gather its SUSPENDED
 * children as sibling faults (signature = the suspension cause) and ask the
 * existing checkCascade whether enough share a cause within the window to warn.
 * Detection only — recording the alert on the parent is the CLI's job, so the
 * traversal stays pure and testable.
 */
export const detectCascades = (
  nodes: readonly FederationNode[],
  now: string,
  config: CascadeConfig = DEFAULT_CASCADE,
): readonly CascadeFinding[] => {
  const byDir = new Map(nodes.map((n) => [n.dir, n]));
  const findings: CascadeFinding[] = [];

  for (const parent of nodes) {
    if (parent.children.length === 0) continue;
    const faults: SiblingFault[] = [];
    for (const childDir of parent.children) {
      const child = byDir.get(childDir);
      if (child && child.state === 'SUSPENDED' && child.cause !== null && child.since !== null) {
        faults.push({ node: child.guid, signature: child.cause, at: child.since });
      }
    }
    if (faults.length === 0) continue;
    const alert = checkCascade(faults, now, config);
    if (alert.triggered) findings.push({ parent, alert });
  }

  return findings;
};
