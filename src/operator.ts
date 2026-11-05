/**
 * The operator interface (ADR-0010): who is driving the CLI, and what the record
 * should say about it.
 *
 * Politik does not choose a harness — the Speaker brings their own (Claude Code,
 * Codex, agy, opencode, …). These helpers detect which one is running a command,
 * so a constitutional act can be staged for the Speaker's confirmation and every
 * commit can say how it was requested.
 *
 * Detection is best-effort by design. The backstop is the terminal: a command
 * with no terminal on stdin is treated as automated whatever the environment
 * says. ADR-0010's threat model is explicit that this stops a cooperative harness
 * from acting on a mistake or an injected instruction — not a hostile agent with
 * the human's own shell privileges.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

/**
 * Environment variables a harness sets for the commands it runs, mapped to a
 * short name. `AI_AGENT` is checked first and preferred: where a harness sets
 * it, it names the harness and its version (e.g. `claude-code_2-1-283_agent`).
 */
export const HARNESS_MARKERS: ReadonlyArray<readonly [variable: string, harness: string]> = [
  ['CLAUDECODE', 'claude-code'],
  ['CODEX_SANDBOX', 'codex'],
  ['CODEX_SANDBOX_NETWORK_DISABLED', 'codex'],
  ['CODEX_THREAD_ID', 'codex'],
  ['ANTIGRAVITY_CONVERSATION_ID', 'agy'],
  ['OPENCODE', 'opencode'],
  ['OPENCODE_PID', 'opencode'],
  ['GEMINI_CLI', 'gemini-cli'],
];

type Env = Readonly<Record<string, string | undefined>>;

/** The harness running this process, or null if none is detectable. */
export const detectHarness = (env: Env): string | null => {
  const named = env['AI_AGENT']?.trim();
  if (named !== undefined && named !== '') return named;
  for (const [variable, harness] of HARNESS_MARKERS) {
    const value = env[variable];
    if (value !== undefined && value !== '') return harness;
  }
  return null;
};

/**
 * How a command was requested, for the provenance trailer: the harness if one is
 * detected, otherwise `terminal` when a human could be typing, otherwise `script`.
 */
export const requestedVia = (env: Env, interactive: boolean): string =>
  detectHarness(env) ?? (interactive ? 'terminal' : 'script');

/**
 * Whether a person is plausibly typing at this process: a terminal on stdin and
 * no harness in the environment. Anything else is automated.
 */
export const isSpeakerAtTerminal = (env: Env, interactive: boolean): boolean =>
  interactive && detectHarness(env) === null;

/** The trailer value recorded when a staged act was confirmed by the Speaker. */
export const CONFIRMED_BY_SPEAKER = 'speaker-at-terminal';

/**
 * Git trailers appended to every governance commit.
 *
 * `via` says who asked; `confirmedBy` is present only for an act that was staged
 * and then confirmed. Trailers keep the commit subject — the line every existing
 * tool and test reads — exactly as it was.
 */
export const provenanceTrailers = (
  via: string,
  confirmedBy: string | null = null,
  operator: string | null = null,
): string =>
  [
    `Politik-Requested-Via: ${via}`,
    ...(confirmedBy === null ? [] : [`Politik-Confirmed-By: ${confirmedBy}`]),
    // ADR-0011 §5: the person operating this clone, so a shared record says who acted.
    ...(operator === null ? [] : [`Politik-Operator: ${operator}`]),
  ].join('\n');
