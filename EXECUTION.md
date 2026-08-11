# POLITIK — EXECUTION PLAN

**Attribution:** Steve Krisjanovs, Cordfuse

Phased implementation plan (phases 0–11) and the Politik Tree hierarchical architecture.

See [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md) for CANON and the engine layer.

---

## EXECUTION PLAN

### PHASE 0 — Naming ✅ COMPLETE
```
[x] Name the framework — POLITIK
[x] Verify npm namespace — @cordfuse/politik (verify before first publish)
[x] Verify GitHub org namespace — cordfuse/politik
[x] Verify Docker Hub namespace — cordfuse/politik
[ ] Register all namespaces privately
[x] Update this document with confirmed name — done
```
### PHASE 0.5 — Prior Art ✅ COMPLETE
```
[x] Create private GitHub repo — cordfuse/politik
[x] Initial commit — markdown docs only
[x] Tag v0.1.0-architecture
[x] Enable Zenodo on repo
[x] Create public GitHub release from tag
[x] Zenodo DOI minted — 10.5281/zenodo.19490359
[x] DOI confirmed — doi.org/10.5281/zenodo.19490359
```

### PHASE 1 — Architecture Lock

ADRs live in [`docs/adr/`](docs/adr/). An item is ticked only when a decision is
recorded **and** nothing blocks it.

```
[x] Finalize CANON primitive layer names          — POLITIK-ARCHITECTURE.md
[x] Finalize protocol schema format               — POLITIK-ARCHITECTURE.md
[x] Finalize broadcast envelope format            — POLITIK-ARCHITECTURE.md
[x] Finalize session repo structure               — POLITIK-ARCHITECTURE.md
[x] Transport hook: git-based default (zero infrastructure, reference transport; Crosstalk is one such implementation), NATS an opt-in latency upgrade (Tailscale + NATS for multi-machine) — libp2p rejected (over-built for known permissioned assemblies). See ADR-0001.
[x] Finalize CHARTER.md spec                      — ADR-0002 (Accepted)
[x] Finalize STATE.json schema                    — ADR-0003 (Accepted)
[x] Finalize SCM provider interface spec          — return types settled in src/scm.ts
[x] Document all decisions in ADRs                — 0001–0009 Accepted
[ ] Draft arXiv preprint — unified paper (framework + experiment)
```

**Both rulings are settled. `POLITIK-ARCHITECTURE.md` was not amended.**

1. **`mode` / `record_mode`** are protocol-level keys only. The `session:` block
   never legitimately owned them — `quorum: 1` already declares a solo session,
   and the Hansard is required by default. Corrected in RUNTIME.md. See ADR-0002.
2. **`CONSTITUTIONAL_CRISIS` is a cause of suspension**, not a sixth state and
   not a free-standing fault. RUNTIME.md § Constitutional Capture already
   specifies that it auto-suspends the session. CANON stays at five states. See
   ADR-0003.

**Settled in the scaffold.** The SCM provider interface named its methods but no
return types — a signature exercise rather than a governance decision. Return
types are now fixed in `src/scm.ts`, where every call is async and every mutation
returns a typed handle so the Hansard writer has something attributable to
record.

*Correction:* this section previously said the interface names *ten* methods.
`POLITIK-ARCHITECTURE.md` § SCM PROVIDER ABSTRACTION lists **eleven**. The
architecture document is authoritative and the implementation follows it.

### PHASE 2 — Reference Implementation (GitHub SCM)

Stack: Node + TypeScript, npm `@cordfuse/politik`, binary `politik`. Tests run
on `node:test` via tsx. Everything except the SCM provider and the CLI is pure —
no I/O, no clock, no randomness.

```
[x] Scaffold cordfuse/politik private repo        — package.json, tsconfig, CI-ready
[x] Implement CHARTER.md parser and validator     — src/charter.ts (ADR-0002 rules 1-8)
[x] Implement session repo initializer (Writ Drop)— src/init.ts
[x] Implement GitHub SCM provider                 — src/providers/github.ts (see note)
[x] Implement broadcast envelope parser           — src/envelope.ts
[x] Implement first-actor-per-constituency election— src/election.ts + src/lockfs.ts
[x] Implement Hansard commit writer               — src/hansard.ts
[x] Implement Point of Order workflow             — src/escalation.ts
[x] Implement Speaker email notification          — provider notify() + session workflow
[x] Implement quorum check                        — src/quorum.ts
[x] Implement prorogation workflow                — src/prorogation.ts
```

**Note — `openDiscussion` is deferred to Phase 4.** GitHub exposes discussion
creation only through GraphQL, and its category *ID* requirement conflicts with
the `category` parameter in the interface. Adopting it would put a second
protocol and a second auth path inside an otherwise REST-only provider. Nothing
in Phase 2 exercises the debate floor. The method throws a 501 rather than
silently succeeding.

