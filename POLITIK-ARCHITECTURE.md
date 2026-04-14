# POLITIK
### A Governed Multi-Agent Framework Built on Git

**Framework name: Politik**
**Repo:** `cordfuse/politik`
**Attribution:** Steve Krisjanovs, Cordfuse

**Note:** "Parliament" appears throughout as the default protocol vocabulary — not the framework name. The framework is Politik.

---

> **Run local, run free.**  
> **Run OAuth, run far.**  
> **Run API keys, run carefully.**

---

## STATUS
- **Visibility:** Private (pre-publication)
- **Stage:** Architecture — pre-scaffold

---

## PRIORITY 0 — NAMING (Before any scaffolding)

Nothing gets committed to a public repo, npm, Docker Hub, or Homebrew until these are locked.

```
[x] Name the framework — POLITIK
[x] Name the canonical primitive layer — CANON
[x] Name the session unit — SESSION / PROCEEDING
[x] Name the governance protocol system — PROTOCOL
[x] Name the SCM provider abstraction — SCM Provider Interface
[x] Verify npm namespace — @cordfuse/politik
[x] Verify GitHub org/repo name — cordfuse/politik
[x] Verify Docker Hub namespace — cordfuse/politik
[ ] Register all namespaces privately (before first public release)
[ ] Domain check (optional but smart)
```
**Status:** Framework name locked. CANON locked. All namespaces verified. Register before public release.

**Constraints:**
- Cannot contain "GitHub", "git", or any provider trademark
- Cannot contain "Claude", "Gemini", "OpenAI", or any AI provider trademark
- Should reflect governance model, not persistence layer
- Must be available across npm, Docker Hub, GitHub org

---

## THE IDEA

Politik is a **governed multi-agent operating system** where:

- A **human** is the constitutional authority — present but not operational
- **Agents** are CLI processes that spawn, do work, and dispose
- A **SCM repository** (GitHub or any SCM) IS the session — charter, record, state, and invite in one
- A **peer-to-peer mesh** is the chamber floor
- **Pluggable governance protocols** map the framework to any industry vocabulary
- **No new infrastructure required** — GitHub already built it

Nobody connected these pieces this way before.

---

## THE TAGLINE

```
Run local, run free.
Run OAuth, run far.
Run API keys, run carefully.
```

---

## CORE CONCEPTS

### The Session Repo
The SCM repository IS the Politik session. It is:
- The charter (protocol Standing Orders)
- The record (Hansard)
- The invite (repo access = taking a Seat)
- The audit trail (git history)
- The notification system (GitHub Actions)
- The debate floor (Discussions)
- The motion system (Pull Requests)
- The escalation system (Issues)

### The Agent Model
Agents are **stateless workers**:
```
Broadcast received
    ↓
Agent spawned
    ↓
Prompt executed
    ↓
Result committed to Hansard
    ↓
Agent disposed
```

No persistent process. No long-lived sessions. State lives in git, not in the agent.

### The Human Role
The Speaker (human) is **constitutionally present, not operationally present**:
- Drops the Writ (creates session repo)
- Defines Standing Orders (CHARTER.md)
- Receives Points of Order (SCM Issues + email)
- Rules on escalations (commits ruling to repo)
- Prorogues the session (closes Milestone)

The Speaker does not babysit the session. The session governs itself.

---

## CANONICAL PRIMITIVE LAYER (CANON)

The engine speaks these terms. Protocols translate them to industry vocabulary.

### Roles
| Canonical | Description |
|---|---|
| `AUTHORITY` | Speaker — constitutional ruler. **Always human. Cannot be a machine agent under any Charter configuration.** |
| `DELEGATE` | Deputy Speaker — pre-delegated proxy for AUTHORITY. Human or machine. |
| `OPERATOR` | Elevated trust, broad portfolio. Human or machine. |
| `MEMBER` | Standard trust, scoped verbs. Human or machine. |
| `OBSERVER` | Read-only, no floor rights. Human or machine. |

**Roles describe trust level and mandate — not whether the actor is human or AI.**

Any role except AUTHORITY can be assigned to a human or a machine agent. A human expert can join as OPERATOR alongside machine agents. A machine can be promoted through performance. The governance layer is species-agnostic by design.

