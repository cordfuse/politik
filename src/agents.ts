/**
 * Agent compatibility layer.
 *
 * Politik spawns stateless CLI agents: broadcast received, agent spawned,
 * prompt executed, result committed, agent disposed. This module owns the two
 * things that differ per agent — how you invoke it headlessly, and how you hand
 * it a prompt — and nothing else.
 *
 * The registry is a data table transcribed from RUNTIME.md § Politik Compatible
 * rather than a class per agent. Agents differ only in their argv shape and
 * auth story; encoding that as data keeps the whole layer testable without a
 * single CLI installed, and makes adding an agent a one-line change.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role, Verb } from './canon.ts';
import type { Envelope } from './envelope.ts';

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/** How an agent takes its prompt on the command line. */
export type PromptStyle =
  /** Prompt follows a flag, e.g. `claude -p "..."`. */
  | { readonly kind: 'flag'; readonly flag: string }
  /** Prompt follows a subcommand, e.g. `opencode run "..."`. */
  | { readonly kind: 'subcommand'; readonly subcommand: string }
  /** Prompt is the first bare argument, e.g. `codex "..."`. */
  | { readonly kind: 'positional' };

export type AuthMode = 'oauth' | 'api_key' | 'aws';

export interface AgentSpec {
  /** Registry key. Stable; used in Charters and Hansard attribution. */
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly prompt: PromptStyle;
  /**
   * Args this agent requires to run non-interactively at all — not user
   * preferences. Always injected before the prompt.
   */
  readonly headless_args?: readonly string[];
  /** Auth available when running on a developer machine. */
  readonly auth_local: AuthMode;
  /** Auth available when running headless (CI, VPS, container). */
  readonly auth_headless: AuthMode;
  /** Supports structured JSON over stdio. */
  readonly stdio_json: boolean;
  /**
   * Args that make the agent emit structured output carrying usage data.
   * Without these the LEDGER can record elapsed time but not tokens or cost.
   */
  readonly json_args?: readonly string[];
  readonly notes: string;
}

/**
 * Agents Politik can spawn as constituencies.
 *
 * Transcribed from RUNTIME.md § Politik Compatible. IDE-primary tools (Cursor,
 * Windsurf, Roo, Continue) are deliberately absent: they expose no headless
 * prompt, so they cannot be a constituency. A developer using one is an OPERATOR
 * in the session, not an agent of it. GitHub Copilot's agentic CLI (`copilot -p`)
 * DOES expose a headless prompt, so it is now included (auth is a persisted
 * OAuth login, same as the other subscription CLIs).
 */
export const AGENTS: readonly AgentSpec[] = Object.freeze([
  {
    id: 'claude-code',
    label: 'Claude Code',
    command: 'claude',
    prompt: { kind: 'flag', flag: '-p' },
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: true,
    json_args: ['--output-format', 'json'],
    notes: 'Primary target. --output-format json reports exact tokens and cost.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    command: 'gemini',
    prompt: { kind: 'flag', flag: '-p' },
    headless_args: ['--skip-trust'],
    json_args: ['-o', 'json'],
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: true,
    notes: '1M context. Refuses an untrusted directory without --skip-trust. Reports tokens, not cost.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    prompt: { kind: 'subcommand', subcommand: 'run' },
    json_args: ['--format', 'json'],
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: true,
    notes: '75+ providers, Ollama. Reports tokens and cost.',
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    command: 'qwen',
    prompt: { kind: 'flag', flag: '-p' },
    json_args: ['-o', 'json'],
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: true,
    notes: 'stream-json, Apache 2.0.',
  },
  {
    id: 'codex-cli',
    label: 'Codex CLI',
    command: 'codex',
    prompt: { kind: 'subcommand', subcommand: 'exec' },
    json_args: ['--json'],
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: true,
    notes:
      'OpenAI, Rust-based. Bare `codex` is an interactive TUI; `exec` is headless. ' +
      'Requires cwd to be a git repo — always true of a session repo.',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    command: 'agy',
    prompt: { kind: 'flag', flag: '-p' },
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: false,
    notes: 'Google. -p/--print for headless.',
  },
  {
    id: 'aider',
    label: 'Aider',
    command: 'aider',
    prompt: { kind: 'flag', flag: '--message' },
    auth_local: 'api_key',
    auth_headless: 'api_key',
    stdio_json: false,
    notes: 'Strong git integration.',
  },
  {
    id: 'goose',
    label: 'Goose',
    command: 'goose',
    prompt: { kind: 'subcommand', subcommand: 'run' },
    auth_local: 'api_key',
    auth_headless: 'api_key',
    stdio_json: false,
    notes: 'MCP-native, Block.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    prompt: { kind: 'flag', flag: '-p' },
    headless_args: ['--allow-all-tools'],
    auth_local: 'oauth',
    auth_headless: 'oauth',
    stdio_json: false,
    notes:
      'GitHub, agentic CLI (v1+). `-p --allow-all-tools` is headless. Auth is the ' +
      'persisted GitHub Copilot login; running headless needs an active Copilot ' +
      'subscription with the CLI policy enabled. Usage/cost shape not yet captured.',
  },
]);

export const findAgent = (id: string): AgentSpec | null =>
  AGENTS.find((a) => a.id === id) ?? null;