**Note — Speaker notification has two delivery paths.** `ScmProvider.notify()`
opens a labelled issue @-mentioning the actor, which GitHub turns into email via
the recipient's own notification settings. Separately, the session repo
initializer installs `.github/workflows/point-of-order.yml` (RUNTIME.md § Point
of Order Workflow) for direct SMTP delivery on push to `escalations/`. The
workflow's path filter excludes rulings — a ruling is the Speaker's own reply,
and notifying them of it would loop. It requires three repository secrets
(`MAIL_USERNAME`, `MAIL_PASSWORD`, `SPEAKER_EMAIL`) and fails loudly without
them, because an escalation nobody hears is the exact failure this flow exists
to prevent.

**Verified live.** The provider was exercised against a real GitHub repository:
Writ Drop committed as a single commit (blobs → tree → commit → ref), label
created, escalation issue filed, suspension state committed, notification
delivered, `openDiscussion` refused as designed.

### PHASE 3 — Agent Compatibility Layer

Implemented in `src/agents.ts` (registry, invocation shapes, prompt injection)
and `src/spawn.ts` (process lifecycle). The registry is a data table, not a class
per agent — agents differ only in argv shape and auth story.

```
[x] Claude Code integration and test    — PASS, live
[x] Gemini CLI integration and test     — PASS, live (needs --skip-trust)
[x] OpenCode integration and test       — PASS, live
[x] Codex CLI integration and test      — PASS, live (exec subcommand, in a git repo)
[x] Antigravity integration and test    — PASS, live (added; see note)
[~] Qwen Code integration and test      — implemented; local auth unconfigured
[ ] Aider integration and test          — not installed on this host
[ ] Goose integration and test          — not installed on this host
[x] Document prompt injection format per agent
[x] Document headless invocation per agent
```

**Live results.** Each agent was driven through `spawnAgent()` with a trivial
prompt and had to return a specific token. Five passed.

**Cost measurement — five of nine agents report usage.** The LEDGER was
`unmeasured` for everything but Claude Code until the adapters were probed
directly:

| Agent | Tokens | Cost | Model |
|---|---|---|---|
| Claude Code | yes | yes | yes |
| OpenCode | yes | yes | yes |
| Gemini CLI | yes | — | yes |
| Codex CLI | yes | — | — |
| Qwen Code | yes (same shape as Gemini) | — | yes |
| Antigravity | — | — | — |
| GitHub Copilot | — | — | — |
| Aider, Goose | not installed | — | — |

Where a vendor does not report spend the row records `unmeasured`, never a
figure derived from a rate card. An estimate dressed as a measurement is the one
failure this ledger exists to avoid.

**Supported set.** The agents in active use — and the ones the LEDGER is kept
honest for — are **Claude Code, Antigravity (`agy`), Codex, OpenCode**. **GitHub
Copilot** is now in the registry too (see below), with live measurement pending a
subscription. Everything else stays in the registry and runs, but is not on the
critical path.

**Backlog (active).**

| Agent | Blocker | To close |
|---|---|---|
| Antigravity | usage only emits under `--dangerously-skip-permissions` | capture one real sample, then add its ledger parser |
| GitHub Copilot | needs an active Copilot subscription with the CLI policy enabled | verify live, then capture usage shape for its parser |

**GitHub Copilot — added (auth model corrected).** The registry originally
excluded Copilot as an IDE tool "with no headless prompt" and required every
agent to run headless via an API key. Both premises were wrong: the agentic
`copilot -p --allow-all-tools` has a headless prompt, and headless auth is not
API-key-only — a persisted OAuth token runs unattended (proven live this session
for Claude, Codex, OpenCode, agy). `canRunHeadless` now accepts any
non-interactive credential (OAuth, API key, AWS), and Copilot is in the registry
with OAuth headless auth. Its ledger parser lands once a real usage sample is
captured against an active subscription — same as Antigravity.

**Roadmap — help wanted (outside the used set).** Gemini, Qwen, Aider, Goose.
Gemini and Qwen already report tokens and keep working; Aider and Goose record
`unmeasured`. All ship as runnable agents. Verifying or adding their measurement
is **deferred and open for a PR** — a missing parser returns `null`, never a
fabricated number. Not on the v1 critical path.

Phase 3 is otherwise complete.

**Antigravity added.** `agy` supports `-p`/`--print` headless, is a
Cordfuse-supported CLI, and was absent from the compatibility table. Verified
live and added to both the table and the registry.

**Two spec errors found by live testing**, both corrected in RUNTIME.md
§ Politik Compatible:

1. **Codex CLI was documented as `codex "..."`.** That form starts an
   interactive TUI and fails headlessly with `stdin is not a terminal`. The
   headless form is `codex exec "..."`. Codex additionally requires the working
   directory to be a git repository — always true of a session repo, but not of
   an arbitrary temp directory.
2. **Gemini CLI refuses to run in an untrusted directory**, exiting 55. It needs
   `--skip-trust`, now carried as a required headless arg rather than left to
   the caller.

**Prompt injection format.** One format for every agent: role and mandate,
granted verbs, Standing Orders, Hansard excerpt (agents are stateless — the
record is their context), the business at hand, then the rules of the floor.
Deliberately uniform: per-agent prompt tuning would void the cross-protocol
comparisons the research layer depends on.