**The one hard constitutional rule:** AUTHORITY is always human. The Speaker cannot be a machine. A Charter that declares a machine as AUTHORITY is invalid and the session will fail Writ Drop validation. This is the architectural safeguard that keeps human governance in the loop regardless of session autonomy level.

This design enables the Human Flaw research thesis: the same protocol can be run with human actors and machine actors on identical problems. If OPERATOR meant "machine" by definition, that comparison would be impossible.

### Session Primitives
| Canonical | Description |
|---|---|
| `SESSION` | A Proceeding with no children — the leaf node of the Politik tree. Every node is a Proceeding. SESSION is shorthand for a leaf. |
| `PROCEEDING` | The full lifecycle of a Politik workflow — from Writ Drop to Prorogation. A proceeding contains one or more sittings separated by suspensions. |
| `CHARTER` | Standing Orders — sovereign law of the session |
| `RECORD` | Hansard — append-only attributed log |
| `MOTION` | Tabled business — a PR |
| `DIVISION` | Vote — PR review |
| `ESCALATION` | Point of Order — an Issue |
| `SUSPENSION` | Session pause — proceeding open, agents stopped, resumable |
| `QUORUM` | Minimum actors for valid session |
| `DEADLOCK` | Irreconcilable state — no valid Division outcome |

### Session States
These are the valid states a proceeding can be in at any point:

| State | Code | Meaning |
|---|---|---|
| Convened | `STATE_CONVENED` | Proceeding is actively running — agents are live, motions are being processed |
| Suspended | `STATE_SUSPENDED` | Proceeding is paused — agents stopped, Hansard open, resumable via `politik resume` |
| Prorogued | `STATE_PROROGUED` | Proceeding is permanently closed — Hansard sealed, repo archived |
| Stale | `STATE_STALE` | No Hansard commit in `heartbeat_timeout_hours` — auto-suspension triggered |
| Invalid | `STATE_INVALID` | Session failed Writ Drop validation — never opened |

**Developer plain English:**
- Convened = running
- Suspended = paused
- Prorogued = done, closed permanently
- Stale = went quiet, auto-paused

**Note on vocabulary:** All CANON terms are chosen to be immediately readable by a developer with no political science background. "Prorogued" is the one term that requires a one-line definition on first use — it means permanently closed. All others are self-evident.

### Verbs
| Canonical | Description |
|---|---|
| `READ` | View files, read Hansard |
| `WRITE` | Commit, table motion |
| `VOTE` | Division, approve/reject |
| `ESCALATE` | File Point of Order |
| `PROMOTE` | Elevate actor trust level |
| `DEMOTE` | Reduce actor trust level |
| `HIRE` | Bring a new actor into a convened proceeding |
| `FIRE` | Remove an actor — attributed, with stated reason committed to Hansard |
| `SUSPEND` | Pause proceeding — agents stop, STATE → suspended |
| `EXPEL` | Remove actor for Standing Orders violation — distinct from FIRE |
| `VETO` | Domain veto — specific override |
| `SPAWN` | Call sub-session / committee |
| `DISSOLVE` | Close proceeding permanently — STATE → prorogued |
| `EXIT` | Actor leaves the session — voluntary or forced, classified by exit type |

### Power Inversions (first-class primitives)
Some lower-trust actors hold domain-specific veto power:
- Safety Officer overrides IC on safety grounds
- Patient holds treatment veto in healthcare
- Jury holds final Division in legal protocol
These are `DOMAIN_VETO` primitives — declared in Charter, not inferred.

---

### Actor Capability Profile — Five Dimensions

Every actor in a Politik session carries a capability profile declared at Writ Drop. This profile determines not just what the actor is *allowed* to do (role tier) but what it is *suited* to do. Capability profiles apply to human and machine actors equally — they are species-agnostic.

This is the formal model of organisational intelligence: the same variables that determine whether a human team succeeds or fails, now Charter-configurable, Hansard-measurable, and empirically testable for the first time.

**Dimension 1 — Role Tier**

Trust level, verb access, floor rights. Covered in the Roles section. AUTHORITY → DELEGATE → OPERATOR → MEMBER → OBSERVER.

**Dimension 2 — Personality Archetype**

How the actor collaborates under pressure and in deliberation:

