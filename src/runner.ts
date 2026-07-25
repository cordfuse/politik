/**
 * Session runner — the engine loop.
 *
 * Everything else in this framework is a component: parse a Charter, elect a
 * broadcaster, compose a prompt, spawn an agent, append a record. This module
 * is what asks them to happen in order, and it is the difference between a
 * framework that is tested and a framework that has run.
 *
 *     broadcast -> elect -> compose -> spawn -> capture -> record -> settle
 *
 * The loop is deliberately thin. Every decision it makes has already been made
 * somewhere pure and testable; the runner's job is sequencing and I/O, not
 * governance. If a governance question is being answered here, it is in the
 * wrong place.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { findAgent, composePrompt, type AgentSpec } from './agents.ts';
import type { Role, Verb } from './canon.ts';
import { parseCharter, type Charter } from './charter.ts';
import { parseEnvelope, claimSlot, type Envelope } from './envelope.ts';
import { standForElection, bowOut, type ElectionOptions } from './election.ts';
import { nodeLockFs } from './lockfs.ts';
import { appendEntry, type HansardEntry } from './hansard.ts';
import { spawnAgent, type SpawnResult } from './spawn.ts';
import {
  appendLedgerRow, parseResultText, parseUsage, type Usage,
} from './ledger.ts';
import { createState, parseState, serializeState, type SessionStateFile } from './state.ts';
import { checkCapability, parseProfile } from './capability.ts';

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export interface RunOptions {
  /** Session repo working directory. Agents run here and may not go above it. */
  readonly dir: string;
  /** Registry id of the agent to seat, e.g. `claude-code`. */
  readonly agent_id: string;
  /** Handle recorded in the Hansard for this agent. */
  readonly actor: string;
  /** Constituency to seat the agent in. */
  readonly role: Role;
  /** The business — becomes the envelope prompt. */
  readonly task: string;
  /** ISO-8601 UTC. Supplied by the caller; the runner reads no clock. */
  readonly now: string;
  /** Verbs the Charter grants this role. */
  readonly verbs?: readonly Verb[];
  readonly timeout_ms?: number;
  /**
   * Ask the agent for structured output so the LEDGER can record real tokens
   * and cost. On by default: an unmeasured turn is a hole in the cost record.
   */
  readonly measure?: boolean;
  /** Directory for constituency lockfiles. Defaults to the session's .politik. */
  readonly lock_dir?: string;
  /** Injectable for tests. */
  readonly spawnFn?: typeof spawn;
  /**
   * A broadcast received from the bus.
   *
   * When absent the runner synthesizes an envelope from `task` — the direct
   * invocation path. When present the session is genuinely broadcast-driven:
   * the envelope came off the transport and carries the slot count the
   * broadcaster published, not one this process invented.
   */
  readonly envelope?: Envelope;
}

export type RunOutcome =
  | { readonly ok: true; readonly result: SpawnResult; readonly entry: HansardEntry; readonly files_touched: readonly string[] }
  | { readonly ok: false; readonly reason: string; readonly entry?: HansardEntry };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const readIf = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