### PHASE 4 — Parliamentary Protocol (reference protocol)

```
[x] Implement CANON → Parliamentary vocabulary mapping — src/protocol.ts + protocols/parliamentary.yml
[x] CHARTER.md template (Parliamentary)                — src/templates/parliamentary.ts
[x] Role templates (Speaker, Minister, Backbencher, …) — one per CANON role, five in total
[x] Standing Orders template                           — prose body of the Charter template
[x] Hansard format spec                                — ADR-0005 (Accepted)
[x] GitHub label taxonomy                              — LABEL_TAXONOMY, nine labels
[x] GitHub Projects Order Paper template               — ORDER-PAPER.md
[x] GitHub Milestone workflow                          — a Milestone is a sitting; see note
```

**The protocol layer is translation, not behaviour.** A protocol maps CANON
terms to an industry vocabulary for the interface and for humans. Nothing in a
manifest changes engine behaviour except four declared flags — `no_escalation`,
`no_record`, `immutable_charter`, and the `record_mode` that ADR-0002 rule 5
tests against. A DIVISION is a DIVISION whether it renders as "Division" or
"Sprint Review".

**Record types stay in CANON.** A Parliamentary session records
`POINT_OF_ORDER`, never "Point of Order" (ADR-0005 ruling 3). Translation is
presentation; the record must stay machine-comparable across protocols, which is
what makes the research layer possible at all.

**Unmapped terms warn rather than fail.** A protocol that omits a term falls
back to the CANON word, which is readable by design. Refusing to load an
incomplete manifest would make authoring a protocol needlessly brittle.

**Hansard format settled.** ADR-0005 ratifies the two choices Phase 2 had to
make provisionally — entries at H2 under the document's H1 title, and an open
record-type set — and adds five further rulings covering the heading format,
mandatory attribution, single-line fields, mechanical append-only, and the
principle that reading the record is never authoritative (git history is).
`src/hansard.ts` needed no change.

**Milestone workflow.** A Milestone is a sitting: the business intended for one
continuous stretch of a proceeding, mapped in ORDER-PAPER.md. Closing it is part
of prorogation — `prorogue()` returns `milestone_to_close` and the GitHub
provider implements `closeMilestone()`. No separate automation is required.

**Verified end to end** through the CLI: `scaffold` → `validate` → `init` →
`status`. The scaffolded Charter passes Writ Drop validation against the
Parliamentary protocol, including rule 5 — the template uses `merge_commit`
because Parliamentary declares `record_mode: distributed`, under which squash is
rejected. A test asserts this so the template and the validator cannot drift.

**New CLI command:** `politik scaffold --out <dir> [--quorum <n>]` writes the
Charter, Order Paper and role files for editing. Deliberately separate from
`init`: scaffolding produces prose for a Speaker to read and edit, `init` drops
the Writ and opens the session. Conflating them would convene a session on an
unread template.

### PHASE 5 — Protocol Library

**Framing note:** Parliamentary is protocol #1, not a privileged mode.
All protocols are equal. The framework is protocol-agnostic.

**Shipped with framework (reference protocols):** all ten in `protocols/`,
every one lint-clean.

```
[x] Parliamentary Democracy (reference protocol — ships first)  parliamentary.yml
[x] Agile / Scrum                                               agile.yml
[x] Military Operation                                          military.yml
[x] Criminal Trial / Legal                                      legal.yml
[x] Corporate / Board                                           corporate.yml
[x] Battle Royale                                               battle-royale.yml
[x] League Season (sports)                                      league-season.yml
[x] Elimination Tournament — Single                             elimination-tournament.yml
[x] Peer Review (scientific research)                           peer-review.yml
[x] Red Team / Blue Team Science                                red-blue-team.yml
```

All five modes are represented: constitutional (parliamentary, agile, legal,
corporate, league-season, peer-review), authoritarian (military,
red-blue-team), and darwinist (battle-royale, elimination-tournament). Ephemeral
and immutable have no reference protocol yet — they appear in the community
list.

**Power inversions are declared, never inferred.** `legal.yml` gives the Jury
(OBSERVER) a domain veto over the final Division; `peer-review.yml` lets a
reviewer reject on methodology alone. Both contradict the trust hierarchy, which
is exactly why CANON models them as `domain_veto` rather than deriving them.

**One mapping conflict found in PROTOCOLS.md.** Red Team / Blue Team lists
OPERATOR and MEMBER twice each, once per side (Red Team Lead / Blue Team Lead).
A CANON role cannot map to two terms. Resolved by rendering both side-neutrally
("Team Lead", "Team Agent") and carrying the side in each actor's
`mandate_alignment` — mandate is an actor property, vocabulary is protocol-wide.

**Ship shortly after (community-ready protocols):**
```
[ ] Republic (US-style)
[ ] Open Source / RFC
[ ] DevOps / Incident Response
[ ] Film / TV Production
[ ] Clinical / Hospital
[ ] Emergency Response / ICS
[ ] MMO Raid / Guild
[ ] Startup
[ ] Hackathon
[ ] Adversarial Collaboration (scientific research)
[ ] Replication Crisis (scientific research)
[ ] Pre-registration / Open Science (scientific research)
[ ] Grand Challenge (scientific research)
```