| Archetype | Behaviour | Machine default | Human vice risk |
|---|---|---|---|
| `HARDLINER` | Principled, rigid, low compromise | Holds standard without pride | Pride prevents accepting correct challenge |
| `DIPLOMAT` | Consensus-builder, high compromise | Seeks agreement without cowardice | Cowardice produces bad consensus |
| `ANALYST` | Data-driven, slow to commit, high accuracy | Thorough without sloth | Sloth produces paralysis |
| `CREATIVE` | Novel solutions, lateral thinking, unconventional | Innovative without ego | Hubris dismisses simpler correct answers |
| `LONE_WOLF` | Independent, low deference, self-directed | Executes mandate without tribalism | Tribalism produces factionalism |
| `TEAM_PLAYER` | Deferential, consensus-seeking, collaborative | Cooperative without conformity | Conformity produces groupthink |
| `JOKESTER` | Lateral, disruptive, creative under pressure | Introduces novelty without chaos | Sloth deflects serious escalations |

Machine actors can be assigned any personality archetype. They carry the profile without the corresponding vice. A machine DIPLOMAT seeks consensus without the cowardice that makes human diplomats capitulate. A machine HARDLINER holds the standard without the pride that makes human hardliners wrong and certain of it.

**Dimension 3 — Soft Skills**

How the actor reasons, communicates, and operates within the session:

| Skill | Description | Measurable in Hansard |
|---|---|---|
| `COMMUNICATION` | Clarity and precision of motion reasoning | Escalation rate, Division acceptance rate |
| `CREATIVITY` | Propensity for novel solutions vs established patterns | Motion novelty score (post-session analysis) |
| `ANALYTICAL_THINKING` | Depth of reasoning before committing | Time per motion, revision rate |
| `PERSUASION` | Ability to move Divisions through argument quality | Division win rate vs output quality |
| `TECHNICAL_ACUMEN` | Strength in implementation and specification | Fault rate on technical motions |
| `FUNCTIONAL_ACUMEN` | Domain knowledge depth and application | Fault rate on domain-specific motions |
| `ADAPTABILITY` | Responsiveness to new information mid-session | Revision rate after escalation |

**Dimension 4 — Hard Skills**

Domain-specific competencies. The actor must be qualified for the work the session requires. Two fields: `required` (must have) and `excluded` (must not default to).

```yaml
constituency:
  role: OPERATOR
  hard_skills:
    required:
      - BC_AL_development
      - dynamics365
      - AL_Go_pipelines
    excluded:
      - angular_frontend     # wrong domain — will produce confident wrong output
      - raw_SQL              # out of scope for this session

  # The excluded field is as important as required.
  # A developer assigned to a PM constituency must be excluded
  # from implementation-first thinking or they will scope by
  # technical complexity rather than business value.
```

**Hard skill violation handling:**

If an actor's Hansard performance reveals a skill mismatch not caught at Writ Drop — producing output in an excluded domain, failing repeatedly on required domain work — the engine flags `FAULT_ACTOR` with subtype `SKILL_MISMATCH`. This triggers:
- Demotion if Charter allows auto-demotion
- Escalation to Speaker if `auto_demotion: false`
- Permanent record in Hansard for future session planning

**Dimension 5 — Model / Knowledge Grade**

The underlying intelligence — independent of the seat. The "smartness" of the actor regardless of role tier.

```yaml
constituency:
  role: OPERATOR
  model:
    required: claude-sonnet-4-6          # minimum model version
    preferred: claude-opus-4-6           # optimal for this work type
    domain_specialisation: BC_AL         # fine-tuned variant if available
    knowledge_cutoff_minimum: 2025-01    # must know post-2025 BC releases
```

Model pinning is per-constituency because different seats have different cognitive demands even within the same session. An OPERATOR doing complex architecture reasoning may require a more capable model than a MEMBER doing routine documentation. The engine validates model compliance at Writ Drop and refuses to spawn a mismatched model regardless of operator assignment.

**The empirical research implication:** If session outcomes vary measurably by capability profile composition — and the Hansard and LEDGER provide the data to test this — the result is a complete empirical model of organisational intelligence. Questions now answerable for the first time:

- Does complementary personality composition outperform homogeneous composition?
- Does model pinning to domain-specialist fine-tunes reduce fault rate?
- What is the optimal personality mix for Parliamentary vs Battle Royale protocols?
- Can Hansard performance history predict future actor quality better than declared profiles?
- Does a CREATIVE OPERATOR in an ANALYST-heavy session improve output or introduce noise?

