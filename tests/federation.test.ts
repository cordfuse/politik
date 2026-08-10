/**
 * Federation — the GLOBAL layer as local traversal (ADR-0008).
 *
 * The algorithmic core is pure: buildTree assembles a flat list of nodes into a
 * pre-order hierarchy, rollUp totals it, detectCascades finds a fault repeating
 * across siblings. Those are tested directly. One integration test drives the
 * real discovery I/O over a session tree built with the binary.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTree, rollUp, openDivisions, detectCascades, discoverTree } from '../src/federation.ts';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

// A RawNode literal — buildTree's input shape, structurally.
const raw = (dir: string, parentDir: string | null, over: Record<string, unknown> = {}) => ({
  dir,
  guid: `guid-${dir}`,
  protocol: 'parliamentary',
  state: 'CONVENED',
  cause: null as string | null,
  since: null as string | null,
  cost_usd: 0,
  tokens: 0,
  parentDir,
  hansard: '',
  ...over,
});

describe('buildTree — assembling the hierarchy', () => {
  const raws = [
    raw('/t/org/backend/T2', '/t/org/backend'),
    raw('/t/org', null),
    raw('/t/org/frontend', '/t/org'),
    raw('/t/org/backend', '/t/org'),
    raw('/t/org/backend/T1', '/t/org/backend'),
  ];
  const tree = buildTree(raws, '/t');

  it('emits nodes in pre-order — a child never detached from its parent', () => {
    assert.deepEqual(
      tree.map((n) => n.rel),
      ['org', 'org/backend', 'org/backend/T1', 'org/backend/T2', 'org/frontend'],
    );
  });

  it('resolves parents, children and depth', () => {
    const backend = tree.find((n) => n.rel === 'org/backend');
    assert.ok(backend);
    assert.equal(backend.depth, 1);
    assert.equal(backend.children.length, 2);
    const root = tree.find((n) => n.rel === 'org');
    assert.equal(root?.parent, null);
    assert.equal(root?.depth, 0);
  });

  it('treats an inherits_from that leaves the tree as a root', () => {
    const tree2 = buildTree([raw('/t/solo', '/somewhere/else')], '/t');
    assert.equal(tree2[0]?.parent, null);
    assert.equal(tree2[0]?.depth, 0);
  });
});

describe('rollUp and openDivisions', () => {
  it('totals state, cost, tokens and open Motions across the tree', () => {
    const tree = buildTree([
      raw('/t/a', null, { state: 'CONVENED', cost_usd: 0.01, tokens: 100,
        hansard: '## x — DIVISION_CALLED\n\n**Motion:** m1\n' }),
      raw('/t/b', null, { state: 'SUSPENDED', cost_usd: 0.02, tokens: 200 }),
      raw('/t/c', null, { state: 'SUSPENDED' }),
    ], '/t');
    const r = rollUp(tree);
    assert.equal(r.nodes, 3);
    assert.deepEqual(r.by_state, { CONVENED: 1, SUSPENDED: 2 });
    assert.equal(r.total_cost_usd, 0.03);
    assert.equal(r.total_tokens, 300);
    assert.equal(r.open_divisions, 1);
  });

  it('counts a Motion open until its outcome is recorded', () => {
    assert.equal(openDivisions('## a — DIVISION_CALLED\n\n**Motion:** m\n'), 1);
    assert.equal(
      openDivisions('## a — DIVISION_CALLED\n\n**Motion:** m\n\n## b — MOTION_CARRIED\n\n**Motion:** m\n'),
      0,
    );
  });
});

describe('detectCascades — a fault repeating across siblings', () => {
  const parent = (extra = 0) => raw('/t/p', null);
  const child = (name: string, over: Record<string, unknown>) => raw(`/t/p/${name}`, '/t/p', over);
  const suspended = (cause: string) => ({ state: 'SUSPENDED', cause, since: '2026-08-01T00:00:00Z' });

  it('triggers when two siblings share a suspension cause in the window', () => {
    const tree = buildTree([parent(), child('a', suspended('POINT_OF_ORDER')), child('b', suspended('POINT_OF_ORDER'))], '/t');
    const found = detectCascades(tree, '2026-08-10T00:00:00Z');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.alert.signature, 'POINT_OF_ORDER');
    assert.equal(found[0]?.alert.nodes.length, 2);
  });

  it('does not trigger for a single fault, or for different causes', () => {
    const one = buildTree([parent(), child('a', suspended('POINT_OF_ORDER'))], '/t');
    assert.equal(detectCascades(one, '2026-08-10T00:00:00Z').length, 0);
    const mixed = buildTree([parent(), child('a', suspended('POINT_OF_ORDER')), child('b', suspended('CONSTITUTIONAL_CRISIS'))], '/t');
    assert.equal(detectCascades(mixed, '2026-08-10T00:00:00Z').length, 0);
  });

  it('does not trigger for faults outside the window', () => {
    const tree = buildTree([parent(), child('a', suspended('POINT_OF_ORDER')), child('b', suspended('POINT_OF_ORDER'))], '/t');
    // both faults are in early August; a check a year later is well past 30 days
    assert.equal(detectCascades(tree, '2027-08-10T00:00:00Z').length, 0);
  });
});

describe('discoverTree — real discovery over a session tree', () => {
  const runBin = (args: readonly string[]): Promise<void> =>
    new Promise((resolve) => {
      const child = spawn('node', [BIN, ...args], { stdio: 'ignore' });
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });

  it('walks a monorepo tree and assembles the nodes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'politik-fed-'));
    try {
      await runBin(['scaffold', '--dir', join(root, 'org'), '--quorum', '1']);
      await runBin(['init', '--charter', join(root, 'org', 'CHARTER.md'), '--speaker', 'steve', '--dir', join(root, 'org')]);
      await runBin(['scaffold', '--dir', join(root, 'org', 'team'), '--quorum', '1', '--parent', join(root, 'org')]);
      await runBin(['init', '--charter', join(root, 'org', 'team', 'CHARTER.md'), '--speaker', 'steve', '--dir', join(root, 'org', 'team')]);

      const tree = await discoverTree(root);
      assert.equal(tree.length, 2);
      assert.deepEqual(tree.map((n) => n.rel), ['org', 'org/team']);
      const team = tree.find((n) => n.rel === 'org/team');
      assert.equal(team?.depth, 1);
      assert.ok(team?.parent?.endsWith('/org'), 'team should resolve org as parent');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