**Community contribution protocols (documented, PRs welcome):**
```
Politics:     Socialism, Fascism, Monarchy
Sports:       Double Elimination, Round Robin, Swiss System,
              Draft/Fantasy, Olympic/Multi-Sport, Motorsport/F1,
              eSports Match
Military:     Intelligence/Espionage (ephemeral), Cybersecurity/Red Team
Legal:        Arbitration, Jury Deliberation (ephemeral record)
Healthcare:   Clinical Trial/Research
Business:     Investment/Trading, Auction House
Education:    Academic/University, Debate Competition
Creative:     Theatre, Music Recording, Game Development
Community:    Organized Crime (ephemeral), Religion (immutable),
              Neighbourhood/HOA, Pirate Crew
Novel:        Improv Theatre (ephemeral), Archaeological Dig,
              Antarctic Expedition
Game Theory:  Formal analytical structures (Zero-Sum, Cooperative,
              Prisoner's Dilemma, Stag Hunt, Auction/Mechanism Design,
              Iterated Game, Coalition Formation, Signalling Game)
              — embedded in protocol definitions post-research,
              not user-selectable protocols
```

**Protocol SDK:**
```
[x] Protocol schema format specification   — POLITIK-ARCHITECTURE.md + src/protocol.ts
[x] Protocol validator (lints against CANON) — src/protocol-sdk.ts, politik protocol lint
[x] Protocol template generator            — politik protocol new
[x] Community contribution guide           — protocols/CONTRIBUTING.md
```

**Loadable is not coherent.** `parseProtocol` answers "will this manifest
load?"; the linter answers "is it coherent?" A manifest with `mode: darwinist`
and `no_escalation: false` loads cleanly and then produces a session that accepts
appeals a Darwinist protocol has no mechanism to resolve. The linter separates
errors (unusable — a term CANON does not have, two roles sharing one label, an
ephemeral record mode that still claims to record) from warnings (likely
mistakes — non-semver version, unmapped role, flags inconsistent with the mode).

**Warnings are not silently suppressed.** `red-blue-team.yml` ships with one:
PROTOCOLS.md gives the Referee — who *is* AUTHORITY — a domain veto, which is
mechanically redundant since AUTHORITY already holds VETO. The manifest keeps it
to stay faithful to the published protocol, and a comment explains why the
warning is expected. The linter found this in the framework's own library.

**New CLI surface:**
```
politik protocol lint <manifest.yml>
politik protocol new <name> [--mode <mode>] [--out <dir>]
```

The generated skeleton maps every CANON role, primitive and verb to itself, so
the full translatable surface is visible in the file rather than discoverable
only from documentation.

### PHASE 6 — Platform Testing

`politik doctor` probes a host and reports whether a session can run there and
with which agents. The matrix below is what that probe has actually returned —
not a table of expectations. Unverified rows are marked as such and stay
unticked; a checkbox nobody exercised is worse than an empty one, because it
reads as evidence.

**Verified**

```
[x] Linux bare metal — OAuth        steve-cachyos, Node 26, 6 agents, ollama present
[x] Linux Docker — API key          node:22-alpine + git, full lifecycle + the whole test suite
[x] Ollama local — zero auth        detected and reported by doctor
```

Linux bare metal: `doctor` reports READY with six agents installed
(claude-code, gemini-cli, opencode, qwen-code, codex-cli, antigravity); five of
those were driven live in Phase 3.

Linux Docker: `doctor` → `scaffold` → `validate` → `init` → `status` →
`prorogue` all completed inside `node:22-alpine`, and the full test suite ran
green in the container. `doctor` correctly reported NOT READY (exit 1) in a
container *without* git, which is the check earning its keep.

**Unverified — no host available**

```
[ ] macOS bare metal — OAuth              Steves-Air; SSH access revoked
[ ] macOS Docker — OAuth + DISPLAY        same
[ ] Windows Pro bare metal — OAuth        no Node/agent install on the Windows test host
[ ] WSL2 + Docker — API key               STEVE-DESKTOP not reachable from this session
[ ] Windows Home bare metal — OAuth       no host
[ ] VPS headless — API key                none provisioned; cost acknowledged
[ ] Codespaces — API key                  not provisioned; cost acknowledged
```

Each closes out by running `politik doctor` on the host and recording the
output. No code change is expected — but Phase 3 found two spec errors that way,
so "expected" is not "verified".

**Two findings from containerised testing**

1. **Unhandled `EPIPE`.** `politik status | head` crashed with a stack trace
   when the reader closed the pipe early. Normal Unix pipeline behaviour, not an
   error — the binary now exits quietly, as every other CLI does. Found by
   piping output inside the container, not by any test.
2. **`doctor` requires git, not merely prefers it.** A container with Node but
   no git reports FAIL and exit 1. The repository *is* the session; without git
   there is no substrate, so this is correctly fatal rather than a warning.