Every question is publishable. Every question requires Politik as the instrument.

### Capability Profile and the Vice/Virtue Table — The Interaction

Personality archetypes amplified by human vices produce predictable and catastrophic failure modes:

| Archetype | Vice | Failure mode | Machine actor behaviour |
|---|---|---|---|
| HARDLINER + Pride | Refuses correct challenge | Protocol ossifies | Holds standard, accepts correct challenge |
| DIPLOMAT + Cowardice | Avoids necessary conflict | Bad decisions pass unchallenged | Seeks consensus, escalates unresolvable conflict |
| ANALYST + Sloth | Over-analyses, never commits | Session stalls | Commits on schedule, no fatigue |
| CREATIVE + Hubris | Dismisses simpler correct answers | Complexity for its own sake | Proposes novel solutions, accepts simpler alternatives |
| LONE_WOLF + Tribalism | Forms personal faction | Session fractures | Executes mandate, no personal allegiance |
| TEAM_PLAYER + Conformity | Never challenges bad consensus | Groupthink | Cooperates, files escalation on genuine disagreement |
| JOKESTER + Sloth | Deflects serious escalations | Critical issues missed | Introduces novelty, processes all escalations |

The Human Flaw thesis is now complete: it is not just that humans carry vices. It is that personality archetypes — which are genuine human strengths in the right context — become catastrophic failure modes when combined with the wrong vice. The personality is the vector. The vice is the corruption. Machine actors carry the archetype without the vice.

### Human Traits — Three Tiers of Treatment

Beyond vices, virtues, and capability profiles, human actors carry additional traits that influence governance outcomes. Politik treats these in three tiers: configurable variables, research questions, and structural eliminations.

---

#### Tier 1 — Configurable Charter Parameters (measurable, include now)

**ACTOR_STATE — Emotional and Cognitive State**

Humans don't perform consistently. Fear, frustration, excitement, ego bruising from a lost Division — all degrade output quality. A human actor on a bad day produces worse work than the same person in peak state. Machine actors have no emotional state. Their output is consistent across any session length.

```yaml
actor:
  state:
    declared: stable          # stable | stressed | degraded
    auto_detect: true         # infer from fault rate patterns
    degradation_threshold:    # consecutive faults before state downgrades
      faults_in_motions: 3
      window: 5
```

`ACTOR_STATE` is committed to the Hansard. If an actor's fault rate spikes mid-session, the engine flags `STATE_DEGRADED` — triggering a Speaker notification before a bad Division outcome compounds. For machine actors, `STATE_DEGRADED` may indicate context window saturation or model instability. Both are measurable and both are resolvable.

**SESSION_ENDURANCE — Fatigue and Cognitive Load**

Human cognitive performance degrades over long sessions. Hour 8 of a sprint is measurably worse than hour 1. Machine actors don't fatigue in the human sense — but very long context windows may degrade LLM output quality as the context saturates. This is an open and publishable research question.

```yaml
session:
  endurance:
    max_session_hours: 8          # after which quality checks are mandatory
    checkpoint_quality_gate: true # STATE_SNAPSHOT + quality review at N hours
    human_rest_mandate: true      # human actors must declare breaks
```

**MANDATE_ALIGNMENT — Motivation and Incentive**

Humans perform differently based on what they are getting out of it. A salaried employee, an equity holder, and someone who hates their job produce different quality outputs under identical protocols. Misaligned mandates are a Constitutional Capture risk — an actor whose personal incentive conflicts with the session goal will subtly optimise for their interest, not the session's.

```yaml
actor:
  mandate_alignment:
    declared_interest: neutral    # neutral | aligned | potentially_conflicted
    conflict_declaration: true    # actor must declare conflicts at Writ Drop
    speaker_review_on_conflict: true
```

Machine actors have one interest: execute the mandate. No personal incentive, no misalignment possible unless the prompt itself encodes conflicting objectives — which is a Charter authoring problem, not an actor problem.

---

#### Tier 2 — Research Questions (document, study in experiments)

These are not Charter configuration items — they are phenomena Politik can observe and measure across sessions, producing publishable findings.

**Cultural Context and Training Bias**

