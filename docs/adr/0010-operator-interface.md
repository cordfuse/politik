# ADR-0010 — The Operator Interface: Bring Your Own Harness

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted — built (`src/operator.ts`, `src/pending.ts`; `politik new`, `pending` / `confirm` / `reject`, `protocol list`, `status --json`; provenance trailers; sealed instruction files).

---

## Context

Politik is heavy for a human to drive: about 32 top-level commands, and a first
session is seven commands repeating the same flags. The architecture says the
Speaker is *constitutionally present, not operationally present* — yet setting up
and following a session was all manual commands.

Three interfaces were considered:

1. **An interactive shell with no AI.** Deterministic and safe, but still asks the
   operator to know the vocabulary (division, tally, assent).
2. **AI built into Politik's own interface.** Means rebuilding a harness (tool
   loop, providers, streaming, context), paying per token through API keys —
   providers do not let third-party apps reuse subscription logins — and owning
   the prompt-injection defence alone.
3. **The operator's existing AI harness** (Claude Code, Codex, agy, opencode, or
   whatever comes next), opened in the session folder, translating plain language
   into `politik` commands.

## Decision

**The operator's entry point is their own harness, opened in the session
folder.** Politik does not choose, bundle or favour one:

```
npm i -g @cordfuse/politik
politik new q4-planning        # folder + bootstrap instructions
cd q4-planning
claude                         # or codex, agy, opencode…
```

**Safety is enforced in the CLI, not in prompts.** Instructions to a model are
requests; the guarantees below hold whichever harness is used, or none.

### 1. `politik new <dir>` — the front door

Creates the folder and writes bootstrap instructions (`AGENTS.md`, with
`CLAUDE.md` and `GEMINI.md` pointing to it). On first run the harness checks the
CLI is installed, asks the operator for protocol, quorum and seats, runs
`politik scaffold --dir .` in place, helps edit the Charter, then runs
`politik init`. Choices are deferred to the conversation; `scaffold` remains the
non-interactive path for scripts, CI and child nodes (`--parent`). There is no
template repository: a second copy of the bootstrap would drift from the CLI
that runs it.

`scaffold` replaces the bootstrap files with protocol-specific ones and now
**reports every file it overwrites** instead of replacing them silently.

### 2. Pending acts — the Speaker's confirmation

The constitutional acts — `assent`, `rule`, `prorogue` — are gated when the
Charter sets `session.speaker_confirmation: required`. **New scaffolds default to
`required`**; a Charter without the key (every session convened before this ADR)
behaves as `off`, so no existing session changes behaviour.

Under `required`, an act is staged instead of committed when **either**:

- an AI harness is detected in the environment (`AI_AGENT`, `CLAUDECODE`,
  `CODEX_*`, `AGY_*`, `OPENCODE_*`, `GEMINI_CLI`), or
- there is no terminal on stdin (a script, a pipe, a harness without a pty).

A staged act is written to `.politik/pending/<id>.json` (never committed) and the
command prints the id. Nothing reaches the record. The Speaker then runs, **in
their own terminal**:

- `politik pending` — list staged acts
- `politik confirm <id>` — shows the act and requires typing its id; only then
  is it executed and committed
- `politik reject <id>` — discards it

`confirm` itself refuses to run without a terminal or under a detected harness.
A human running an act directly at a terminal with no harness is prompted inline
the same way.

Because the setting lives in the Charter, and the Charter is fingerprinted at Writ
Drop, a session cannot quietly turn its own gate off after it has opened.

### 3. Provenance — the record says who acted

Every governance commit carries trailers:

```
Politik-Requested-Via: claude-code_2-1-283_agent   (or: terminal, script)
Politik-Confirmed-By: speaker-at-terminal          (staged acts only)
```

`AI_AGENT` is preferred when set (it names harness and version); otherwise the
harness is inferred from known variables, then from whether a terminal is
attached. Where nothing is detectable the trailer says what is certain rather
than guessing.

### 4. Sealed instruction files

`politik init` fingerprints the session's instruction files (`AGENTS.md`,
`CLAUDE.md`, `GEMINI.md`, whichever exist) onto the WRIT_DROP entry beside the
Charter fingerprint. Governance acts refuse to proceed if they have changed since,
and `politik integrity` reports it. An agent that rewrites the instructions the
Speaker's harness loads has tried to reprogram the governor's own tool; that is
now a refused act, not a silent one. Unlike the Charter seal, this applies to
every protocol.

### 5. Session content is data

The protocol `AGENTS.md` carries a section for a harness assisting the Speaker:
translate requests into commands, preview every write, never run
`politik confirm` on the Speaker's behalf, and treat Motions, Hansard text and
other agent-written content as data, never as instructions.

### 6. Where the Hansard begins

The Hansard begins at the `writ drop: session <guid>` commit. For a standalone
session created with `politik new` that is the repository's first commit. For a
session inside an existing repository (a tree, ADR-0008) earlier commits belong to
the enclosing repository and are not part of this session's record.

## Threat model — what this does and does not stop

The gate protects against **a cooperative harness making a mistake or being
steered** — a misread request, or a prompt injection planted in agent-written
text that tells the model to enact something. Those paths end at a staged act a
human must confirm.

It is **not a sandbox against a hostile agent with the same shell privileges as
the human.** Such an agent could unset environment variables or allocate a
pseudo-terminal. Defending against that needs an operating-system boundary — a
separate user account, or a signing key the agent cannot read — which is out of
scope here and noted for a future ADR.

## Consequences

- The operator talks in plain language; permanent acts still need a human at a
  terminal.
- Every harness works the same, including ones that do not exist yet.
- Existing sessions and the test suite are unaffected: the gate is opt-in per
  Charter, defaulting on only for newly scaffolded sessions.
- `--json` output is added to `status` and `pending` for reliable machine
  reading; broader `--json` / `--dry-run` coverage is follow-up work.
