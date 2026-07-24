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
[x] Document all decisions in ADRs                — 0001, 0002, 0003 Accepted
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

**Backlog — three agents unverified.** Their registry entries follow the
documented invocation and are shipped, but none has been exercised live. Each
is a host-setup task, not a framework defect:

| Agent | Blocker | To verify |
|---|---|---|
| Qwen Code | `No auth type is selected` | configure an auth type, then re-run the live check |
| Aider | not installed on this host | install, then re-run |
| Goose | not installed on this host | install, then re-run |

Phase 3 is otherwise complete. These three close out by re-running the same live
check once their host prerequisites are met — no code change is expected, but
the codex and gemini findings below are exactly why "expected" is not "verified".

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
[ ] Implement CANON → Parliamentary vocabulary mapping
[ ] CHARTER.md template (Parliamentary)
[ ] Role templates (Speaker, Minister, Backbencher, Observer)
[ ] Standing Orders template
[ ] Hansard format spec
[ ] GitHub label taxonomy
[ ] GitHub Milestone workflow
[ ] GitHub Projects Order Paper template
```

### PHASE 5 — Protocol Library

**Framing note:** Parliamentary is protocol #1, not a privileged mode.
All protocols are equal. The framework is protocol-agnostic.

**Shipped with framework (reference protocols):**
```
[ ] Parliamentary Democracy (reference protocol — ships first)
[ ] Agile / Scrum
[ ] Military Operation
[ ] Criminal Trial / Legal
[ ] Corporate / Board
[ ] Battle Royale
[ ] League Season (sports)
[ ] Elimination Tournament — Single
[ ] Peer Review (scientific research)
[ ] Red Team / Blue Team Science
```

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
[ ] Protocol schema format specification
[ ] Protocol validator (lints against CANON primitives)
[ ] Protocol template generator
[ ] Community contribution guide
```

### PHASE 6 — Platform Testing
```
[ ] macOS bare metal — Claude Code OAuth
[ ] macOS Docker — OAuth + DISPLAY
[ ] Linux bare metal — Claude Code OAuth
[ ] Linux Docker — OAuth + DISPLAY
[ ] Windows Pro bare metal — OAuth
[ ] WSL2 + Docker — API key
[ ] Windows Home bare metal — OAuth, risk acknowledged
[ ] VPS headless — API key, cost acknowledged
[ ] Codespaces — API key, cost acknowledged
[ ] Ollama local — zero cost, zero auth
```

### PHASE 7 — SCM Provider SDK
```
[ ] Document SCM provider interface
[ ] GitLab provider (community)
[ ] Gitea provider (community)
[ ] Forgejo provider (community)
[ ] Provider contribution guide
```

### PHASE 8 — Public Launch
```
[ ] All namespaces secured
[ ] README hero section with tagline
[ ] Architecture documentation complete
[ ] At least 2 protocols shipped
[ ] At least 5 agents tested
[ ] GitHub template repo configured
[ ] Docker images published
[ ] npm package published
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

Every node has a Charter (inheriting from parent), a Hansard (scoped to its level), a STATE.json, and a LEDGER. The moment a leaf gains a child it becomes a parent — no special migration, no architectural change, just a new repo with `inherits_from` pointing at it.

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

