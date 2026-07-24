import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GitHubProvider,
  ROLE_PERMISSIONS,
  ScmError,
} from '../src/providers/github.ts';
import { ROLES } from '../src/canon.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch double that replays queued responses and records every call. */
const stubFetch = (responses: unknown[]) => {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const next = queue.shift() ?? {};
    return {
      ok: true,
      status: 200,
      json: async () => next,
      text: async () => JSON.stringify(next),
    } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

const provider = (fetch: typeof globalThis.fetch) =>
  new GitHubProvider({ owner: 'cordfuse', repo: 'session-x', token: 'tok', fetch });

describe('role permission mapping', () => {
  it('maps every CANON role', () => {
    for (const role of ROLES) {
      assert.ok(ROLE_PERMISSIONS[role], `${role} unmapped`);
    }
  });

  it('gives AUTHORITY admin and OBSERVER read-only', () => {
    assert.equal(ROLE_PERMISSIONS.AUTHORITY, 'admin');
    assert.equal(ROLE_PERMISSIONS.OBSERVER, 'pull');
  });
});

describe('auth and headers', () => {
  it('sends a bearer token and pins the API version', async () => {
    const { fetch, calls } = stubFetch([{ number: 1, html_url: 'u', id: 9 }]);
    await provider(fetch).openIssue('t', 'b', []);
    assert.equal(calls[0]?.headers['authorization'], 'Bearer tok');
    assert.equal(calls[0]?.headers['x-github-api-version'], '2022-11-28');
  });

  it('never leaks the token into an error message', async () => {
    const fetch = (async () =>
      ({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
        json: async () => ({}),
      }) as Response) as unknown as typeof globalThis.fetch;

    await assert.rejects(
      () => provider(fetch).openIssue('t', 'b', []),
      (err: unknown) => {
        assert.ok(err instanceof ScmError);
        assert.equal(err.status, 403);
        assert.ok(!err.message.includes('tok'), 'token leaked into error');
        return true;
      },
    );
  });
});

describe('commit', () => {
  it('writes one commit for the whole file set', async () => {
    const { fetch, calls } = stubFetch([
      { object: { sha: 'head-sha' } },
      { tree: { sha: 'tree-sha' } },
      { sha: 'blob-1' },
      { sha: 'blob-2' },
      { sha: 'new-tree' },
      { sha: 'commit-sha', html_url: 'https://example/commit' },
      {},
    ]);

    const result = await provider(fetch).commit('WRIT_DROP', [
      { path: 'CHARTER.md', content: 'a' },
      { path: 'STATE.json', content: 'b' },
    ]);

    assert.equal(result.sha, 'commit-sha');

    const commitCall = calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST');
    assert.ok(commitCall);
    assert.deepEqual((commitCall.body as { parents: string[] }).parents, ['head-sha']);

    const refUpdate = calls.at(-1);
    assert.equal(refUpdate?.method, 'PATCH');
    assert.match(refUpdate?.url ?? '', /git\/refs\/heads\/main$/);
  });

  it('creates one blob per file', async () => {
    const { fetch, calls } = stubFetch([
      { object: { sha: 'h' } },
      { tree: { sha: 't' } },
      { sha: 'b1' },
      { sha: 'b2' },
      { sha: 'b3' },
      { sha: 'nt' },
      { sha: 'c', html_url: 'u' },
      {},
    ]);
    await provider(fetch).commit('m', [
      { path: 'a', content: '1' },
      { path: 'b', content: '2' },
      { path: 'c', content: '3' },
    ]);
    assert.equal(calls.filter((c) => c.url.endsWith('/git/blobs')).length, 3);
  });
});

describe('assent — merge strategy mapping', () => {
  const cases = [
    ['merge_commit', 'merge'],
    ['squash', 'squash'],
    ['fast_forward', 'rebase'],
  ] as const;

  for (const [strategy, method] of cases) {
    it(`maps ${strategy} to ${method}`, async () => {
      const { fetch, calls } = stubFetch([{ sha: 's', merged: true, message: 'ok' }]);
      const result = await provider(fetch).merge(7, strategy);
      assert.equal((calls[0]?.body as { merge_method: string }).merge_method, method);
      assert.equal(result.strategy, strategy);
      assert.ok(result.merged);
      assert.equal(result.motion, 7);
    });
  }
});

describe('motions, divisions, escalations', () => {
  it('opens a PR against the base branch', async () => {
    const { fetch, calls } = stubFetch([{ number: 12, html_url: 'u', id: 5 }]);
    const motion = await provider(fetch).openPR('Title', 'Body', 'motion-001');
    assert.equal(motion.number, 12);
    assert.equal(motion.branch, 'motion-001');
    assert.deepEqual(calls[0]?.body, {
      title: 'Title',
      body: 'Body',
      head: 'motion-001',
      base: 'main',
    });
  });

  it('requests reviewers for a Division', async () => {
    const { fetch, calls } = stubFetch([{ html_url: 'u', id: 3 }]);
    const division = await provider(fetch).requestReview(12, ['alpha', 'bravo']);
    assert.deepEqual([...division.reviewers], ['alpha', 'bravo']);
    assert.match(calls[0]?.url ?? '', /pulls\/12\/requested_reviewers/);
  });

  it('files an escalation with labels', async () => {
    const { fetch, calls } = stubFetch([{ number: 4, html_url: 'u', id: 8 }]);
    const escalation = await provider(fetch).openIssue('PoO', 'body', ['point-of-order']);
    assert.equal(escalation.number, 4);
    assert.deepEqual((calls[0]?.body as { labels: string[] }).labels, ['point-of-order']);
  });
});

describe('admin surface', () => {
  it('maps a CANON role to a GitHub permission on invite', async () => {
    const { fetch, calls } = stubFetch([{}]);
    await provider(fetch).addCollaborator({ handle: 'agent-x', role: 'OBSERVER' });
    assert.match(calls[0]?.url ?? '', /collaborators\/agent-x$/);
    assert.deepEqual(calls[0]?.body, { permission: 'pull' });
  });

  it('strips a leading # from a label colour', async () => {
    const { fetch, calls } = stubFetch([{ id: 1, url: 'u' }]);
    await provider(fetch).createLabel('motion', '#ff0000');
    assert.equal((calls[0]?.body as { color: string }).color, 'ff0000');
  });

  it('closes a milestone on prorogation', async () => {
    const { fetch, calls } = stubFetch([{}]);
    await provider(fetch).closeMilestone('3');
    assert.equal(calls[0]?.method, 'PATCH');
    assert.deepEqual(calls[0]?.body, { state: 'closed' });
  });

  it('dispatches a workflow on the base ref', async () => {
    const { fetch, calls } = stubFetch([{}]);
    await provider(fetch).triggerWorkflow('clerk.yml', { motion: '12' });
    assert.match(calls[0]?.url ?? '', /workflows\/clerk\.yml\/dispatches/);
    assert.deepEqual(calls[0]?.body, { ref: 'main', inputs: { motion: '12' } });
  });

  it('notifies by @-mentioning the actor', async () => {
    const { fetch, calls } = stubFetch([{ number: 1, html_url: 'u', id: 1 }]);
    await provider(fetch).notify('speaker', 'Point of Order filed');
    const body = calls[0]?.body as { body: string; labels: string[] };
    assert.match(body.body, /^@speaker/);
    assert.deepEqual(body.labels, ['politik:notification']);
  });
});

describe('discussions (GraphQL)', () => {
  it('surfaces GraphQL errors rather than returning a bad ref', async () => {
    const { fetch } = stubFetch([
      { node_id: 'repo-node' },
      { errors: [{ message: 'Discussions disabled' }] },
    ]);
    await assert.rejects(
      () => provider(fetch).openDiscussion('t', 'b', 'cat-id'),
      /Discussions disabled/,
    );
  });

  it('returns the discussion ref on success', async () => {
    const { fetch, calls } = stubFetch([
      { node_id: 'repo-node' },
      { data: { createDiscussion: { discussion: { id: 'd1', url: 'https://example/d1' } } } },
    ]);
    const ref = await provider(fetch).openDiscussion('t', 'b', 'cat-id');
    assert.equal(ref.id, 'd1');
    assert.match(calls[1]?.url ?? '', /graphql$/);
  });
});

describe('enterprise base url', () => {
  it('honours an apiBase override', async () => {
    const { fetch, calls } = stubFetch([{ number: 1, html_url: 'u', id: 1 }]);
    const gh = new GitHubProvider({
      owner: 'o',
      repo: 'r',
      token: 't',
      apiBase: 'https://ghe.internal/api/v3',
      fetch,
    });
    await gh.openIssue('t', 'b', []);
    assert.match(calls[0]?.url ?? '', /^https:\/\/ghe\.internal\/api\/v3\//);
  });
});
