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
```
[ ] Finalize CANON primitive layer names
[ ] Finalize protocol schema format
[ ] Finalize CHARTER.md spec
[ ] Finalize broadcast envelope format
[ ] Finalize session repo structure
[ ] Finalize SCM provider interface spec
[ ] Choose transport (libp2p vs NATS)
[ ] Document all decisions in ADRs (Architecture Decision Records)
[ ] Draft arXiv preprint — unified paper (framework + experiment)
```

### PHASE 2 — Reference Implementation (GitHub SCM)
```
[ ] Scaffold cordfuse/politik private repo
[ ] Implement CHARTER.md parser and validator
[ ] Implement session repo initializer (Writ Drop)
[ ] Implement GitHub SCM provider
[ ] Implement broadcast envelope parser
[ ] Implement first-actor-per-constituency election
[ ] Implement Hansard commit writer
[ ] Implement Point of Order workflow
[ ] Implement Speaker email notification
[ ] Implement quorum check
[ ] Implement prorogation workflow
```

### PHASE 3 — Agent Compatibility Layer
```
[ ] Claude Code integration and test
[ ] Gemini CLI integration and test
[ ] OpenCode integration and test
[ ] Qwen Code integration and test
[ ] Codex CLI integration and test
[ ] Aider integration and test
[ ] Goose integration and test
[ ] Document prompt injection format per agent
[ ] Document headless invocation per agent
```

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

### PHASE 7 — AgentBox Integration
```
[ ] Define Speaker console interface
[ ] Writ Drop from AgentBox
[ ] Point of Order routing to AgentBox
[ ] Hansard review on prorogation
[ ] Document AgentBox vs Politik boundary explicitly
```

### PHASE 8 — SCM Provider SDK
```
[ ] Document SCM provider interface
[ ] GitLab provider (community)
[ ] Gitea provider (community)
[ ] Forgejo provider (community)
[ ] Provider contribution guide
```

### PHASE 9 — Public Launch
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

### PHASE 9.5 — Obsidian Visualisation Layer (post-v1, pre-academic)

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

**The sync script:** A Politik CLI command (`politik sync-vault`) reads all repos in the tree and regenerates the Obsidian vault markdown. Not real-time — on-demand or scheduled. Adds frontmatter tags for STATE.json status so Obsidian's graph view can colour-code by state: green (convened), amber (suspended), grey (prorogued), red (constitutional crisis).

**Existing MCP options (all open source, as of 2025):**
- `obsidian-mcp-tools` — Claude Desktop integration, semantic search, template execution
- `obsidian-claude-code-mcp` — Claude Code + Claude Desktop simultaneous connection via WebSocket and HTTP/SSE
- `mcp-obsidian` — simple REST API bridge, works with any MCP client

**Not a v1 requirement.** The tree works without visualisation. Sessions run. Hansards commit. LEDGER tracks cost. The Obsidian layer is a Speaker tooling convenience — valuable once the tree has enough nodes to benefit from a visual map.

**Versioning target:** v1.x.x — ships as an optional community integration after v1.0.0 stable.

### PHASE 10 — Academic Collaboration

**Finding collaborators:**
```
[ ] Reach out to former comp sci professor (warm)
    → Wait 2 weeks for response
    → If no response → cold outreach

[ ] Identify SE researcher candidates
    → Google Scholar: "empirical software engineering" "AI agents"
    → arXiv cs.SE recent papers on agent collaboration
    → UWaterloo / UofT / McMaster (proximity advantage)
    → Target 10-15 outreach emails, expect 1-2 conversations

[ ] Identify game theory researcher candidates
    → Google Scholar: "mechanism design" "multi-agent"
    → arXiv cs.GT recent papers
    → EC conference author lists
    → Target 5-10 outreach emails
```

**Collaboration structure:**
```
[ ] Align on authorship order before writing begins
[ ] Agree on IP ownership — framework stays Cordfuse
[ ] Agree on paper scope — one unified paper, framework + experiment inseparable
[ ] Agree on venue targets: arXiv cs.MA + cs.SE, then ICSE or EC
[ ] Establish working cadence
```

### PHASE 11 — Research & Publication

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