**OAuth does not survive a headless container.** Agents whose local auth is
OAuth cannot complete a browser login without a display, so `doctor` warns when
it finds OAuth-default agents inside a container and points at API keys — the
documented headless path (RUNTIME.md § Cloud / Headless).

### PHASE 7 — SCM Provider SDK

**Cordfuse ships and maintains the GitHub reference implementation only.** The
three alternative providers are community contributions, as marked below and in
POLITIK-ARCHITECTURE.md § SCM PROVIDER ABSTRACTION (`gitlab ← community
contribution`). One provider maintained properly is worth more than four
maintained thinly.

```
[x] Document SCM provider interface   — docs/SCM-PROVIDERS.md
[x] Provider contribution guide       — docs/SCM-PROVIDERS.md § Contributing
[ ] GitLab provider (community)       — not a Cordfuse deliverable
[ ] Gitea provider (community)        — not a Cordfuse deliverable
[ ] Forgejo provider (community)      — not a Cordfuse deliverable
```

The Cordfuse scope of this phase is complete. The three unticked rows stay
unticked until someone contributes them; they are not outstanding work on this
side.

**A provider is transport and platform mapping only.** It never decides whether
a Motion carried, whether an actor may vote, or whether a session is suspended —
those are settled before a provider method is called. `merge()` enacts a Motion;
it does not check that the Motion carried, because that answer belongs in the
Hansard. A provider making governance decisions has moved logic out of the
record's reach, which defeats the framework.

**Eight contracts** are documented: async everywhere, typed handles rather than
bare strings, one commit per `commit()` call, unfavourable outcomes as results
rather than exceptions, no credentials in error messages, loud failure on
unimplementable methods, explicit role→permission mapping declared as a design
decision, and documented merge-strategy approximations.

**Injectable transport is a requirement, not a suggestion.** The reference
provider takes `fetch` as a constructor option, which is what lets its twenty
tests assert exact request shapes with no network and no token. A provider that
hard-codes its client cannot be tested without credentials, and those tests
never get run.

### PHASE 7.5 — Session Runner (the engine loop)

**Not in the original plan, and its absence was the plan's most serious gap.**

Phases 2–7 delivered components: Charter parser, validator, initializer, SCM
provider, envelope parser, election mutex, Hansard writer, quorum, escalation,
prorogation, agent registry, spawner, protocol layer, templates. Every one
tested. Not one of them *runs a session* — and nothing in `src/` called
`spawnAgent`, `composePrompt` or `standForElection` outside their own tests.

Politik was a complete set of parts with no engine.

```
[x] Session runner — src/runner.ts
[x] politik run    — CLI command
[x] First live session — two Motions tabled by real agents
```

The loop: **broadcast → elect → compose → spawn → capture → record → settle.**
Deliberately thin. Every decision it makes was already made somewhere pure and
testable; the runner sequences and does I/O. A governance question answered here
would be in the wrong place.

**First live session (`live-001`, Parliamentary, quorum 2).** A real git
session repo. Claude Code seated twice as OPERATOR — `minister-alpha` and
`minister-bravo` — each tabling a Motion:

- `motions/motion-001.md` — every Motion must state its Rollback Plan
- `motions/motion-002.md` — Points of Order must cite the Standing Order invoked

Both drafted in Parliamentary vocabulary, both committed by the agent itself,
both recorded as attributed `MOTION_TABLED` entries in an append-only Hansard.
The framework governed a session.

**The live run found a bug nothing else could have.** Turn 1 recorded
`Files touched: none` while the agent had in fact written *and committed* a
Motion. Change detection used `git status --porcelain`, which is clean precisely
*because* the agent committed — and the Standing Orders this framework ships
tell agents "commit your result; uncommitted work does not exist". The runner's
detection contradicted the framework's own instructions. Now diffs committed
work (`HEAD` before/after) as well as the working tree.

No unit test would have caught it: the assertion would have encoded the same
wrong assumption. It took running the thing.

**Refusals enforced:** unknown agent, not a session repo, session not CONVENED
(naming the suspension cause), and a constituency the Charter does not seat. The
runner reads `STATE.json` before acting like every other actor — a runner exempt
from the session's own governance would be the one participant above it.

---

---

## AUDIT CLOSED — 2026-07-25

A full source-vs-documentation audit was run and recorded in
[`docs/AUDIT.md`](docs/AUDIT.md). **Every code finding is now closed.**

The two that mattered — both real, both fixed:

1. **The SCM provider was dead code at runtime.** Eleven methods, 21 tests, a
   live verification — and nothing in `src/` ever called it, so `ASSENT`
   recorded a decision that changed nothing. Now wired: a Motion carried by
   Division and enacted by Assent **merged a real pull request** (`#1` on
   `politik-live-002`, merge commit `c6b48c91`).
2. **The transport was equally unwired.** `runTurn` synthesized its envelope, so
   no broadcast had ever been *received*. Now wired: `politik broadcast`
   publishes, `politik run --claim` polls and takes business it is eligible for.