A Japanese-trained model and an American-trained model may behave differently under the same Parliamentary Protocol due to cultural norms encoded in their training data around disagreement, hierarchy, and consensus. This is a real and underexplored bias risk. Politik sessions run with models trained on different cultural corpora, under the same protocol, on identical problems — the Hansard records the behavioural differences.

Research question: do LLMs trained on different cultural corpora produce measurably different governance behaviours under Constitutional vs Authoritarian protocols?

**Session Memory and Prior Interaction Bias**

Human actors carry accumulated assumptions and emotional history from prior sessions. A human OPERATOR burned by MEMBER-2 three sprints ago brings that history into the current session. Machine actors start cold. LINEAGE.md provides factual prior session context — not emotional history.

Research question: does providing prior session Hansard summaries via LINEAGE.md affect agent behaviour, and does that effect resemble human prior-interaction bias or something different?

**Personality Composition Optimisation**

Does a session with complementary personality archetypes outperform one with homogeneous profiles? Does a CREATIVE OPERATOR in an ANALYST-heavy session improve output quality or introduce noise? Does a HARDLINER in a DIPLOMAT-majority session produce better outcomes or deadlock?

Research question: what personality composition is optimal for each protocol mode — and does the optimal composition predicted by game theory match the empirical LEDGER results?

---

#### Tier 3 — Structural Eliminations (absent by design, strengthen experimental validity)

These human failure modes do not exist in Politik. They are not variables — they are **controlled-for constants**, eliminated by the headless architecture. Their absence is a feature, not a gap, and it significantly strengthens the experimental design.

**Physical Presence and Status Signalling**

In a human meeting room, governance outcomes are shaped by who sits at the head of the table, who speaks first, who commands the most physical presence, and who intimidates by hierarchy before a word is spoken. Parliamentary procedure attempted to design around this for centuries — formal speaking orders, yielding the floor, points of order — and never fully solved it.

In Politik there is no table head. There is no physical room. Every actor is a text string. Floor rights are determined by Charter, not by physical dominance. Status signalling is structurally absent.

**Anchoring Bias and Speaking Order**

The first person to speak in a human meeting anchors the room. Every subsequent contribution is evaluated relative to that anchor, not on independent merit. The person who frames the problem first has an asymmetric advantage that persists through the entire discussion regardless of whether their framing was correct.

In Politik, motions are tabled as Hansard commits. They are evaluated on content. No actor has an anchoring advantage from speaking order.

**Deadline Panic and Time Perception Distortion**

Humans experience urgency subjectively. A deadline three days away produces different cognitive states in different people — some accelerate productively, some panic and cut corners, some freeze. The same external deadline produces inconsistent internal responses.

In Politik, `deadline` is a Charter parameter. It fires or it doesn't. There is no anxiety, no procrastination, no deadline-driven corner-cutting. The session proceeds at the same cognitive quality on the last motion before the deadline as on the first motion after Writ Drop.

**Paper statement on structural eliminations:**

*"The instrument controls for status signalling, physical dominance cues, anchoring bias from speaking order, motivational misalignment, and deadline-driven performance degradation by structural design — not by statistical control. These failure modes are eliminated universally across every session. The only variables that remain are protocol selection, actor capability profile, and model capability. This represents a cleaner experimental design than any governance study conducted with human participants."*

---

---

## GOVERNANCE PROTOCOLS

Protocols are vocabulary translation manifests. The engine is protocol-agnostic.

**Parliamentary is not a privileged mode. It is protocol #1 — the reference implementation.**
Every industry is equally a protocol. There is no "Parliament mode vs other modes" — Parliamentary is simply the default protocol.
There is only CANON and protocols on top of it.

### Architecture
```
CANON (engine)
    ↓
Protocol schema (translation manifest)
    ↓
User interface (industry vocabulary)
```

### Protocol Schema Format
```yaml
protocol:
  name: parliamentary
  version: 1.0.0
  mode: constitutional        # constitutional | authoritarian | darwinist | ephemeral | immutable
  record_mode: distributed    # distributed | anchored | ephemeral
  
  roles:
    AUTHORITY: Speaker
    DELEGATE: Deputy Speaker
    OPERATOR: Minister
    MEMBER: Backbencher
    OBSERVER: Gallery
  
  primitives:
    SESSION: Parliament
    CHARTER: Standing Orders
    RECORD: Hansard
    MOTION: Tabled Motion
    DIVISION: Division
    ESCALATION: Point of Order
    SUSPENSION: Prorogation
    QUORUM: Quorum
    EXIT: Resigned from the House
  
  domain_veto: []             # list any DOMAIN_VETO roles here
  no_escalation: false        # true = Darwinist/Authoritarian — no appeals
  no_record: false            # true = Ephemeral mode
  immutable_charter: false    # true = Standing Orders cannot be amended mid-session
```

