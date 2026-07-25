/**
 * SCM projection — governance acts projected onto a hosting platform.
 *
 * A Politik session is a git repository. That much is mandatory: the Charter,
 * the Hansard, STATE.json and the audit trail all live there, and a session
 * without git has no substrate.
 *
 * A **provider** is optional, and this module is the seam. When one is
 * configured, governance acts are additionally projected onto the platform —
 * a Motion becomes a Pull Request, a Division becomes a review request, an
 * Escalation becomes an Issue. When none is configured the session is complete
 * and correct without them.
 *
 * ## Why optional
 *
 * The architecture's own tagline is "Run local, run free", and ADR-0001 states
 * a session "convenes with no broker, no daemon, and no network service". A
 * framework making that promise cannot require an API client. But the same
 * document says the repository "is the motion system (Pull Requests)".
 *
 * Both hold under this split: git is the session, the platform is a projection
 * of it. Local sessions get the whole governance model; hosted sessions also
 * get the platform objects. Nothing about a Division changes because it was
 * mirrored to a review.
 *
 * ## The rule this module exists to keep
 *
 * **A projection failure must never invalidate a governance act.** The Hansard
 * is the record. If a Motion carried and the merge call fails, the Motion still
 * carried — the projection is behind, not the decision. Every function here
 * therefore reports what happened and refuses to throw its caller's governance
 * away.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { MergeStrategy } from './canon.ts';
import { parseEntries, type HansardEntry } from './hansard.ts';
import { GitHubProvider } from './providers/github.ts';
import type { ScmProvider } from './scm.ts';

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

export interface ProviderConfig {
  /** `owner/name`. Absent means local-only. */
  readonly repo?: string | undefined;
  /** Token. Falls back to GH_TOKEN / GITHUB_TOKEN. */
  readonly token?: string | undefined;
  readonly baseBranch?: string | undefined;
}

export interface Resolution {
  readonly provider: ScmProvider | null;
  /** Why there is no provider, for the operator. Null when there is one. */
  readonly reason: string | null;
}

/**
 * Resolve a provider from configuration.
 *
 * Returns a reason rather than throwing when none can be built: running local
 * is a supported mode, not a misconfiguration, and an operator who simply did
 * not pass `--repo` should see an explanation rather than an error.
 */
export const resolveProvider = (
  config: ProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
): Resolution => {
  if (config.repo === undefined || config.repo === '') {
    return { provider: null, reason: 'no --repo given — running local-only' };
  }

  const [owner, repo] = config.repo.split('/');
  if (owner === undefined || repo === undefined || owner === '' || repo === '') {
    return { provider: null, reason: `--repo must be owner/name, got "${config.repo}"` };
  }

  const token = config.token ?? env['GH_TOKEN'] ?? env['GITHUB_TOKEN'];
  if (token === undefined || token === '') {
    return {
      provider: null,
      reason: 'no token — set GH_TOKEN or GITHUB_TOKEN, or pass --token',
    };
  }

  return {
    provider: new GitHubProvider({
      owner,
      repo,
      token,
      ...(config.baseBranch === undefined ? {} : { baseBranch: config.baseBranch }),
    }),
    reason: null,
  };
};

/* -------------------------------------------------------------------------- */
/* Motion ↔ platform object                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The platform object a Motion is projected onto.
 *
 * Read back from the Hansard rather than held in a side table: the record is
 * the register, exactly as it is for actor seats. A Motion tabled before a
 * provider was configured simply has no link, which is a legitimate state.
 */