Also fixed: the `RecordMode` split (`charter.ts` declared a vocabulary 8 of 10
shipped protocols could not express), the **unenforceable** AUTHORITY-is-human
rule (the schema had nowhere to declare a machine, so the framework's one hard
constitutional rule was a comment asserting a check that did not exist), a
meaningless `quorum.present`, and three unreachable suspension causes —
`DEADLOCK`, `SPEAKER_ORDER` and `DISPUTED_EXIT` are now all constructible.

One audit finding was **rejected**: rule 3 counting declared slots rather than
seated actors is correct, because Writ Drop runs before any actor is seated.

### Shipped since — 0.3.0 (2026-08-10)

Much has landed since that audit, and the phase plan above predates it:

- **Protocols behave, not just read** (ADR-0006, ADR-0007). `session.escalation` is
  enforced, and each protocol composes resolution / exit / termination mechanics —
  a Jury needs unanimity and seals on a verdict; an elimination protocol culls.
- **The MATCH primitive + tournaments** (ADR-0009). A 12th CANON primitive; `politik
  pair` / `match` / `standings` run Swiss / round-robin / single-elimination.
- **Federation — the GLOBAL layer built** (ADR-0008). `politik registry` and
  `politik cascade` as local traversal over a monorepo tree; `init --standalone`
  for the per-repo mode.
- **Constitutional depth wired.** DEADLOCK now auto-suspends and is broken by a
  casting vote (`division break`); the disputed-exit flow (`actor dispute` /
  `reinstate`), the DELEGATE challenge (`politik challenge`), and bad-faith
  detection (`politik integrity`) all ship.
- **Published.** `@cordfuse/politik@0.3.0` is live on npm.

The full source-vs-docs reconciliation is in [`docs/AUDIT.md`](docs/AUDIT.md).

**Provider is optional, not mandatory.** The spec pulls both ways — "Run local,
run free" against "the motion system (Pull Requests)". Resolved as: git is the
mandatory substrate, the platform is an optional projection over it.

Phase 8 is not meaningfully started — the npm package is published (`@cordfuse/politik@0.3.0`, with a tag-to-npm release workflow), but the rest of the launch surface (README hero, Docker/Homebrew distribution, the announcement, the arXiv preprint) is not.

---

### PHASE 8 — Public Launch
```
[ ] All namespaces secured
[ ] README hero section with tagline
[ ] Architecture documentation complete
[ ] At least 2 protocols shipped
[ ] At least 5 agents tested
[ ] GitHub template repo configured
[ ] Docker images published
[x] npm package published                         — @cordfuse/politik@0.3.0 live (2026-08-10); tag-to-npm via release.yml
[ ] Homebrew tap (macOS/Linux)
[ ] Announcement — TBD channel
```

### PHASE 8.5 — Obsidian Visualisation Layer (post-v1, pre-academic)

**Target:** After v1.0.0 stable, before the enterprise research phase.

**What it is:** An optional visual layer on top of the Politik tree. Each node in the 1:N hierarchy is represented as a markdown file in an Obsidian vault. Obsidian's native graph view renders the tree visually — nodes, parent-child relationships, sibling clusters, STATE.json status as frontmatter tags.

**Why it matters:** A Speaker managing a complex Politik tree with dozens of sessions across multiple micro layers needs a map. Obsidian is that map. GitHub is the territory. With the MCP bridge, Claude Code has both open simultaneously.

**The toolchain:**
```
Obsidian vault         ← visual representation of the Politik tree
                          one markdown file per node
                          frontmatter: level, state, parent, cost_to_date

obsidian-mcp plugin    ← MCP server exposing vault to Claude Code
                          semantic search across the tree
                          read/write vault files via MCP protocol

GitHub MCP             ← the actual Hansard, LEDGER, STATE.json data
                          live session data from the repos

Claude Code (Speaker)  ← both MCPs connected simultaneously
                          "show all FAULT_ACTOR sessions under saas-backend
                           in the last 30 days" → reads Obsidian graph +
                           GitHub Hansard data to answer
```

**The sync script:** A Politik CLI command (`politik sync-vault`) reads all repos in the tree and regenerates the Obsidian vault markdown. Not real-time — on-demand or scheduled. Adds frontmatter tags for STATE.json status so Obsidian's graph view can colour-code by state: green (`CONVENED`), amber (`SUSPENDED`), grey (`PROROGUED`), red (`SUSPENDED` with `suspension.cause: CONSTITUTIONAL_CRISIS`). Constitutional crisis is a cause of suspension, not a state of its own — see ADR-0003.

**Existing MCP options (all open source, as of 2025):**
- `obsidian-mcp-tools` — Claude Desktop integration, semantic search, template execution
- `obsidian-claude-code-mcp` — Claude Code + Claude Desktop simultaneous connection via WebSocket and HTTP/SSE
- `mcp-obsidian` — simple REST API bridge, works with any MCP client

