import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  linkEntry,
  motionPr,
  projectAssent,
  projectDivision,
  projectEscalation,
  projectionEntry,
  resolveProvider,
} from '../src/projection.ts';
import { appendEntry } from '../src/hansard.ts';
import type { ScmProvider } from '../src/scm.ts';

const BASE = '# HANSARD\n\n---\n';
const AT = '2026-04-08T14:00:00Z';

const linked = (motion = 'motion-001', pr = 7): string =>
  appendEntry(BASE, linkEntry(motion, pr, `https://example/pull/${pr}`, AT));

/** A provider double recording what the engine asked of it. */
const stubProvider = (over: Partial<ScmProvider> = {}) => {
  const calls: string[] = [];
  const provider = {
    name: 'stub',
    commit: async () => { calls.push('commit'); return { id: 'c', url: 'u', sha: 'c' }; },
    openPR: async () => { calls.push('openPR'); return { id: '1', url: 'u', number: 1, branch: 'b' }; },
    requestReview: async (pr: number, actors: readonly string[]) => {
      calls.push(`requestReview:${pr}:${actors.join(',')}`);
      return { id: 'd', url: 'u', motion: pr, reviewers: [...actors] };
    },
    merge: async (pr: number, strategy: string) => {
      calls.push(`merge:${pr}:${strategy}`);
      return { id: 's', url: 'u', motion: pr, strategy: strategy as never, merged: true, sha: 'abcdef1234' };
    },
    openIssue: async (title: string) => {
      calls.push(`openIssue:${title}`);
      return { id: 'i', url: 'u', number: 42 };
    },
    openDiscussion: async () => { calls.push('openDiscussion'); return { id: 'x', url: 'u' }; },
    closeMilestone: async () => { calls.push('closeMilestone'); },
    notify: async () => { calls.push('notify'); },
    triggerWorkflow: async () => { calls.push('triggerWorkflow'); return { id: 'w', url: 'u' }; },
    createLabel: async () => { calls.push('createLabel'); return { id: 'l', url: 'u' }; },
    addCollaborator: async () => { calls.push('addCollaborator'); },
    ...over,
  } as unknown as ScmProvider;
  return { provider, calls };
};

describe('provider resolution', () => {
  it('runs local-only with no repo, and says why', () => {
    const result = resolveProvider({}, {});
    assert.equal(result.provider, null);
    assert.match(result.reason ?? '', /local-only/);
  });

  it('runs local-only with a repo but no token', () => {
    const result = resolveProvider({ repo: 'o/r' }, {});
    assert.equal(result.provider, null);
    assert.match(result.reason ?? '', /no token/);
  });

  it('rejects a malformed repo without throwing', () => {
    const result = resolveProvider({ repo: 'not-a-repo' }, { GH_TOKEN: 't' });
    assert.equal(result.provider, null);
    assert.match(result.reason ?? '', /owner\/name/);
  });

  it('builds a provider from the environment', () => {
    const result = resolveProvider({ repo: 'o/r' }, { GH_TOKEN: 't' });
    assert.ok(result.provider);
    assert.equal(result.reason, null);
  });

  it('accepts GITHUB_TOKEN as well as GH_TOKEN', () => {
    assert.ok(resolveProvider({ repo: 'o/r' }, { GITHUB_TOKEN: 't' }).provider);
  });
});

describe('motion ↔ pull request', () => {
  it('reads the link back off the Hansard', () => {
    assert.equal(motionPr(linked(), 'motion-001'), 7);
  });

  it('returns null for an unlinked Motion', () => {
    assert.equal(motionPr(linked(), 'motion-002'), null);
    assert.equal(motionPr(BASE, 'motion-001'), null);
  });

  it('takes the most recent link when a Motion is re-projected', () => {
    const h = appendEntry(linked('motion-001', 7), linkEntry('motion-001', 9, 'u', AT));
    assert.equal(motionPr(h, 'motion-001'), 9);
  });
});

describe('projections with a provider', () => {
  it('projects Assent onto a merge using the Charter strategy', async () => {
    const { provider, calls } = stubProvider();
    const result = await projectAssent(provider, linked(), 'motion-001', 'squash');
    assert.ok(result.projected);
    assert.deepEqual(calls, ['merge:7:squash']);
    assert.match(result.detail, /#7 merged via squash/);
  });

  it('projects a Division onto a review request', async () => {
    const { provider, calls } = stubProvider();
    const result = await projectDivision(provider, linked(), 'motion-001', ['a', 'b']);
    assert.ok(result.projected);
    assert.deepEqual(calls, ['requestReview:7:a,b']);
  });

  it('projects an Escalation onto an issue', async () => {
    const { provider, calls } = stubProvider();
    const result = await projectEscalation(provider, 'PoO', 'body');
    assert.ok(result.projected);
    assert.equal(calls[0], 'openIssue:PoO');
    assert.match(result.detail, /issue #42/);
  });
});

describe('local-only is a supported mode, not a failure', () => {
  it('skips every projection with no provider', async () => {
    for (const result of [
      await projectAssent(null, linked(), 'motion-001', 'merge_commit'),
      await projectDivision(null, linked(), 'motion-001', ['a']),
      await projectEscalation(null, 't', 'b'),
    ]) {
      assert.ok(!result.projected);
      assert.match(result.detail, /local-only/);
    }
  });

  it('skips when the Motion has no pull request', async () => {
    const { provider, calls } = stubProvider();
    const result = await projectAssent(provider, BASE, 'motion-001', 'merge_commit');
    assert.ok(!result.projected);
    assert.match(result.detail, /not projected onto a pull request/);
    assert.deepEqual(calls, [], 'must not call the platform without a link');
  });
});

describe('a projection failure never invalidates the act', () => {
  it('reports a platform error instead of throwing', async () => {
    const { provider } = stubProvider({
      merge: async () => {
        throw new Error('422 not mergeable');
      },
    });
    const result = await projectAssent(provider, linked(), 'motion-001', 'merge_commit');
    assert.ok(!result.projected);
    // The Assent already happened and was recorded; a network fault must not
    // propagate to a caller that has nothing left to undo.
    assert.match(result.detail, /the governance act stands; the projection is behind/);
  });

  it('records the gap between decision and effect', () => {
    const entry = projectionEntry(
      'ASSENT motion-001',
      { projected: false, detail: 'merge failed: 422', ref: null },
      AT,
    );
    assert.equal(entry.type, 'PROJECTION_SKIPPED');
    assert.match(entry.fields?.['Outcome'] ?? '', /422/);
  });

  it('records a successful projection with its reference', () => {
    const entry = projectionEntry(
      'ASSENT motion-001',
      { projected: true, detail: '#7 merged', ref: 'abcdef12' },
      AT,
    );
    assert.equal(entry.type, 'PROJECTION');
    assert.equal(entry.fields?.['Reference'], 'abcdef12');
  });
});
