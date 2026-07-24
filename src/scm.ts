/**
 * SCM Provider Interface.
 *
 * GitHub is the reference implementation; the framework only ever speaks to
 * this interface. POLITIK-ARCHITECTURE.md names the methods but leaves return
 * types unspecified — Phase 1 ruled that a signature exercise to be settled in
 * the scaffold. This module settles it.
 *
 * Design rules applied here:
 *  - Every call is async. Every provider is a network boundary.
 *  - Nothing returns a bare string. Each mutation returns a typed handle so the
 *    Hansard writer has something attributable to record.
 *  - Provider-native identifiers stay opaque (`id`), with `url` carried
 *    alongside for the human-readable record.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { MergeStrategy, Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Handles                                                                     */
/* -------------------------------------------------------------------------- */

/** A provider-native reference to a created or mutated object. */
export interface Ref {
  /** Opaque provider identifier. Never parsed by the engine. */
  readonly id: string;
  /** Human-readable location, recorded in the Hansard. */
  readonly url: string;
}

/** Result of a commit — a MOTION's underlying write. */
export interface CommitRef extends Ref {
  readonly sha: string;
}

/** A tabled MOTION. */
export interface MotionRef extends Ref {
  readonly number: number;
  readonly branch: string;
}

/** An ESCALATION — a Point of Order. */
export interface EscalationRef extends Ref {
  readonly number: number;
}

/** A DIVISION requested against a MOTION. */
export interface DivisionRef extends Ref {
  readonly motion: number;
  readonly reviewers: readonly string[];
}

/** The enactment of a carried MOTION. */
export interface AssentResult extends Ref {
  readonly motion: number;
  readonly strategy: MergeStrategy;
  readonly merged: boolean;
  readonly sha: string;
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/** A file written as part of a commit. Content is UTF-8 text. */
export interface FileWrite {
  readonly path: string;
  readonly content: string;
}

/** Permission granted to a collaborator, expressed in CANON terms. */
export interface CollaboratorGrant {
  readonly handle: string;
  readonly role: Role;
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The full surface the engine requires of an SCM. A provider that implements
 * these eleven methods can host a Politik session.
 *
 * Note: POLITIK-ARCHITECTURE.md § SCM PROVIDER ABSTRACTION lists eleven method
 * names while EXECUTION.md § Phase 1 refers to "ten methods". The interface
 * below implements all eleven as listed in the architecture document.
 */
export interface ScmProvider {
  /** Provider identifier, e.g. `github`. Recorded in the Hansard header. */
  readonly name: string;

  /** Write files to the session repo. The underlying act of every MOTION. */
  commit(message: string, files: readonly FileWrite[]): Promise<CommitRef>;

  /** Table a MOTION. */
  openPR(title: string, body: string, branch: string): Promise<MotionRef>;

  /** Call a DIVISION on a tabled MOTION. */
  requestReview(pr: number, actors: readonly string[]): Promise<DivisionRef>;

  /**
   * ASSENT — enact a carried MOTION. The Division decides; this enacts.
   * Callers must verify the Motion carried before invoking; providers reject
   * strategies the Charter did not permit.
   */
  merge(pr: number, strategy: MergeStrategy): Promise<AssentResult>;

  /** File an ESCALATION — a Point of Order. */
  openIssue(
    title: string,
    body: string,
    labels: readonly string[],
  ): Promise<EscalationRef>;

  /** Open a discussion thread for non-binding deliberation. */
  openDiscussion(
    title: string,
    body: string,
    category: string,
  ): Promise<Ref>;

  /** Close a milestone — used by the prorogation workflow. */
  closeMilestone(id: string): Promise<void>;

  /** Notify an actor out of band. Speaker email notification rides this. */
  notify(actor: string, message: string): Promise<void>;

  /** Trigger provider-side automation — the Clerk. */
  triggerWorkflow(
    name: string,
    inputs: Readonly<Record<string, string>>,
  ): Promise<Ref>;

  /** Create a label in the provider's taxonomy. */
  createLabel(name: string, color: string): Promise<Ref>;

  /** Admit an actor to the session repo at a CANON role. */
  addCollaborator(grant: CollaboratorGrant): Promise<void>;
}
