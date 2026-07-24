/**
 * Agent spawning.
 *
 * The stateless worker cycle: spawn, execute prompt, capture result, dispose.
 * No agent outlives its turn, and no state lives in the process — the Hansard
 * is the session.
 *
 * Kept separate from `agents.ts` so the registry, invocation shapes and prompt
 * composition stay pure and testable with no CLI installed. This module is the
 * only place a child process is created.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { spawn as nodeSpawn } from 'node:child_process';

import { buildInvocation, type AgentSpec } from './agents.ts';

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

export interface SpawnResult {
  readonly agent: string;
  readonly ok: boolean;
  readonly exit_code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Wall-clock milliseconds, for the LEDGER. */
  readonly elapsed_ms: number;
  /** True when the agent was killed for exceeding its timeout. */
  readonly timed_out: boolean;
}

export interface SpawnOptions {
  /** Working directory. Agents may never traverse above it. */
  readonly cwd: string;
  /** Hard ceiling. An agent that hangs must not hang the proceeding. */
  readonly timeout_ms?: number;
  /**
   * Environment for the child. Defaults to the parent environment.
   * Callers running untrusted agents should pass a minimal env explicitly.
   */
  readonly env?: NodeJS.ProcessEnv;
  readonly extraArgs?: readonly string[];
  /** Injectable for tests. */
  readonly spawnFn?: typeof nodeSpawn;
  /** Supplies elapsed time. Injectable so tests stay deterministic. */
  readonly clock?: () => number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Spawn                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Spawn an agent and capture its result.
 *
 * Never uses a shell. The prompt carries Charter text, Hansard excerpts and
 * arbitrary session content; passing that through a shell would make every
 * spawn an injection site. Args go to the child directly.
 *
 * Rejects only on a spawn failure the OS reports (command not found, permission
 * denied). A non-zero exit is a *result*, not an exception — an agent that
 * fails its task has still participated, and the Hansard records the outcome
 * either way.
 */
export const spawnAgent = async (
  agent: AgentSpec,
  prompt: string,
  options: SpawnOptions,
): Promise<SpawnResult> => {
  const invocation = buildInvocation(agent, prompt, options.extraArgs ?? []);
  const spawnFn = options.spawnFn ?? nodeSpawn;
  const clock = options.clock ?? (() => Date.now());
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const started = clock();

  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawnFn(invocation.command, [...invocation.args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, timeout)
        : null;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve({
        agent: agent.id,
        ok: code === 0 && !timedOut,
        exit_code: code,
        stdout,
        stderr,
        elapsed_ms: clock() - started,
        timed_out: timedOut,
      });
    };

    child.on('close', finish);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      reject(error);
    });
  });
};

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Is this agent's command present on PATH?
 *
 * Used at Writ Drop to fail fast: a Charter naming a constituency whose agent
 * is not installed should be caught before the session opens, not when the
 * first broadcast goes unanswered.
 */
export const isAvailable = async (
  agent: AgentSpec,
  spawnFn: typeof nodeSpawn = nodeSpawn,
): Promise<boolean> =>
  new Promise((resolve) => {
    // `which` directly rather than `sh -c command -v`: passing args alongside
    // shell:true concatenates instead of escaping them (Node DEP0190), which is
    // an injection surface for no benefit.
    const probe = spawnFn('which', [agent.command], {
      shell: false,
      stdio: 'ignore',
    });
    probe.on('close', (code) => resolve(code === 0));
    probe.on('error', () => resolve(false));
  });