const git = (dir: string, args: readonly string[], spawnFn: typeof spawn): Promise<string> =>
  new Promise((resolve) => {
    const child = spawnFn('git', [...args], {
      cwd: dir,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    child.stdout?.on('data', (c: Buffer) => {
      output += c.toString();
    });
    child.on('close', () => resolve(output.trim()));
    child.on('error', () => resolve(''));
  });

/** Uncommitted work in the tree. */
const dirtyFiles = async (dir: string, spawnFn: typeof spawn): Promise<string[]> =>
  (await git(dir, ['status', '--porcelain'], spawnFn))
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((l) => l.length > 0);

/** Current HEAD, or empty on a repo with no commits. */
const head = (dir: string, spawnFn: typeof spawn): Promise<string> =>
  git(dir, ['rev-parse', 'HEAD'], spawnFn);

/**
 * Files the agent touched — committed *or* left in the tree.
 *
 * Both halves are necessary. The Standing Orders tell agents "commit your
 * result; uncommitted work does not exist", so a well-behaved agent leaves a
 * clean tree and a new commit — and a working-tree diff alone would report that
 * it did nothing. The first live session did exactly this: the agent wrote and
 * committed a Motion, and the runner recorded "files touched: none".
 *
 * Asking git rather than tracking writes ourselves, because the agent is an
 * opaque process and the repository is the authority on what changed.
 */
const filesTouched = async (
  dir: string,
  beforeHead: string,
  beforeDirty: readonly string[],
  spawnFn: typeof spawn,
): Promise<string[]> => {
  const afterHead = await head(dir, spawnFn);
  const committed =
    afterHead !== '' && beforeHead !== '' && afterHead !== beforeHead
      ? (await git(dir, ['diff', '--name-only', `${beforeHead}..${afterHead}`], spawnFn))
          .split('\n')
          .filter((l) => l.length > 0)
      : [];

  const afterDirty = await dirtyFiles(dir, spawnFn);
  const newlyDirty = afterDirty.filter((f) => !beforeDirty.includes(f));

  return [...new Set([...committed, ...newlyDirty])];
};

/** Last N entries of the Hansard, as context for a stateless agent. */
const recentRecord = (hansard: string, entries = 3): string => {
  const parts = hansard.split(/^## /m).slice(1);
  return parts
    .slice(-entries)
    .map((p) => `## ${p.trim()}`)
    .join('\n\n');
};

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Run one turn of a session: seat an agent, give it the business, record what
 * it did.
 *
 * Refuses rather than proceeds when the session is not CONVENED. Every actor
 * reads STATE.json before acting; a runner that ignored it would be the one
 * participant in the session exempt from its own governance.
 */
export const runTurn = async (options: RunOptions): Promise<RunOutcome> => {
  const spawnFn = options.spawnFn ?? spawn;

  const agent: AgentSpec | null = findAgent(options.agent_id);
  if (agent === null) {
    return { ok: false, reason: `unknown agent: ${options.agent_id}` };
  }

  const stateRaw = await readIf(join(options.dir, 'STATE.json'));
  const state: SessionStateFile | null = stateRaw === null ? null : parseState(stateRaw);
  if (state === null) {
    return { ok: false, reason: `no readable STATE.json in ${options.dir}` };
  }
  if (state.state !== 'CONVENED') {
    return {
      ok: false,
      reason: `session is ${state.state}${
        state.suspension === null ? '' : ` (${state.suspension.cause})`
      } — agents act only while CONVENED`,
    };
  }

  const charterRaw = await readIf(join(options.dir, 'CHARTER.md'));
  if (charterRaw === null) return { ok: false, reason: 'no CHARTER.md — not a session repo' };
  const parsed = parseCharter(charterRaw);
  if (!parsed.ok) return { ok: false, reason: 'CHARTER.md does not parse' };
  const charter: Charter = parsed.charter;

  // Slots available for this constituency, per the Charter.
  const slots = charter.constituencies
    .filter((c) => c.role === options.role)
    .reduce((total, c) => total + c.slots, 0);
  if (slots === 0) {
    return { ok: false, reason: `Charter seats no ${options.role} constituency` };
  }

  // A received broadcast is authoritative over anything this process would
  // synthesize: it carries the slot count the broadcaster published, and
  // inventing our own would let two peers disagree about how many seats remain.
  const envelopeSource = [
    `# [${state.session_guid}]`,
    `## target-actor: ${options.role}`,
    `## slots-remaining: ${slots}`,
    `## protocol: ${charter.protocol}`,
    '## prompt: |',
    ...options.task.split('\n').map((l) => `  ${l}`),
    '',
  ].join('\n');

  // Capability gate. The architecture is explicit that the engine "validates
  // model compliance at Writ Drop and refuses to spawn a mismatched model
  // regardless of operator assignment" — so a mismatch is refused here, before
  // an agent is spawned, not noticed afterwards.
  const seat = charter.constituencies.find((c) => c.role === options.role);
  const profileSource = await readIf(join(options.dir, 'actors', `${options.actor}.md`));
  if (seat !== undefined && profileSource !== null) {
    const profile = parseProfile(profileSource, options.actor);
    if (profile !== null) {
      const capability = checkCapability(profile, seat);
      if (!capability.ok) {
        const failures = capability.issues
          .filter((i) => i.severity === 'fail')
          .map((i) => i.message)
          .join('; ');
        return { ok: false, reason: `capability mismatch — ${failures}` };
      }
    }
  }

  let envelope: Envelope;
  if (options.envelope !== undefined) {
    envelope = options.envelope;
    if (envelope.target_actor !== options.role) {
      return {
        ok: false,
        reason: `broadcast targets ${envelope.target_actor}, this agent stands for ${options.role}`,
      };
    }
  } else {
    const envelopeResult = parseEnvelope(envelopeSource);
    if (!envelopeResult.ok) {
      return { ok: false, reason: 'failed to build a valid broadcast envelope' };
    }
    envelope = envelopeResult.envelope;
  }

  // Elect into the constituency. Local scope only — the Hansard commit is the
  // global arbiter, and this lock merely grants the right to attempt it.
  const election: ElectionOptions = {
    fs: nodeLockFs,
    lockDir: options.lock_dir ?? join(options.dir, '.politik', 'locks'),
    staleAfterMs: 60 * 60 * 1000,
  };

  const outcome = await standForElection(
    envelope,
    options.actor,
    options.role,
    election,
    options.now,
  );

  if (!outcome.elected) {
    return {
      ok: false,
      reason:
        outcome.reason === 'DEFERRED'
          ? `constituency held by ${outcome.holder?.agent ?? 'another agent'}`
          : outcome.reason,
    };
  }

  try {
    const hansard = (await readIf(join(options.dir, 'HANSARD.md'))) ?? '';

    const prompt = composePrompt({
      envelope,
      role: options.role,
      verbs: options.verbs ?? ['READ', 'WRITE', 'ESCALATE'],
      protocol: charter.protocol,
      standing_orders: charter.body,
      hansard_excerpt: recentRecord(hansard),
    });

    const beforeHead = await head(options.dir, spawnFn);
    const beforeDirty = await dirtyFiles(options.dir, spawnFn);

    const measure = options.measure !== false && agent.json_args !== undefined;

    const result = await spawnAgent(agent, prompt, {
      cwd: options.dir,
      timeout_ms: options.timeout_ms,
      spawnFn,
      extraArgs: measure ? agent.json_args : undefined,
    });

    // Structured output carries the answer inside a JSON envelope; unwrap it so
    // the Hansard records what the agent said, not how it was transported.
    const usage: Usage | null = measure ? parseUsage(agent.id, result.stdout) : null;
    const answer = (measure ? parseResultText(agent.id, result.stdout) : null) ?? result.stdout;

    const touched = await filesTouched(options.dir, beforeHead, beforeDirty, spawnFn);

    // Files the RECORD agent owns exclusively (POLITIK-ARCHITECTURE.md
    // § FILE OWNERSHIP). An actor writing to them is a Standing Orders
    // violation, and it must be recorded rather than silently tolerated —
    // a record an actor can write is not a record.
    const OWNED_BY_RECORD = ['HANSARD.md', 'STATE.json', 'LEDGER.md'];
    const violations = touched.filter((f) => OWNED_BY_RECORD.includes(f));

    const entry: HansardEntry = {
      type: result.ok ? 'MOTION_TABLED' : 'SESSION_FAULT',
      at: options.now,
      actor: options.actor,
      role: options.role,
      fields: {
        Agent: agent.id,
        Outcome: result.timed_out
          ? 'TIMED OUT'
          : result.ok
            ? 'completed'
            : `exit ${String(result.exit_code)}`,
        'Elapsed ms': String(result.elapsed_ms),
        'Files touched': touched.length > 0 ? touched.join(', ') : 'none',
        ...(violations.length > 0
          ? {
              'Standing Orders violation': `actor wrote to ${violations.join(', ')} — owned by RECORD`,
            }
          : {}),
      },
      body: result.ok
        ? answer.trim().slice(0, 2000)
        : `Agent failed.\n\n${result.stderr.trim().slice(0, 1000)}`,
    };

    await writeFile(join(options.dir, 'HANSARD.md'), appendEntry(hansard, entry), 'utf8');

    // The Clerk appends after every act. A turn that produced no ledger row
    // would be work the session cannot account for.
    if (charter.ledger.enabled) {
      const ledgerPath = join(options.dir, charter.ledger.path);
      const ledger = (await readIf(ledgerPath)) ?? '';
      await writeFile(
        ledgerPath,
        appendLedgerRow(ledger, {
          at: options.now,
          actor: options.actor,
          role: options.role,
          item: touched.length > 0 ? touched.join(' ') : entry.type,
          elapsed_ms: result.elapsed_ms,
          usage,
        }),
        'utf8',
      );
    }

    // The slot is consumed by the Hansard commit, not by winning the lock.
    claimSlot(envelope);

    // Quorum is carried forward untouched. A turn is not a Division, and
    // `present` counts actors eligible to vote — it was previously being
    // overwritten with the leftover broadcast slot count, which is a different
    // quantity entirely and made the figure meaningless.
    const nextState = createState({
      session_guid: state.session_guid,
      protocol: state.protocol,
      state: 'CONVENED',
      quorum: state.quorum,
      hansard_head: state.hansard_head,
      updated_at: options.now,
    });
    await writeFile(join(options.dir, 'STATE.json'), serializeState(nextState), 'utf8');

    return result.ok
      ? { ok: true, result, entry, files_touched: touched }
      : { ok: false, reason: `agent failed: exit ${String(result.exit_code)}`, entry };
  } finally {
    // Always release, including on a throw — a lock held by a dead turn would
    // strand the constituency until the stale window expires.
    await bowOut(envelope, options.actor, options.role, election);
  }
};