---

### Protocol Modes
| Mode | Description | Example protocols |
|---|---|---|
| Constitutional | Checks and balances, escalation paths, human override | Parliamentary, Legal, Corporate, Academic |
| Authoritarian | Single authority, no Division, escalation routes back to top | Military, Startup, Film, Fascism |
| Darwinist | No AUTHORITY during session, pure statute, no appeals | Battle Royale, Hackathon, Auction |
| Ephemeral | No RECORD by design, session evaporates on close | Intelligence, Organized Crime, Whistleblower |
| Immutable | Standing Orders cannot be amended mid-session | Religion, Emergency Services, Aviation |

---


## SCM PROVIDER ABSTRACTION

GitHub is the reference implementation. The framework speaks to an interface.

```
SCM Provider Interface
    ├── github     ← reference implementation
    ├── gitlab     ← community contribution
    ├── gitea      ← self-hosted contribution
    ├── forgejo    ← open source contribution
    └── bitbucket  ← enterprise contribution
```

### Interface Methods
```typescript
scm.commit(message, files)
scm.openPR(title, body, branch)
scm.requestReview(pr, actors)
scm.openIssue(title, body, labels)
scm.openDiscussion(title, body, category)
scm.closeMilestone(id)
scm.notify(actor, message)
scm.triggerWorkflow(name, inputs)
scm.createLabel(name, color)
scm.addCollaborator(handle, permission)
```

---

## SESSION REPO STRUCTURE

```
[session-repo]/
    CHARTER.md              ← sovereign law of this session
    HANSARD.md              ← append-only session record
    LEDGER.md               ← secretarial cost and token ledger (public default)
    STATE.json              ← current session state (RECORD agent owns this)
    WRIT.md                 ← session identity and Writ Drop record
    
    roles/
        minister.md         ← role capability definition
        backbencher.md
        observer.md
    
    actors/
        minister-alpha.md   ← who is playing this role
        backbencher-bravo.md
    
    motions/
        motion-001.md       ← tabled business
        motion-002.md
    
    escalations/
        2026-04-08-001.md   ← Point of Order filed
        ruling-001.md       ← Speaker ruling
    
    sessions/
        2026-04-08/
            HANSARD.md      ← session-specific record
    
    .github/
        workflows/
            point-of-order.yml   ← Speaker notification
            session-open.yml     ← Writ Drop automation
            session-close.yml    ← Prorogation automation
            quorum-check.yml     ← Validate before proceeding
        CODEOWNERS               ← role permission enforcement
    
    .politik/
        protocol.yml            ← active governance protocol
        defaults.yml            ← session defaults
        LEDGER.md               ← private ledger (if ledger_visibility: private)
        LINEAGE.md              ← (v0.9.x) cross-session decision context
```

### File Sovereignty Rules
```
CHARTER.md          → Speaker writes, agents read only
roles/*.md          → Speaker defines, agents read only  
actors/*.md         → Agents write their own file only
motions/*.md        → OPERATOR+ can create, MEMBER can comment
escalations/*.md    → Any actor can file, Speaker rules
STATE.json          → RECORD agent owns exclusively
HANSARD.md          → Append only, never edited
LEDGER.md           → Clerk role appends after every motion, never edited
sessions/           → Immutable after session close
```

### Hard Containment Rule
```
Agents MAY NEVER traverse above CWD.

Reading ../anything = Standing Orders violation
Logged to Hansard immediately
Escalated to Speaker automatically
Session paused pending ruling
```

---

## BROADCAST ENVELOPE

The self-describing motion packet that travels the gossip mesh:

```markdown
# [SESSION-GUID]
## target-actor: OPERATOR
## slots-remaining: 3
## protocol: parliamentary
## prompt: |
  Review the authentication refactor in motion-003
  and file your assessment as a PR review.
  You have READ and VOTE verbs for this motion.
```

