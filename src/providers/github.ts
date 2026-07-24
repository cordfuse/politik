/**
 * GitHub SCM provider — the reference implementation of ScmProvider.
 *
 * Implemented against the GitHub REST API with the platform `fetch`, rather
 * than an SDK: the interface is eleven methods, Node 20 ships fetch, and a
 * governance framework benefits from a shallow dependency tree. The one
 * exception is Discussions, which GitHub exposes only through GraphQL.
 *
 * This module performs I/O. Everything above it (canon, charter, state, init)
 * stays pure, so a session can be validated and initialized with no network.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { MergeStrategy, Role } from '../canon.ts';
import type {
  AssentResult,
  CollaboratorGrant,
  CommitRef,
  DivisionRef,
  EscalationRef,
  FileWrite,
  MotionRef,
  Ref,
  ScmProvider,
} from '../scm.ts';

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

export interface GitHubProviderOptions {
  /** Repository owner — user or org. */
  readonly owner: string;
  /** Repository name. This repo IS the session. */
  readonly repo: string;
  /** Token with repo scope. Never logged, never committed. */
  readonly token: string;
  /** Default branch commits target. */
  readonly baseBranch?: string;
  /** Override for GitHub Enterprise. */
  readonly apiBase?: string;
  /** Injectable for tests. Defaults to the platform fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * CANON role -> GitHub collaborator permission.
 *
 * A design decision, not a spec quotation: CANON describes governance trust,
 * GitHub describes repository capability, and they are not the same axis.
 * The mapping is deliberately conservative — OPERATOR and MEMBER both receive
 * `push` because the Charter, not the SCM ACL, is what separates their verbs.
 * Governance is enforced in the Hansard; this is only the coarse outer gate.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, string>> = Object.freeze({
  AUTHORITY: 'admin',
  DELEGATE: 'maintain',
  OPERATOR: 'push',
  MEMBER: 'push',
  OBSERVER: 'pull',
});

/** CANON merge strategy -> GitHub merge method. */
const MERGE_METHODS: Readonly<Record<MergeStrategy, string>> = Object.freeze({
  merge_commit: 'merge',
  squash: 'squash',
  fast_forward: 'rebase',
});

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export class ScmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'ScmError';
  }
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export class GitHubProvider implements ScmProvider {
  readonly name = 'github';

  readonly #owner: string;
  readonly #repo: string;
  readonly #token: string;
  readonly #base: string;
  readonly #apiBase: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: GitHubProviderOptions) {
    this.#owner = options.owner;
    this.#repo = options.repo;
    this.#token = options.token;
    this.#base = options.baseBranch ?? 'main';
    this.#apiBase = options.apiBase ?? 'https://api.github.com';
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  get #repoPath(): string {
    return `repos/${this.#owner}/${this.#repo}`;
  }

  async #request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#apiBase}/${endpoint}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.#token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      // Body may carry GitHub's error detail; never include request headers.
      const detail = await response.text().catch(() => '');
      throw new ScmError(
        `${method} ${endpoint} failed: ${response.status}${detail ? ` — ${detail.slice(0, 500)}` : ''}`,
        response.status,
        endpoint,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /* ---------------------------------------------------------------------- */
  /* Commit                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Write files as a single commit via the git data API: blobs -> tree ->
   * commit -> ref update. One commit for the whole file set, because a Writ
   * Drop that lands as eight separate commits is eight Hansard-visible events
   * for one governance act.
   */
  async commit(message: string, files: readonly FileWrite[]): Promise<CommitRef> {
    const ref = await this.#request<{ object: { sha: string } }>(
      'GET',
      `${this.#repoPath}/git/ref/heads/${this.#base}`,
    );
    const headSha = ref.object.sha;

    const head = await this.#request<{ tree: { sha: string } }>(
      'GET',
      `${this.#repoPath}/git/commits/${headSha}`,
    );

    const blobs = await Promise.all(
      files.map(async (file) => {
        const blob = await this.#request<{ sha: string }>(
          'POST',
          `${this.#repoPath}/git/blobs`,
          { content: file.content, encoding: 'utf-8' },
        );
        return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );

    const tree = await this.#request<{ sha: string }>(
      'POST',
      `${this.#repoPath}/git/trees`,
      { base_tree: head.tree.sha, tree: blobs },
    );

    const commit = await this.#request<{ sha: string; html_url: string }>(
      'POST',
      `${this.#repoPath}/git/commits`,
      { message, tree: tree.sha, parents: [headSha] },
    );

    await this.#request('PATCH', `${this.#repoPath}/git/refs/heads/${this.#base}`, {
      sha: commit.sha,
    });

    return { id: commit.sha, sha: commit.sha, url: commit.html_url };
  }

  /* ---------------------------------------------------------------------- */
  /* Motions and Divisions                                                   */
  /* ---------------------------------------------------------------------- */

  async openPR(title: string, body: string, branch: string): Promise<MotionRef> {
    const pr = await this.#request<{ number: number; html_url: string; id: number }>(
      'POST',
      `${this.#repoPath}/pulls`,
      { title, body, head: branch, base: this.#base },
    );
    return {
      id: String(pr.id),
      number: pr.number,
      branch,
      url: pr.html_url,
    };
  }

  async requestReview(pr: number, actors: readonly string[]): Promise<DivisionRef> {
    const result = await this.#request<{ html_url: string; id: number }>(
      'POST',
      `${this.#repoPath}/pulls/${pr}/requested_reviewers`,
      { reviewers: [...actors] },
    );
    return {
      id: String(result.id),
      url: result.html_url,
      motion: pr,
      reviewers: [...actors],
    };
  }

  /**
   * ASSENT — enact a carried Motion.
   *
   * Note: `fast_forward` maps to GitHub's `rebase` method, the closest
   * available behaviour (no merge node). Charter rule 6 already restricts
   * fast_forward to quorum-1 sessions, where no Division needs evidencing.
   */
  async merge(pr: number, strategy: MergeStrategy): Promise<AssentResult> {
    const result = await this.#request<{ sha: string; merged: boolean; message: string }>(
      'PUT',
      `${this.#repoPath}/pulls/${pr}/merge`,
      { merge_method: MERGE_METHODS[strategy] },
    );
    return {
      id: result.sha,
      sha: result.sha,
      url: `https://github.com/${this.#owner}/${this.#repo}/pull/${pr}`,
      motion: pr,
      strategy,
      merged: result.merged,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Escalations and deliberation                                            */
  /* ---------------------------------------------------------------------- */

  async openIssue(
    title: string,
    body: string,
    labels: readonly string[],
  ): Promise<EscalationRef> {
    const issue = await this.#request<{ number: number; html_url: string; id: number }>(
      'POST',
      `${this.#repoPath}/issues`,
      { title, body, labels: [...labels] },
    );
    return { id: String(issue.id), number: issue.number, url: issue.html_url };
  }

  /**
   * Discussions are GraphQL-only on GitHub — there is no REST equivalent.
   * Requires the repository to have Discussions enabled and the category to
   * exist; the caller resolves category names to IDs out of band.
   */
  async openDiscussion(title: string, body: string, category: string): Promise<Ref> {
    const query = `
      mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId, categoryId: $categoryId,
          title: $title, body: $body
        }) { discussion { id url } }
      }`;

    const repo = await this.#request<{ node_id: string }>('GET', this.#repoPath);

    const response = await this.#fetch(`${this.#apiBase}/graphql`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          repositoryId: repo.node_id,
          categoryId: category,
          title,
          body,
        },
      }),
    });

    if (!response.ok) {
      throw new ScmError(
        `openDiscussion failed: ${response.status}`,
        response.status,
        'graphql',
      );
    }

    const payload = (await response.json()) as {
      data?: { createDiscussion?: { discussion?: { id: string; url: string } } };
      errors?: { message: string }[];
    };

    if (payload.errors?.length) {
      throw new ScmError(
        `openDiscussion failed: ${payload.errors.map((e) => e.message).join('; ')}`,
        200,
        'graphql',
      );
    }

    const discussion = payload.data?.createDiscussion?.discussion;
    if (!discussion) {
      throw new ScmError('openDiscussion returned no discussion', 200, 'graphql');
    }
    return { id: discussion.id, url: discussion.url };
  }

  /* ---------------------------------------------------------------------- */
  /* Session lifecycle and admin                                             */
  /* ---------------------------------------------------------------------- */

  async closeMilestone(id: string): Promise<void> {
    await this.#request('PATCH', `${this.#repoPath}/milestones/${id}`, {
      state: 'closed',
    });
  }

  /**
   * Out-of-band notification.
   *
   * GitHub has no direct-message API, so this opens a labelled issue
   * @-mentioning the actor. GitHub's own notification settings turn that into
   * the Speaker's email — which is the delivery path the architecture assumes
   * ("Receives Points of Order — SCM Issues + email").
   */
  async notify(actor: string, message: string): Promise<void> {
    await this.#request('POST', `${this.#repoPath}/issues`, {
      title: `Notification: ${actor}`,
      body: `@${actor}\n\n${message}`,
      labels: ['politik:notification'],
    });
  }

  async triggerWorkflow(
    name: string,
    inputs: Readonly<Record<string, string>>,
  ): Promise<Ref> {
    await this.#request(
      'POST',
      `${this.#repoPath}/actions/workflows/${name}/dispatches`,
      { ref: this.#base, inputs },
    );
    // Dispatch returns 204 with no body; the run is addressed by workflow name.
    return {
      id: name,
      url: `https://github.com/${this.#owner}/${this.#repo}/actions/workflows/${name}`,
    };
  }

  async createLabel(name: string, color: string): Promise<Ref> {
    const label = await this.#request<{ id: number; url: string }>(
      'POST',
      `${this.#repoPath}/labels`,
      { name, color: color.replace(/^#/, '') },
    );
    return { id: String(label.id), url: label.url };
  }

  async addCollaborator(grant: CollaboratorGrant): Promise<void> {
    await this.#request(
      'PUT',
      `${this.#repoPath}/collaborators/${grant.handle}`,
      { permission: ROLE_PERMISSIONS[grant.role] },
    );
  }
}