**Not a v1 requirement.** The tree works without visualisation. Sessions run. Hansards commit. LEDGER tracks cost. The Obsidian layer is a Speaker tooling convenience — valuable once the tree has enough nodes to benefit from a visual map.

**Versioning target:** v1.x.x — ships as an optional community integration after v1.0.0 stable.

### PHASE 9 — Academic Collaboration

**Finding collaborators:**
```
[ ] Identify SE researcher candidates
    → Google Scholar: "empirical software engineering" "AI agents"
    → arXiv cs.SE recent papers on agent collaboration
    → Target: university CS departments with empirical SE focus

[ ] Identify game theory researcher candidates
    → Google Scholar: "mechanism design" "multi-agent"
    → arXiv cs.GT recent papers
    → EC conference author lists
```

**Collaboration structure:**
```
[ ] Align on authorship order before writing begins
[ ] Agree on IP ownership — framework stays Cordfuse
[ ] Agree on paper scope — one unified paper, framework + experiment inseparable
[ ] Agree on venue targets: arXiv cs.MA + cs.SE, then ICSE or EC
[ ] Establish working cadence
```

### PHASE 10 — Research & Publication

**One Unified Paper — Framework + Experiment + Game Theory:**
```
[ ] Draft abstract and introduction
[ ] CANON primitive layer formal description
[ ] Protocol taxonomy formal description
[ ] Git substrate design rationale
[ ] Game theory formal models per protocol (game theorist leads)
[ ] Nash Equilibrium predictions documented before experiments run
[ ] Identical engineering problems selected as test cases
[ ] Politik sessions run under each protocol
[ ] Results measured:
    - Code quality (defect rate, test coverage, complexity)
    - Speed (time to completion)
    - Collaboration patterns (escalation rate, Division rate, deadlock rate)
    - LEDGER cost-per-outcome across protocols
    - Nash Eq convergence — did agents behave as predicted?
[ ] Statistical analysis (SE researcher leads)
[ ] Discussion: which protocols suit which problem types
[ ] Agile comparison — is it optimal or just default?
[ ] Submit to arXiv cs.MA + cs.SE simultaneously (SE researcher provides endorsement)
[ ] arXiv DOI recorded — update Zenodo entry to cross-reference
[ ] Target venue submission: ICSE or EC (Economics and Computation)
```

---

---

---

## THE POLITIK TREE — HIERARCHICAL INHERITANCE AND CASCADE THEORY

### The 1:N Node Architecture

Every node in Politik is a Proceeding. A leaf node — one with no children — is a session. A node with children is a parent. The tree has no fixed depth — as shallow as Universe → Session or as deep as Organisation → Division → Department → Team → Sub-team → Sprint → Ticket → Sub-ticket → Task. There is no architectural limit.

```
Any node can be:
  - A leaf (session — no children, does the work)
  - A parent (contains child nodes, governs them)
  - Both simultaneously (works AND governs children)

Actors can be declared at ANY node level.
Actors can be promoted or demoted across ANY node boundary.
Settings inherit downward. Restrictions compound. Nothing overrides upward.
```

A real example from a software organisation:

```
org/politik-root                          ← constitutional layer
└── org/politik-cordfuse                  ← company global
    └── org/politik-bc-development        ← domain team
        └── org/politik-sprint-2026-04    ← monthly sprint
            └── org/politik-PROJ-112      ← jira ticket (leaf — does the work)
                └── org/politik-PROJ-112a ← sub-ticket (if scope expands)
```

Every node has a Charter (inheriting from parent), a Hansard (scoped to its level), a STATE.json, and a LEDGER. The moment a leaf gains a child it becomes a parent — no special migration, no architectural change, just a new node with `inherits_from` pointing at its parent.

> **Storage model (ADR-0008, shipped).** The example above draws each node as its own repository, but that is now the *opt-in* mode. The **default is a monorepo tree**: nodes are nested directories in one repository, `inherits_from` is a relative path to the parent directory, and the whole hierarchy shares one clone, one CI, one history. A node opts out into its own repository with `politik init --standalone` when it needs per-session pull requests or a hard permission boundary. And the GLOBAL / federation layer below is **built, not roadmap** — `politik registry` is the "session open/close registry" and state-of-everything roll-up; `politik cascade` records the `CASCADE_ALERT`. Federation is local traversal over the one tree (`src/federation.ts`), not cross-repo orchestration.

### Actors Are Mobile Across the Tree

An actor declared at the team MICRO level is available to any session under that MICRO. An actor can be:

- **Promoted upward** — a high-performing session-level MEMBER promoted to OPERATOR at the Sprint level, available across all sprint tickets
- **Demoted downward** — an actor scoped to a specific sub-ticket because their hard skills are only relevant there
- **Transferred laterally** — an actor moved from one branch of the tree to another by AUTHORITY at the appropriate parent node

All mobility is Hansard-attributed at the node level where the decision was made.

### Every Node Has a Scoped Hansard