/* -------------------------------------------------------------------------- */
/* Invocation                                                                  */
/* -------------------------------------------------------------------------- */

export interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Build the headless invocation for an agent.
 *
 * Returns command and args separately, never a shell string. The prompt carries
 * a Charter, a Hansard excerpt and arbitrary session text; interpolating that
 * into a shell would be an injection vector on every spawn. Callers must pass
 * this to a non-shell spawn.
 */
export const buildInvocation = (
  agent: AgentSpec,
  prompt: string,
  extraArgs: readonly string[] = [],
): Invocation => {
  // Required headless args come first: without them the agent will not run
  // non-interactively at all, so a caller must not be able to displace them.
  const args = [...(agent.headless_args ?? []), ...extraArgs];

  switch (agent.prompt.kind) {
    case 'flag':
      return { command: agent.command, args: [...args, agent.prompt.flag, prompt] };
    case 'subcommand':
      return {
        command: agent.command,
        args: [agent.prompt.subcommand, ...args, prompt],
      };
    case 'positional':
      return { command: agent.command, args: [...args, prompt] };
  }
};

/** Whether an agent can run in the given environment without interactive auth. */
// Headless-capable = the agent has a non-interactive credential path. What a
// headless run cannot do is the one-time interactive *login*; ongoing invocation
// is fine once a credential persists. A stored OAuth token counts — `claude -p`,
// `codex exec`, `opencode run`, `agy -p` all ran unattended on their subscription
// logins with no API key (proven live), refreshing the token non-interactively —
// as do an API key and AWS auth. All three modes qualify; only an interactive-
// only tool with no persistence can't, and those are excluded from the registry.
export const canRunHeadless = (agent: AgentSpec): boolean =>
  agent.auth_headless === 'oauth' ||
  agent.auth_headless === 'api_key' ||
  agent.auth_headless === 'aws';

/* -------------------------------------------------------------------------- */
/* Prompt injection                                                            */
/* -------------------------------------------------------------------------- */

export interface PromptContext {
  readonly envelope: Envelope;
  /** The constituency this agent is seated in. */
  readonly role: Role;
  /** Verbs the Charter grants this role. */
  readonly verbs: readonly Verb[];
  /** Protocol vocabulary name, e.g. parliamentary. */
  readonly protocol: string;
  /** Recent Hansard, so a fresh agent has session context. */
  readonly hansard_excerpt?: string;
  /** Standing Orders prose from the Charter. */
  readonly standing_orders?: string;
  /**
   * Whether the protocol permits escalation (ADR-0006). Defaults to true. When
   * false — a Darwinist chamber — the agent is told there is no Point of Order:
   * it decides within its mandate or exits, since an appeal has no resolver.
   */
  readonly escalation_enabled?: boolean;
}

/**
 * Compose the prompt handed to a spawned agent.
 *
 * This is the Politik→agent contract, and it is deliberately uniform across
 * agents: the same text goes to Claude Code and to Goose. Per-agent prompt
 * tuning would make cross-protocol comparisons meaningless, and comparing
 * behaviour under identical conditions is the entire point of the research
 * layer (RESEARCH.md § Human Flaw thesis).
 *
 * Structure: who you are, what you may do, what has happened, what to do now.
 */
export const composePrompt = (context: PromptContext): string => {
  const sections: string[] = [
    '# POLITIK SESSION',
    '',
    `You are a **${context.role}** in a governed multi-agent session running the`,
    `**${context.protocol}** protocol. Session: \`${context.envelope.session_guid}\`.`,
    '',
    '## Your mandate',
    '',
    `Verbs granted to your role: ${context.verbs.length > 0 ? context.verbs.join(', ') : 'none'}.`,
    'You may not take an action your verbs do not grant.',
    context.escalation_enabled === false
      ? 'This protocol has no escalation: there is no Point of Order and no appeal. ' +
        'Decide within your mandate, or exit. A decision here is final.'
      : 'If you believe the correct action requires a verb you do not hold, file a ' +
        'Point of Order instead of proceeding.',
    '',
    '## Standing Orders',
    '',
    context.standing_orders?.trim() || '_None supplied. Follow CANON defaults._',
    '',
  ];

  if (context.hansard_excerpt !== undefined && context.hansard_excerpt.trim() !== '') {
    sections.push(
      '## Record so far',
      '',
      'The Hansard is the session. You are stateless; this is your context.',
      '',
      context.hansard_excerpt.trim(),
      '',
    );
  }

  sections.push(
    '## Business before you',
    '',
    context.envelope.prompt.trim(),
    '',
    '## Rules of the floor',
    '',
    '- Commit your result. Uncommitted work does not exist.',
    '- Do not traverse above the working directory. Doing so is a Standing',
    '  Orders violation, logged to the Hansard and escalated to the Speaker.',
    '- **Do not write to HANSARD.md, STATE.json or LEDGER.md at all** — not even',
    '  to append. The RECORD agent owns them exclusively, and writing to them is',
    '  a Standing Orders violation. Your work is recorded for you; state your',
    '  result in your reply and it will be entered in the record.',
    '- When your task is complete, stop. You are disposed after this turn.',
    '',
  );

  return sections.join('\n');
};
