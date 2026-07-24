/**
 * Environment probe.
 *
 * Reports whether this host can run a Politik session, and how. Exists because
 * the platform matrix (EXECUTION.md § Phase 6) is otherwise a list of claims
 * nobody can reproduce — a Speaker on an unknown machine should be able to ask
 * the tool rather than trust a table written on someone else's laptop.
 *
 * Probing only. Nothing here mutates anything, and a failed check is reported,
 * never thrown.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { spawn } from 'node:child_process';
import { platform, release } from 'node:os';

import { AGENTS, type AgentSpec } from './agents.ts';
import { isAvailable } from './spawn.ts';

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface Diagnosis {
  /** False when something required is missing. */
  readonly ready: boolean;
  readonly platform: string;
  readonly checks: readonly Check[];
  /** Agents installed and therefore usable as constituencies here. */
  readonly agents: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Probes                                                                      */
/* -------------------------------------------------------------------------- */

const run = (command: string, args: readonly string[]): Promise<string | null> =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout?.on('data', (c: Buffer) => {
      output += c.toString();
    });
    child.on('close', (code) => resolve(code === 0 ? output.trim() : null));
    child.on('error', () => resolve(null));
  });

/**
 * Identify the environment.
 *
 * WSL is reported distinctly from Linux: it is a documented platform row of its
 * own, its auth story differs (API key rather than OAuth in the common setup),
 * and conflating the two would make the matrix lie.
 */
export const detectPlatform = (): string => {
  const os = platform();
  if (os === 'linux' && /microsoft|wsl/i.test(release())) return 'wsl2';
  if (os === 'linux') return 'linux';
  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';
  return os;
};

/** True when the process is running inside a container. */
export const inContainer = async (): Promise<boolean> => {
  if (process.env['POLITIK_IN_CONTAINER'] === '1') return true;
  const cgroup = await run('cat', ['/proc/1/cgroup']);
  if (cgroup !== null && /docker|containerd|kubepods/.test(cgroup)) return true;
  return (await run('test', ['-f', '/.dockerenv'])) !== null;
};

/* -------------------------------------------------------------------------- */
/* Diagnosis                                                                   */
/* -------------------------------------------------------------------------- */

const NODE_MINIMUM = 20;

/**
 * Diagnose this host.
 *
 * Requirements are deliberately few: Node and git. Everything else is a
 * capability report, because a session with one agent on a laptop is as valid
 * as one with six on a VPS.
 */
export const diagnose = async (): Promise<Diagnosis> => {
  const checks: Check[] = [];

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    name: 'node',
    status: nodeMajor >= NODE_MINIMUM ? 'ok' : 'fail',
    detail:
      nodeMajor >= NODE_MINIMUM
        ? `v${process.versions.node}`
        : `v${process.versions.node} — Politik requires Node >= ${NODE_MINIMUM}`,
  });

  const git = await run('git', ['--version']);
  checks.push({
    name: 'git',
    status: git === null ? 'fail' : 'ok',
    // Git is not optional: the repository *is* the session.
    detail: git ?? 'not found — the session repo is the substrate, git is required',
  });

  const container = await inContainer();
  checks.push({
    name: 'container',
    status: 'ok',
    detail: container ? 'running inside a container' : 'bare metal',
  });

  // Agents authenticated by OAuth generally cannot complete an interactive
  // login in a headless container; an API key is the documented path there.
  const installed: string[] = [];
  for (const agent of AGENTS) {
    if (await isAvailable(agent)) installed.push(agent.id);
  }

  checks.push({
    name: 'agents',
    status: installed.length > 0 ? 'ok' : 'warn',
    detail:
      installed.length > 0
        ? `${installed.length} installed: ${installed.join(', ')}`
        : 'none installed — a session needs at least one agent to seat a constituency',
  });

  if (container && installed.length > 0) {
    const oauthOnly = AGENTS.filter(
      (a: AgentSpec) => installed.includes(a.id) && a.auth_local === 'oauth',
    );
    if (oauthOnly.length > 0) {
      checks.push({
        name: 'auth',
        status: 'warn',
        detail: `in a container, prefer API keys — ${oauthOnly
          .map((a) => a.id)
          .join(', ')} default to OAuth, which cannot complete a browser login headlessly`,
      });
    }
  }

  const ollama = await run('ollama', ['--version']);
  if (ollama !== null) {
    checks.push({
      name: 'ollama',
      status: 'ok',
      detail: `${ollama} — local inference available, zero cost and zero auth`,
    });
  }

  return {
    ready: !checks.some((c) => c.status === 'fail'),
    platform: detectPlatform(),
    checks,
    agents: installed,
  };
};