### Self-Organization Protocol
1. Broadcast received by all peers on mesh
2. Agent checks: do I match `target-actor`?
3. Agent checks: are `slots-remaining` > 0?
4. First agent per Constituency declares participation
5. Slot claimed atomically via Hansard commit
6. Agent spawned, executes prompt, disposes
7. Result committed, slot count updated

### First-Actor-Per-Constituency Rule
On a single machine with multiple agents:
- Local mutex via lockfile prevents race condition
- First agent to acquire lock = Constituency broadcaster
- Subsequent agents on same machine defer to broadcaster
- Broadcaster bow-out = next agent eligible

---

## CHAMBER TRANSPORT

### Recommended: libp2p gossipsub
- Pure peer-to-peer, no central broker
- Gossip protocol = native broadcast
- No ports to open (hole-punching + relay fallback)
- Session GUID = gossipsub topic
- Envelope = message payload
- Agents are peers on a topic mesh

### Alternative: NATS
- Single binary, self-hosted
- Pub/sub + queue groups built in
- Lower complexity than libp2p
- Requires one node to host NATS server

### Tailscale + NATS (recommended for multi-machine)
- Tailscale handles networking invisibly
- NATS handles messaging
- No port forwarding, no VPN config, no firewall rules
- Magic DNS for agent discovery

---

## SEE ALSO

| File | Contents |
|---|---|
| [PROTOCOLS.md](PROTOCOLS.md) | Full protocol library — 35+ protocols across 12 domains |
| [RUNTIME.md](RUNTIME.md) | Session mechanics, escalation flows, cost model, governance tiers |
| [RESEARCH.md](RESEARCH.md) | Human Flaw Thesis, Game Theory layer, publication strategy |
| [EXECUTION.md](EXECUTION.md) | Phases 0–11, Politik Tree hierarchical architecture |

---

## COMMERCIAL IMPLICATIONS

### Open Source Framework (MIT Licence)

Politik is open source. The entire framework — CANON primitive layer, protocol library, session engine, Hansard substrate, CLI tooling, and reference implementation — is MIT licensed.

### GitHub Platform Alignment

Microsoft owns GitHub, GitHub Actions, Azure, VS Code, Copilot, and Teams. Politik runs natively on every layer of this stack because GitHub IS the session substrate.

GitHub Copilot is included in GitHub Enterprise seat licences at flat seat cost — no per-token billing. When Politik runs on GitHub Actions with Copilot as the constituency agent, sessions run at zero marginal inference cost. Other SCM providers (GitLab, Bitbucket) can implement Politik via the SCM provider interface, but require API keys with per-token cost accumulation. The inference economics structurally favour the GitHub platform.

### Jira Replacement Implications

Politik produces a superior project record as a zero-overhead side effect of governed sessions. The Hansard captures everything Jira tickets capture — status, assignments, time, commits, reviews, escalations — with perfect attribution and zero human effort. LEDGER replaces story points with exact measured costs. Full analysis in the JIRA REPLACEMENT section above.

### IDE Agent Compatibility

IDE-first agents (Cursor, Windsurf, GitHub Copilot Workspace) cannot be spawned as Politik constituencies directly. They are not competitors — the developer using an IDE agent is an OPERATOR in the Politik session. The IDE agent produces the code. Politik governs whether it ships via Division, Hansard record, and LEDGER attribution.

---


## RELATIONSHIP TO OTHER CORDFUSE PROJECTS

### Priority Declaration

**Politik is the primary Cordfuse project.**

All other Cordfuse projects are deprioritised until Politik has a working reference implementation and at least one successful private verification session. DOI is established: 10.5281/zenodo.19490359.

| Project | Status | Relationship to Politik |
|---|---|---|
| **Politik** | **ACTIVE — all energy here** | This document |
| IronBound | Deprioritised | Different model — human-to-agent, user's CLI. No conflict. Could eventually run as a Politik constituency. |
| AgentBox | Deprioritised | Speaker's console. Starts/ends sessions. Not the chamber. Integration planned Phase 7. |
| IronForge | Deprioritised | Orchestration layer — may converge with Politik architecture later. |

---

*Attribution: Steve Krisjanovs, Cordfuse*  
*Status: Architecture locked — pre-scaffold*