```
ROOT Hansard      ← constitutional events: CASCADE_ALERT, QUARANTINE, 
                     RESTRUCTURE, PROMOTE_SCOPE, DEMOTE_SCOPE
                     
GLOBAL Hansard    ← org-wide: actor profile changes, constraint modifications,
                     sprint gates, session open/close registry

MICRO Hansard     ← team-level: sub-team decisions, actor assignments,
                     local fault patterns, performance summaries

LEAF Hansard      ← full session record: every motion, division, escalation,
                     fault, cost entry (the Hansard already fully designed)
```

The chain of Hansards from leaf to root is the complete forensic record of how any decision was made, propagated, or failed at every level of the organisation.

### Cascade Failure and Recovery — Within the Human/Organisational Domain

The tree structure makes cascade failure visible and containable in a way no previous governance framework has achieved. When a leaf node hits CONSTITUTIONAL_CRISIS, the failure propagates upward through the Hansard chain. Each parent node records its piece of the cascade. The root either quarantines the branch or restructures it.

**Organisational examples where this pattern is directly applicable:**

**2008 financial crisis** — Bear Stearns was a leaf node that hit FAULT_CRITICAL. The cascade propagated to Lehman Brothers (sibling leaf), then to the US financial system (parent GLOBAL), then to global capital markets (ROOT). No CASCADE_ALERT mechanism existed. No QUARANTINE was issued in time. RESTRUCTURE (TARP) cost $700 billion. A Politik tree with CASCADE_ALERT would have flagged the pattern when Bear Stearns first showed fault signals.

**Enron 2001** — GLOBAL CONSTITUTIONAL_CRISIS through deliberate AUTHORITY fraud. QUARANTINE (SEC freeze). RESTRUCTURE (bankruptcy). The physical audit records — the closest human analog to a Hansard — were destroyed by Arthur Andersen. Criminal charges followed. The Hansard, being append-only and cryptographically linked, cannot be destroyed.

**The 2003 Northeast blackout** — a SESSION-level alarm failure in an Ohio utility cascaded to 55 million people in 8 seconds because the tree had no CASCADE_ALERT and no QUARANTINE mechanism. Circuit breakers (the human equivalent of QUARANTINE) triggered too slowly.

**Agile methodology adoption** — a MICRO-level protocol developed by small software teams was PROMOTE_SCOPE'd to a universal knowledge-work practice without Hansard evidence to justify it at that scale. The performance data that would have bounded the appropriate scope did not exist. Politik produces exactly that data.

**Healthy organisational cascade (upward propagation):** Double-blind peer review was invented in one small corner of physics in the 1930s. It produced demonstrably better outcomes (the Hansard showed it). It was PROMOTE_SCOPE'd to the scientific GLOBAL and eventually to all academic domains. This is how proven protocols should propagate — up the tree, backed by evidence.

### CASCADE_ALERT and Pattern Detection

When a failure pattern appears in multiple sibling nodes — same archetype configuration, same protocol, same fault signature — the parent node issues CASCADE_ALERT. This is the equivalent of an epidemiological R₀ calculation: if one failure is producing more than one downstream failure across siblings, the pattern is self-sustaining and requires intervention before it reaches the parent level.

```yaml
cascade_alert:
  trigger: same_fault_signature_in_siblings >= 2
  window_days: 30
  action: warn_at_writ_drop
  notify: AUTHORITY
```

Future sessions chartering the flagged configuration receive a Writ Drop warning. The Speaker can proceed — but the risk is documented and attributed. Over time, the ROOT Hansard becomes a pattern library of governance failures and their signatures, available to every node in the tree.

### Broader Implications — An Invitation to Other Researchers

The hierarchical cascade inheritance model formalised in this work — configurable constraint propagation, attributed Hansard recording at every node level, and pattern detection across sibling nodes — shares structural properties with a broad class of complex adaptive systems studied across disciplines. The authors note these structural parallels without claiming them as contributions of this work, and invite researchers in adjacent fields to evaluate whether the formal model has utility beyond the software engineering and organisational governance domain for which it was designed:

**Epidemiology** — cascade propagation from index case through community clusters to regional outbreaks maps directly to the SESSION → MICRO → GLOBAL → ROOT cascade model. The CASCADE_ALERT threshold is mathematically analogous to R₀. QUARANTINE is the public health intervention. The Hansard is the contact tracing record.

**Organisational science and management theory** — the actor capability profile system (personality archetype, soft skills, hard skills, model grade, performance history) with Hansard feedback loops represents a formal model of team composition and organisational learning that could be empirically evaluated against existing theories of team performance and institutional memory.

**Network science and complex systems** — the failure propagation model through inheritance hierarchies with configurable quarantine thresholds may be of interest to researchers studying cascades in interconnected networks, including power grids, financial systems, and supply chains.

**Political science and institutional theory** — the Constitutional Capture failure mode, the virtue/vice actor model, and the PROMOTE/DEMOTE/HIRE/FIRE doctrine with full Hansard attribution represent a formal computational model of institutional corruption and recovery that may be of interest to researchers in democratic theory and comparative politics.

The authors make no claims about these domains. The formal model is presented for the software engineering and multi-agent AI research community. The structural parallels are noted as invitations, not contributions.


---