export const motionPr = (hansard: string, motion: string): number | null => {
  // Latest link wins: a Motion re-projected after a branch was recreated should
  // resolve to its current pull request, not its first.
  for (const entry of [...parseEntries(hansard)].reverse()) {
    if (entry.fields['Motion'] !== motion) continue;
    const pr = entry.fields['Pull request'];
    if (pr === undefined) continue;
    const n = Number.parseInt(pr.replace(/^#/, ''), 10);
    if (Number.isInteger(n)) return n;
  }
  return null;
};

/** Record the link between a Motion and its platform object. */
export const linkEntry = (
  motion: string,
  pr: number,
  url: string,
  at: string,
): HansardEntry => ({
  type: 'MOTION_PROJECTED',
  at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Motion: motion,
    'Pull request': `#${pr}`,
    Location: url,
  },
  body: 'The Motion is projected onto the hosting platform. The Hansard remains the record.',
});

/* -------------------------------------------------------------------------- */
/* Projections                                                                 */
/* -------------------------------------------------------------------------- */

export interface ProjectionResult {
  /** Did the projection reach the platform? */
  readonly projected: boolean;
  /** What happened, for the operator and the record. */
  readonly detail: string;
  /** Platform reference, when one was created or acted on. */
  readonly ref: string | null;
}

const skipped = (reason: string): ProjectionResult => ({
  projected: false,
  detail: reason,
  ref: null,
});

/**
 * Run a projection, converting any platform failure into a reported result.
 *
 * Deliberately swallows the error. A governance act has already been decided
 * and recorded by the time a projection runs; letting a network fault propagate
 * would abort a caller that has nothing left to undo, and would make the
 * Hansard's correctness depend on GitHub being reachable.
 */
const attempt = async (
  what: string,
  run: () => Promise<{ ref: string; detail: string }>,
): Promise<ProjectionResult> => {
  try {
    const { ref, detail } = await run();
    return { projected: true, detail, ref };
  } catch (error) {
    return {
      projected: false,
      detail: `${what} failed: ${error instanceof Error ? error.message : String(error)} — the governance act stands; the projection is behind`,
      ref: null,
    };
  }
};

/** Project a called Division onto a review request. */
export const projectDivision = async (
  provider: ScmProvider | null,
  hansard: string,
  motion: string,
  reviewers: readonly string[],
): Promise<ProjectionResult> => {
  if (provider === null) return skipped('local-only — no review requested');
  const pr = motionPr(hansard, motion);
  if (pr === null) return skipped(`${motion} is not projected onto a pull request`);
  if (reviewers.length === 0) return skipped('no reviewers named');

  return attempt('requestReview', async () => {
    const division = await provider.requestReview(pr, reviewers);
    return { ref: division.url, detail: `review requested on #${pr}` };
  });
};

/**
 * Project an Assent onto a merge — the act ADR-0004 defines Assent as.
 *
 * The Division decides and the Assent enacts; this is where enactment actually
 * reaches the world. Until it was wired, `politik assent` recorded a decision
 * that changed nothing.
 */
export const projectAssent = async (
  provider: ScmProvider | null,
  hansard: string,
  motion: string,
  strategy: MergeStrategy,
): Promise<ProjectionResult> => {
  if (provider === null) return skipped('local-only — nothing to merge');
  const pr = motionPr(hansard, motion);
  if (pr === null) return skipped(`${motion} is not projected onto a pull request`);

  return attempt('merge', async () => {
    const result = await provider.merge(pr, strategy);
    return {
      ref: result.sha,
      detail: result.merged
        ? `#${pr} merged via ${strategy} (${result.sha.slice(0, 8)})`
        : `#${pr} was not merged by the platform`,
    };
  });
};

/** Project an Escalation onto an Issue. */
export const projectEscalation = async (
  provider: ScmProvider | null,
  title: string,
  body: string,
  labels: readonly string[] = ['point-of-order'],
): Promise<ProjectionResult> => {
  if (provider === null) return skipped('local-only — no issue opened');

  return attempt('openIssue', async () => {
    const escalation = await provider.openIssue(title, body, labels);
    return { ref: escalation.url, detail: `issue #${escalation.number} opened` };
  });
};

/** Notify the Speaker out of band. */
export const projectNotification = async (
  provider: ScmProvider | null,
  actor: string,
  message: string,
): Promise<ProjectionResult> => {
  if (provider === null) return skipped('local-only — no notification sent');
  return attempt('notify', async () => {
    await provider.notify(actor, message);
    return { ref: actor, detail: `notified ${actor}` };
  });
};

/** Close the sitting's milestone as part of prorogation. */
export const projectProrogation = async (
  provider: ScmProvider | null,
  milestoneId: string | null,
): Promise<ProjectionResult> => {
  if (provider === null) return skipped('local-only — no milestone closed');
  if (milestoneId === null) return skipped('no milestone declared for this sitting');
  return attempt('closeMilestone', async () => {
    await provider.closeMilestone(milestoneId);
    return { ref: milestoneId, detail: `milestone ${milestoneId} closed` };
  });
};

/**
 * Record a projection outcome in the Hansard.
 *
 * Both outcomes are recorded, including failures. A reader must be able to see
 * that a Motion carried and its merge did not land — the gap between decision
 * and effect is exactly the kind of thing a governance record exists to expose.
 */
export const projectionEntry = (
  act: string,
  result: ProjectionResult,
  at: string,
): HansardEntry => ({
  type: result.projected ? 'PROJECTION' : 'PROJECTION_SKIPPED',
  at,
  actor: 'RECORD',
  role: 'OPERATOR',
  fields: {
    Act: act,
    Outcome: result.detail,
    ...(result.ref === null ? {} : { Reference: result.ref }),
  },
});
