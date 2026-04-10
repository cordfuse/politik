# POLITIK
### A Governed Multi-Agent Framework Built on Git

**Framework name: Politik**
**Repo:** `cordfuse/politik`
**Attribution:** Steve Krisjanovs, Cordfuse Inc.

**Note:** "Parliament" appears throughout as the default protocol vocabulary — not the framework name. The framework is Politik.

---

> **Run local, run free.**  
> **Run OAuth, run far.**  
> **Run API keys, run carefully.**

---

## STATUS
- **Visibility:** Private (Cordfuse internal)
- **Stage:** Architecture — pre-scaffold

---

## PRIORITY 0 — NAMING (Before any scaffolding)

Nothing gets committed to a public repo, npm, Docker Hub, or Homebrew until these are locked.

```
[ ] Name the framework
[ ] Name the canonical primitive layer (working name: CANON)
[ ] Name the session unit
[ ] Name the governance protocol system
[ ] Name the SCM provider abstraction
[ ] Verify npm namespace available
[ ] Verify GitHub org/repo name available (cordfuse/politik)
[ ] Verify Docker Hub namespace available
[ ] Squatting check
[ ] Domain check (optional but smart)
```

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

## PROTOCOL LIBRARY

### DOMAIN: POLITICS & GOVERNANCE

**Protocol: Parliamentary Democracy (reference — ships first)**
| CANON | Term |
|---|---|
| AUTHORITY | Speaker |
| DELEGATE | Deputy Speaker |
| OPERATOR | Minister |
| MEMBER | Backbencher |
| OBSERVER | Gallery |
| SESSION | Parliament |
| CHARTER | Standing Orders |
| RECORD | Hansard |
| MOTION | Tabled Motion |
| DIVISION | Division |
| ESCALATION | Point of Order |
| SUSPENSION | Adjournment |
| DISSOLVE | Prorogation |
| EXIT | Resigned from the House |
| DEADLOCK | Hung Parliament |
| PROMOTE | Appointed to Cabinet |
| DEMOTE | Returned to Backbench |
Mode: Constitutional

**Protocol: Republic (US-style)**
| CANON | Term |
|---|---|
| AUTHORITY | President |
| DELEGATE | Vice President |
| OPERATOR | Secretary / Senator |
| MEMBER | Representative |
| OBSERVER | Constituent |
| SESSION | Congress |
| CHARTER | Constitution |
| RECORD | Congressional Record |
| MOTION | Bill |
| DIVISION | Vote |
| ESCALATION | Filibuster |
| SUSPENSION | Recess |
| EXIT | Impeached / Resigned |
| DEADLOCK | Government Shutdown |
| VETO | Presidential Veto |
Mode: Constitutional (AUTHORITY holds strong VETO)

**Protocol: Socialism / Collective**
| CANON | Term |
|---|---|
| AUTHORITY | Party Chair |
| OPERATOR | Comrade Commissar |
| MEMBER | Worker Delegate |
| OBSERVER | Civilian |
| SESSION | Collective |
| RECORD | Party Record |
| MOTION | Party Directive |
| ESCALATION | Party Challenge |
| EXIT | Sent to Re-education / Purged |
| DEADLOCK | Party Purge |
Mode: Authoritarian (collective in theory, party in practice)

**Protocol: Fascism**
| CANON | Term |
|---|---|
| AUTHORITY | The Leader |
| OPERATOR | Reich Minister |
| MEMBER | Party Member |
| OBSERVER | Subject |
| SESSION | The State |
| RECORD | State Propaganda |
| MOTION | Decree |
| ESCALATION | None — routes back to Leader |
| EXIT | Disappeared / Purged |
| DEADLOCK | Not permitted |
Mode: Authoritarian — no DIVISION, no ESCALATION, AUTHORITY is terminal

**Protocol: Monarchy**
| CANON | Term |
|---|---|
| AUTHORITY | The Crown |
| DELEGATE | Lord Chancellor |
| OPERATOR | Noble / Lord |
| MEMBER | Knight / Subject |
| OBSERVER | Commoner |
| SESSION | Royal Court |
| CHARTER | Royal Decree |
| RECORD | Royal Chronicle |
| MOTION | Petition |
| DIVISION | Royal Assent |
| ESCALATION | Appeal to the Crown |
| EXIT | Banished / Executed |
Mode: Authoritarian with Constitutional elements

---

### DOMAIN: SOFTWARE DEVELOPMENT

**Protocol: Agile / Scrum**
| CANON | Term |
|---|---|
| AUTHORITY | Scrum Master |
| DELEGATE | Tech Lead |
| OPERATOR | Senior Developer |
| MEMBER | Developer |
| OBSERVER | Stakeholder |
| SESSION | Sprint |
| CHARTER | Definition of Done |
| RECORD | Commit Log |
| MOTION | Pull Request |
| DIVISION | Code Review Vote |
| ESCALATION | Blocker |
| SUSPENSION | Sprint Close |
| EXIT | Offboarded |
| DEADLOCK | Merge Conflict |
| PROMOTE | Promoted to Tech Lead |
Mode: Constitutional

**Protocol: Open Source / RFC**
| CANON | Term |
|---|---|
| AUTHORITY | Maintainer / BDFL |
| DELEGATE | Core Contributor |
| OPERATOR | Contributor |
| MEMBER | Community Member |
| OBSERVER | User / Watcher |
| SESSION | RFC Period |
| CHARTER | CONTRIBUTING.md |
| RECORD | Issue / PR History |
| MOTION | RFC / PR |
| DIVISION | Maintainer Approval |
| ESCALATION | Request for Comment |
| SUSPENSION | RFC Closed |
| EXIT | Banned / Removed |
| DEADLOCK | Stalled RFC |
Mode: Constitutional (BDFL holds soft veto)

**Protocol: DevOps / Incident**
| CANON | Term |
|---|---|
| AUTHORITY | Incident Commander |
| DELEGATE | Operations Lead |
| OPERATOR | On-Call Engineer |
| MEMBER | Responder |
| OBSERVER | Stakeholder / Management |
| SESSION | Incident |
| CHARTER | Runbook |
| RECORD | Incident Timeline |
| MOTION | Remediation Action |
| DIVISION | Team Consensus |
| ESCALATION | Escalate to IC |
| SUSPENSION | Incident Resolved |
| EXIT | Handed Off |
| DEADLOCK | Bridge Call Chaos |
Mode: Authoritarian (IC decides unilaterally under pressure)

---

### DOMAIN: SPORTS

**Protocol: League Season**
| CANON | Term |
|---|---|
| AUTHORITY | Commissioner |
| DELEGATE | League Director |
| OPERATOR | Team Captain |
| MEMBER | Roster Player |
| OBSERVER | Fan / Press |
| SESSION | Season |
| CHARTER | Rulebook |
| RECORD | Season Stats / Game Log |
| MOTION | Play Call |
| DIVISION | Referee Decision |
| ESCALATION | Challenge Flag |
| SUSPENSION | Off Season |
| EXIT | Traded / Released |
| DEADLOCK | Tie / Overtime |
Mode: Constitutional

**Protocol: Elimination Tournament (Single)**
| CANON | Term |
|---|---|
| AUTHORITY | Tournament Director |
| SESSION | Tournament |
| CHARTER | Tournament Rules |
| RECORD | Bracket |
| MOTION | Match |
| DIVISION | Match Result |
| ESCALATION | Protest / Appeal |
| SUSPENSION | Bye Round |
| EXIT | Eliminated — bracket closes |
| DEADLOCK | Tiebreaker Round |
| QUORUM | Minimum entrants |
Mode: Darwinist — losers exit permanently, no second chances

**Protocol: Double Elimination**
Same as Single Elimination with:
- EXIT from winners bracket → moves to losers bracket
- EXIT from losers bracket → permanently eliminated
- Two survival chances built into CHARTER

**Protocol: Round Robin**
| CANON | Term |
|---|---|
| AUTHORITY | Tournament Director |
| SESSION | Round Robin Pool |
| MOTION | Match |
| RECORD | Points Table |
| DIVISION | Match Result |
| SUSPENSION | Pool Complete |
| EXIT | Pool Stage Elimination |
| DEADLOCK | Points Tie → Tiebreaker |
Mode: Constitutional — everyone plays everyone, standings decide

**Protocol: Battle Royale**
| CANON | Term |
|---|---|
| AUTHORITY | None during session (Server / Host pre-bakes rules) |
| SESSION | Match |
| CHARTER | Zone Rules / Match Config |
| RECORD | Kill Feed |
| MOTION | Engagement |
| DIVISION | None — no appeals |
| ESCALATION | None — no appeals |
| SUSPENSION | Zone Collapse |
| EXIT | Eliminated |
| QUORUM | Players Remaining |
| DEADLOCK | Final Circle |
Mode: Darwinist — pure statute, no AUTHORITY, no ESCALATION

**Protocol: Swiss System (Chess / Competitive)**
| CANON | Term |
|---|---|
| AUTHORITY | Arbiter |
| SESSION | Swiss Tournament |
| CHARTER | Swiss Rules |
| RECORD | Standings / Pairings |
| MOTION | Round |
| DIVISION | Game Result |
| ESCALATION | Arbiter Ruling Request |
| SUSPENSION | Bye |
| EXIT | Withdrawal |
| DEADLOCK | Draw |
Mode: Constitutional — no elimination, standings accumulate

**Protocol: Draft / Fantasy**
| CANON | Term |
|---|---|
| AUTHORITY | Commissioner |
| SESSION | Draft / Season |
| CHARTER | League Rules |
| RECORD | Draft Board / Roster |
| MOTION | Pick / Trade |
| DIVISION | Trade Vote (if league votes) |
| ESCALATION | Commissioner Review |
| SUSPENSION | Off Season |
| EXIT | Dropped |
| DEADLOCK | Disputed Trade |
Mode: Constitutional with Commissioner VETO

**Protocol: Olympic / Multi-Sport**
| CANON | Term |
|---|---|
| AUTHORITY | IOC / Organizing Committee |
| OPERATOR | Team Chef de Mission |
| MEMBER | Athlete |
| OBSERVER | Press / Spectator |
| SESSION | Games |
| RECORD | Medal Table / Results |
| MOTION | Event |
| DIVISION | Judge Panel Score |
| ESCALATION | Protest / CAS Appeal |
| EXIT | Disqualified / DNF |
| DOMAIN_VETO | Anti-Doping Authority (can void results) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Motorsport / F1**
| CANON | Term |
|---|---|
| AUTHORITY | Race Director |
| DELEGATE | Deputy Race Director |
| OPERATOR | Team Principal |
| MEMBER | Driver |
| OBSERVER | Spectator / Press |
| SESSION | Race Weekend |
| CHARTER | Sporting Regulations |
| RECORD | Lap Times / Race Results |
| MOTION | Pit Strategy Call |
| DIVISION | Stewards Decision |
| ESCALATION | Protest to Stewards |
| SUSPENSION | Safety Car / Red Flag |
| EXIT | DNF / DSQ |
| DEADLOCK | Stewards Under Review |
Mode: Constitutional

**Protocol: eSports Match**
| CANON | Term |
|---|---|
| AUTHORITY | Referee / Admin |
| OPERATOR | Team Captain |
| MEMBER | Player |
| OBSERVER | Caster / Viewer |
| SESSION | Series / Match |
| CHARTER | Ruleset |
| RECORD | Match History / VOD |
| MOTION | In-game call |
| DIVISION | Admin Ruling |
| ESCALATION | Pause / Admin Call |
| SUSPENSION | Technical Pause |
| EXIT | Forfeit / Disqualified |
| DEADLOCK | Remake |
Mode: Constitutional

**Protocol: MMO Raid / Guild**
| CANON | Term |
|---|---|
| AUTHORITY | Guild Master |
| DELEGATE | Officer |
| OPERATOR | Class Lead / Role Lead |
| MEMBER | Member |
| OBSERVER | Trial / Applicant |
| SESSION | Raid / Campaign |
| CHARTER | Guild Rules / Loot Council |
| RECORD | DPS Logs / Raid Report |
| MOTION | Raid Call |
| DIVISION | Loot Vote |
| ESCALATION | Officer Ticket |
| SUSPENSION | Reset / Off Week |
| EXIT | Gkicked |
| DEADLOCK | Loot Drama |
Mode: Constitutional

---

### DOMAIN: MILITARY & SECURITY

**Protocol: Military Operation**
| CANON | Term |
|---|---|
| AUTHORITY | Commanding Officer |
| DELEGATE | Executive Officer |
| OPERATOR | Field Commander |
| MEMBER | Enlisted |
| OBSERVER | Intelligence Liaison |
| SESSION | Operation |
| CHARTER | Rules of Engagement |
| RECORD | After Action Report |
| MOTION | Order |
| DIVISION | None — CO decides |
| ESCALATION | Challenge Up Chain |
| SUSPENSION | Stand Down |
| EXIT | KIA / Relieved of Duty |
| DEADLOCK | Comms Blackout |
Mode: Authoritarian

**Protocol: Intelligence / Espionage**
| CANON | Term |
|---|---|
| AUTHORITY | Station Chief |
| DELEGATE | Handler |
| OPERATOR | Field Officer |
| MEMBER | Asset |
| OBSERVER | None — compartmentalized |
| SESSION | Operation |
| CHARTER | Tradecraft |
| RECORD | None — burn after reading |
| MOTION | Tasking |
| DIVISION | None — unilateral |
| ESCALATION | Flash Traffic to Director |
| EXIT | Burned / Extracted / Eliminated |
Mode: Authoritarian + Ephemeral (no RECORD by design)

**Protocol: Cybersecurity / Red Team**
| CANON | Term |
|---|---|
| AUTHORITY | Security Director |
| DELEGATE | Red Team Lead |
| OPERATOR | Penetration Tester |
| MEMBER | Analyst |
| OBSERVER | Compliance Officer |
| SESSION | Engagement |
| CHARTER | Rules of Engagement |
| RECORD | Findings Report |
| MOTION | Attack Vector |
| DIVISION | Severity Vote |
| ESCALATION | Critical Finding — immediate notify |
| SUSPENSION | Engagement Close |
| EXIT | Out of Scope — cease |
| DOMAIN_VETO | Compliance Officer (can halt engagement) |
Mode: Constitutional with DOMAIN_VETO

---

### DOMAIN: LEGAL & JUSTICE

**Protocol: Criminal Trial**
| CANON | Term |
|---|---|
| AUTHORITY | Judge |
| DELEGATE | Clerk of the Court |
| OPERATOR | Lead Counsel |
| MEMBER | Associate / Paralegal |
| OBSERVER | Jury |
| SESSION | Trial |
| CHARTER | Rules of Evidence |
| RECORD | Court Transcript |
| MOTION | Motion / Objection |
| DIVISION | Verdict |
| ESCALATION | Objection — Sustained / Overruled |
| SUSPENSION | Adjournment |
| EXIT | Struck from Record |
| DEADLOCK | Mistrial |
| DOMAIN_VETO | Jury (holds final Division authority) |
Mode: Constitutional with DOMAIN_VETO inversion

**Protocol: Arbitration**
| CANON | Term |
|---|---|
| AUTHORITY | Arbitrator Panel |
| OPERATOR | Lead Counsel |
| MEMBER | Witness |
| OBSERVER | Interested Party |
| SESSION | Arbitration |
| CHARTER | Arbitration Agreement |
| RECORD | Award |
| MOTION | Submission |
| DIVISION | Panel Decision |
| ESCALATION | None — binding by agreement |
| SUSPENSION | Recess |
| EXIT | Settled / Withdrawn |
Mode: Authoritarian (binding, no appeal by design)

---

### DOMAIN: HEALTHCARE & SCIENCE

**Protocol: Clinical / Hospital**
| CANON | Term |
|---|---|
| AUTHORITY | Chief of Medicine / Attending |
| DELEGATE | Charge Nurse |
| OPERATOR | Specialist / Consultant |
| MEMBER | Resident / Intern |
| OBSERVER | Patient |
| SESSION | Case / Shift |
| CHARTER | Clinical Protocol |
| RECORD | Patient Chart / EMR |
| MOTION | Treatment Order |
| DIVISION | Multidisciplinary Team Vote |
| ESCALATION | Ethics Consultation |
| SUSPENSION | Discharge / End of Shift |
| EXIT | Referred Out |
| DEADLOCK | Ethics Committee Review |
| DOMAIN_VETO | Patient (holds treatment veto) |
Mode: Constitutional with DOMAIN_VETO inversion

**Protocol: Clinical Trial / Research**
| CANON | Term |
|---|---|
| AUTHORITY | Principal Investigator |
| DELEGATE | Lab Manager |
| OPERATOR | Senior Researcher |
| MEMBER | Graduate Student / RA |
| OBSERVER | IRB / Peer Reviewer |
| SESSION | Study |
| CHARTER | Protocol / IRB Approval |
| RECORD | Lab Notebook / Dataset |
| MOTION | Hypothesis / Experiment |
| DIVISION | Peer Review |
| ESCALATION | Protocol Deviation Report |
| SUSPENSION | Publication / Grant End |
| EXIT | Retracted / Dropped |
| DEADLOCK | Replication Crisis |
| DOMAIN_VETO | IRB (can halt study) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Emergency Response / ICS**
| CANON | Term |
|---|---|
| AUTHORITY | Incident Commander |
| DELEGATE | Operations Section Chief |
| OPERATOR | Division Supervisor |
| MEMBER | Unit Leader |
| OBSERVER | Agency Liaison |
| SESSION | Incident |
| CHARTER | ICS Protocol |
| RECORD | Incident Action Plan / ICS-214 |
| MOTION | Tactical Assignment |
| DIVISION | None — IC decides |
| ESCALATION | Safety Officer Override |
| SUSPENSION | Demobilization |
| EXIT | Relieved / Reassigned |
| DOMAIN_VETO | Safety Officer (can override IC on safety) |
Mode: Authoritarian with DOMAIN_VETO safety carve-out

---

### DOMAIN: CREATIVE & ENTERTAINMENT

**Protocol: Film / TV Production**
| CANON | Term |
|---|---|
| AUTHORITY | Director |
| DELEGATE | 1st AD |
| OPERATOR | Department Head (DP, PD) |
| MEMBER | Crew |
| OBSERVER | Studio / Producer |
| SESSION | Shoot / Production |
| CHARTER | Script / Shot List |
| RECORD | Continuity Notes / Edit Log |
| MOTION | Scene / Take |
| DIVISION | None — Director decides |
| ESCALATION | Notes from Studio |
| SUSPENSION | Wrap |
| EXIT | Fired / Walked Off Set |
| DEADLOCK | Creative Differences |
Mode: Authoritarian

**Protocol: Theatre**
| CANON | Term |
|---|---|
| AUTHORITY | Director |
| DELEGATE | Stage Manager |
| OPERATOR | Lead Actor / Designer |
| MEMBER | Cast / Crew |
| OBSERVER | Audience / Producer |
| SESSION | Production / Run |
| CHARTER | Script / Production Bible |
| RECORD | Prompt Book |
| MOTION | Blocking Note / Change |
| DIVISION | Company Vote (rare) |
| ESCALATION | Producer Intervention |
| SUSPENSION | Dark Night / Hiatus |
| EXIT | Recast / Resigned |
| DEADLOCK | Creative Impasse |
Mode: Authoritarian

**Protocol: Music Recording**
| CANON | Term |
|---|---|
| AUTHORITY | Producer |
| DELEGATE | Engineer |
| OPERATOR | Session Lead / Artist |
| MEMBER | Session Musician |
| OBSERVER | A&R / Label |
| SESSION | Recording Session |
| CHARTER | Creative Brief |
| RECORD | Session Log / Stems |
| MOTION | Take |
| DIVISION | Producer Decision |
| ESCALATION | Label Review |
| SUSPENSION | Session End |
| EXIT | Replaced |
| DEADLOCK | Creative Block |
Mode: Authoritarian

**Protocol: Game Development**
| CANON | Term |
|---|---|
| AUTHORITY | Game Director |
| DELEGATE | Lead Designer |
| OPERATOR | Senior Dev / Artist |
| MEMBER | Developer |
| OBSERVER | QA / Publisher |
| SESSION | Milestone / Crunch |
| CHARTER | Game Design Document |
| RECORD | Build Notes / Changelog |
| MOTION | Feature / Change |
| DIVISION | Team Vote |
| ESCALATION | Publisher Review |
| SUSPENSION | Ship / Gold |
| EXIT | Laid Off / Left |
| DEADLOCK | Feature Creep Freeze |
Mode: Constitutional drifting Authoritarian near ship

---

### DOMAIN: BUSINESS & FINANCE

**Protocol: Corporate / Board**
| CANON | Term |
|---|---|
| AUTHORITY | CEO / Chair |
| DELEGATE | COO |
| OPERATOR | VP / Director |
| MEMBER | Manager |
| OBSERVER | Shareholder |
| SESSION | Board Meeting / Quarter |
| CHARTER | Corporate Policy |
| RECORD | Minutes |
| MOTION | Proposal / Initiative |
| DIVISION | Board Vote |
| ESCALATION | Escalation to Legal / Board |
| SUSPENSION | End of Quarter |
| EXIT | Resigned / Terminated |
| DEADLOCK | Board Deadlock |
| PROMOTE | Promoted to VP |
| DOMAIN_VETO | Shareholder (special resolution veto) |
Mode: Constitutional

**Protocol: Startup**
| CANON | Term |
|---|---|
| AUTHORITY | Founder / CEO |
| OPERATOR | CTO / Lead |
| MEMBER | Employee |
| OBSERVER | Investor / VC |
| SESSION | Sprint / Launch |
| CHARTER | Move Fast, Break Things |
| RECORD | Slack Archive nobody reads |
| MOTION | Shipped Feature |
| DIVISION | Founder decides unilaterally |
| ESCALATION | None |
| SUSPENSION | Pivot |
| EXIT | Quit / Acqui-hired |
| DEADLOCK | Co-founder Dispute |
Mode: Authoritarian (structurally close to Fascism)

**Protocol: Investment / Trading**
| CANON | Term |
|---|---|
| AUTHORITY | Portfolio Manager / CIO |
| DELEGATE | Senior Analyst |
| OPERATOR | Analyst |
| MEMBER | Junior Analyst |
| OBSERVER | Risk Committee |
| SESSION | Investment Thesis |
| CHARTER | Investment Policy Statement |
| RECORD | Trade Log / Blotter |
| MOTION | Trade Recommendation |
| DIVISION | Committee Vote |
| ESCALATION | Risk Committee Override |
| SUSPENSION | Market Close / Halt |
| EXIT | Position Closed / Fired |
| DOMAIN_VETO | Risk Committee (can block trade) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Auction House**
| CANON | Term |
|---|---|
| AUTHORITY | Auctioneer |
| MEMBER | Bidder |
| OBSERVER | Spectator |
| SESSION | Auction |
| CHARTER | Auction Rules |
| RECORD | Bid Log |
| MOTION | Bid |
| DIVISION | Hammer Fall |
| ESCALATION | None — Auctioneer final |
| SUSPENSION | Lot Withdrawn |
| EXIT | Reserve Not Met / Won |
| DEADLOCK | Tied Bids |
Mode: Darwinist — rules pre-baked, Auctioneer is referee not participant

---

### DOMAIN: EDUCATION & ACADEMIA

**Protocol: Academic / University**
| CANON | Term |
|---|---|
| AUTHORITY | Dean / Department Chair |
| DELEGATE | Faculty Lead |
| OPERATOR | Professor |
| MEMBER | Graduate Student |
| OBSERVER | Undergraduate / Auditor |
| SESSION | Semester / Term |
| CHARTER | Syllabus / Academic Code |
| RECORD | Academic Record |
| MOTION | Assignment / Research Task |
| DIVISION | Faculty Vote |
| ESCALATION | Academic Review Board |
| SUSPENSION | End of Term |
| EXIT | Expelled / Withdrew |
| DEADLOCK | Committee Stalemate |
Mode: Constitutional

**Protocol: Debate Competition**
| CANON | Term |
|---|---|
| AUTHORITY | Chief Adjudicator |
| DELEGATE | Panel Chair |
| OPERATOR | Adjudicator |
| MEMBER | Debater |
| OBSERVER | Audience |
| SESSION | Tournament / Round |
| CHARTER | Debate Rules / Format |
| RECORD | Adjudication Notes |
| MOTION | Motion / Resolution |
| DIVISION | Adjudicator Decision |
| ESCALATION | Chief Adjudicator Appeal |
| SUSPENSION | Break / Final |
| EXIT | Eliminated |
Mode: Constitutional

---

### DOMAIN: COMMUNITY & SOCIAL

**Protocol: Organized Crime / Syndicate**
| CANON | Term |
|---|---|
| AUTHORITY | Boss / Don |
| DELEGATE | Underboss |
| OPERATOR | Capo |
| MEMBER | Soldier |
| OBSERVER | Associate |
| SESSION | Job / Operation |
| CHARTER | The Code / Omertà |
| RECORD | None — ever |
| MOTION | Order |
| DIVISION | None — Boss decides |
| ESCALATION | None |
| EXIT | Whacked / Flipped |
| DEADLOCK | War |
Mode: Authoritarian + Ephemeral

**Protocol: Religion / Church**
| CANON | Term |
|---|---|
| AUTHORITY | Pope / Bishop / Imam |
| DELEGATE | Vicar / Deacon |
| OPERATOR | Priest / Elder |
| MEMBER | Congregation |
| OBSERVER | Seeker / Visitor |
| SESSION | Mass / Synod / Council |
| CHARTER | Canon Law / Scripture (immutable) |
| RECORD | Scripture / Encyclical |
| MOTION | Decree / Proclamation |
| DIVISION | Council Vote / Synod |
| ESCALATION | Holy See / Fatwa |
| SUSPENSION | Benediction |
| EXIT | Excommunicated |
| DEADLOCK | Schism |
Mode: Immutable (Scripture cannot be amended mid-session)

**Protocol: Neighbourhood / HOA**
| CANON | Term |
|---|---|
| AUTHORITY | Board President |
| DELEGATE | Vice President |
| OPERATOR | Committee Chair |
| MEMBER | Homeowner |
| OBSERVER | Renter / Tenant |
| SESSION | AGM / Meeting |
| CHARTER | CC&Rs / Bylaws |
| RECORD | Meeting Minutes |
| MOTION | Resolution |
| DIVISION | Member Vote |
| ESCALATION | Legal Counsel Review |
| SUSPENSION | Meeting Adjourned |
| EXIT | Sold / Left Community |
| DEADLOCK | Tied Vote — Chair decides |
Mode: Constitutional

---

### DOMAIN: NOVEL / UNCONVENTIONAL

**Protocol: Hackathon**
| CANON | Term |
|---|---|
| AUTHORITY | Organizer / Judge Panel |
| OPERATOR | Team Lead |
| MEMBER | Hacker |
| OBSERVER | Sponsor / Mentor |
| SESSION | Hackathon |
| CHARTER | Hackathon Rules |
| RECORD | Submission Log |
| MOTION | Feature / Build |
| DIVISION | Judge Score |
| ESCALATION | Mentor Consultation |
| SUSPENSION | Time's Up |
| EXIT | Withdrew / Disqualified |
| DEADLOCK | Tie — judges deliberate |
Mode: Darwinist — clock governs, no appeals during build phase

**Protocol: Improv Theatre**
| CANON | Term |
|---|---|
| AUTHORITY | Director / Harold |
| OPERATOR | Ensemble Lead |
| MEMBER | Performer |
| OBSERVER | Audience |
| SESSION | Show / Set |
| CHARTER | Improv Rules ("Yes, And") |
| RECORD | None — ephemeral by nature |
| MOTION | Scene Offer |
| DIVISION | Group Acceptance |
| ESCALATION | Director Side-door |
| SUSPENSION | End of Show |
| EXIT | Edited Out |
| DEADLOCK | Scene Stalls — director edits |
Mode: Darwinist + Ephemeral (no record, rules pre-baked)

**Protocol: Archaeological Dig**
| CANON | Term |
|---|---|
| AUTHORITY | Principal Archaeologist |
| DELEGATE | Site Supervisor |
| OPERATOR | Field Director |
| MEMBER | Field Technician |
| OBSERVER | Funder / Heritage Authority |
| SESSION | Excavation Season |
| CHARTER | Site Research Design |
| RECORD | Site Archive / Context Sheets |
| MOTION | Excavation Decision |
| DIVISION | Team Consensus |
| ESCALATION | Heritage Authority Notification |
| SUSPENSION | Season Close / Backfill |
| EXIT | Permit Revoked / Left Site |
| DOMAIN_VETO | Heritage Authority (can halt dig) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Jury Deliberation**
| CANON | Term |
|---|---|
| AUTHORITY | Foreperson |
| MEMBER | Juror |
| SESSION | Deliberation |
| CHARTER | Jury Instructions |
| RECORD | None — deliberations sealed |
| MOTION | Argument |
| DIVISION | Verdict Vote |
| ESCALATION | Note to Judge |
| SUSPENSION | Recess |
| EXIT | Dismissed / Replaced |
| DEADLOCK | Hung Jury |
Mode: Constitutional + Ephemeral (record sealed)

**Protocol: Antarctic Expedition**
| CANON | Term |
|---|---|
| AUTHORITY | Expedition Leader |
| DELEGATE | Deputy Leader |
| OPERATOR | Senior Scientist |
| MEMBER | Crew / Junior Scientist |
| OBSERVER | Base Commander |
| SESSION | Expedition Season |
| CHARTER | Station Protocol / Safety Rules |
| RECORD | Station Log |
| MOTION | Field Decision |
| DIVISION | Team Vote |
| ESCALATION | Emergency Protocol |
| SUSPENSION | Evacuation / Winter-Over |
| EXIT | Medically Evacuated |
| DEADLOCK | Comms Blackout Protocol |
Mode: Immutable (safety rules non-negotiable, no amendment mid-session)

**Protocol: Pirate Crew**
| CANON | Term |
|---|---|
| AUTHORITY | Captain |
| DELEGATE | First Mate |
| OPERATOR | Quartermaster |
| MEMBER | Crew |
| OBSERVER | Prisoner / Passenger |
| SESSION | Voyage |
| CHARTER | Articles (crew contract) |
| RECORD | Ship's Log |
| MOTION | Ship's Council Proposal |
| DIVISION | Crew Vote |
| ESCALATION | Mutiny Vote |
| SUSPENSION | Made Port |
| EXIT | Marooned / Walked the Plank |
| DEADLOCK | Contested Command |
Mode: Constitutional (historically pirates were surprisingly democratic)

---

### DOMAIN: SCIENTIFIC RESEARCH

Scientific Research deserves its own domain — not just a protocol under Healthcare & Science. Different research paradigms are literally different governance structures for how knowledge gets validated. The protocol IS the epistemology.

This domain is unique: **every protocol here was designed by humans specifically to overcome known cognitive biases and incentive problems in knowledge production.** They were already mechanism-designed by centuries of scientific practice. Politik formalises and automates what science already knew it needed.

This also makes the Nash Eq analysis particularly clean — the game structures are not hypothetical. They are what real science has converged on through centuries of trial and error.

**Protocol: Peer Review**
| CANON | Term |
|---|---|
| AUTHORITY | Editor / Programme Chair |
| DELEGATE | Associate Editor |
| OPERATOR | Reviewer |
| MEMBER | Author |
| OBSERVER | Scientific Community |
| SESSION | Review Cycle |
| CHARTER | Review Criteria / Journal Standards |
| RECORD | Review History / Decision Log |
| MOTION | Submission |
| DIVISION | Accept / Reject / Major Revision |
| ESCALATION | Appeal to Editor-in-Chief |
| SUSPENSION | Decision Issued |
| EXIT | Withdrawn / Desk Rejected |
| DEADLOCK | Split Decision — additional reviewer assigned |
| DOMAIN_VETO | Statistical Reviewer (can reject on methodology alone) |

Mode: Constitutional
Special configuration: `operator_identity: anonymous` — Reviewer identities sealed by Charter.
Nash Eq: Honest assessment when reviewer anonymity is credible and reputation effects apply.

---

**Protocol: Adversarial Collaboration**
| CANON | Term |
|---|---|
| AUTHORITY | Independent Arbitrator |
| OPERATOR | Proponent Agent |
| OPERATOR | Opponent Agent |
| OBSERVER | Scientific Community |
| SESSION | Collaboration |
| CHARTER | Pre-registered Agreement (immutable — both parties commit before data collection) |
| RECORD | Joint Report |
| MOTION | Experimental Run |
| DIVISION | Result Interpretation |
| ESCALATION | Arbitrator Ruling |
| SUSPENSION | Joint Publication |
| EXIT | Protocol Violation — arbitrator intervenes |
| DEADLOCK | Genuinely ambiguous result — documented as such |

Mode: Constitutional + Immutable Charter
Note: Both OPERATOR agents must commit to accepting the result before the session begins. The Charter cannot be amended after the experiment starts. Formal epistemological solution to confirmation bias.
Nash Eq: Both agents converge on honest reporting because defection is contractually penalised and publicly recorded.

---

**Protocol: Replication Crisis**
| CANON | Term |
|---|---|
| AUTHORITY | Replication Director |
| OPERATOR | Original Study Agent |
| OPERATOR | Replication Agent |
| OPERATOR | Meta-analyst Agent |
| OBSERVER | Field Community |
| SESSION | Replication Study |
| CHARTER | Exact Replication Protocol |
| RECORD | Replication Log |
| MOTION | Experimental Run |
| DIVISION | Replication Success / Failure Vote |
| ESCALATION | Discrepancy Report — original authors notified |
| SUSPENSION | Replication Report Published |
| EXIT | Retracted / Finding Does Not Replicate |
| DEADLOCK | Partial replication — conditional survival |

Mode: Darwinist
Note: The finding either survives or dies. No negotiation. The Charter mandates exact replication — no methodological flexibility. The harshest protocol in the Scientific Research domain.
Nash Eq: Replication Agent maximises honest reporting — reputation depends on accuracy not on confirming or denying the original.

---

**Protocol: Pre-registration / Open Science**
| CANON | Term |
|---|---|
| AUTHORITY | Registry / IRB |
| OPERATOR | Principal Investigator Agent |
| MEMBER | Research Team Agent |
| OBSERVER | Public / Peer Community |
| SESSION | Research Study |
| CHARTER | Pre-registered Protocol (immutable after registration) |
| RECORD | Open Lab Notebook / Dataset |
| MOTION | Hypothesis / Experimental Design |
| DIVISION | IRB Approval |
| ESCALATION | Protocol Deviation Report |
| SUSPENSION | Publication |
| EXIT | Study Terminated / Hypothesis Abandoned |
| DEADLOCK | IRB Review Required |
| DOMAIN_VETO | IRB (can halt study at any point) |

Mode: Immutable
Note: The Charter is locked at registration. Any deviation is automatically logged as a Standing Orders violation and escalated. Prevents p-hacking and HARKing (Hypothesising After Results are Known) by architectural constraint not honour system.
Nash Eq: Agents converge on honest null result reporting — cherry-picking is structurally prevented.

---

**Protocol: Grand Challenge**
| CANON | Term |
|---|---|
| AUTHORITY | Challenge Organiser / Prize Committee |
| OPERATOR | Team Lead Agent |
| MEMBER | Team Member Agent |
| OBSERVER | Scientific Community / Public |
| SESSION | Challenge Period |
| CHARTER | Problem Definition + Evaluation Criteria |
| RECORD | Submission Log / Leaderboard |
| MOTION | Solution Submission |
| DIVISION | Evaluation Committee Scoring |
| ESCALATION | Submission Dispute |
| SUSPENSION | Challenge Close / Winner Declared |
| EXIT | Withdrew / Disqualified |
| DEADLOCK | No valid submission — challenge extended or abandoned |
| QUORUM | Minimum valid submissions |

Mode: Darwinist
Note: Teams work in competitive isolation. No collaboration between constituencies. Charter defines the problem completely before the session starts. Inspired by Hilbert's Problems, Millennium Prize Problems, DARPA Grand Challenges.
Nash Eq: Each team maximises solution quality independently. No incentive to share. Coalition formation is a Charter violation.

---

**Protocol: Red Team / Blue Team Science**
| CANON | Term |
|---|---|
| AUTHORITY | Scientific Referee / Programme Director |
| OPERATOR | Red Team Lead (mandate: falsify) |
| MEMBER | Red Team Agent |
| OPERATOR | Blue Team Lead (mandate: defend) |
| MEMBER | Blue Team Agent |
| OBSERVER | Scientific Community |
| SESSION | Adversarial Review |
| CHARTER | Rules of Engagement |
| RECORD | Attack / Defence Log |
| MOTION | Attack Vector / Defence Response |
| DIVISION | Referee Ruling per attack |
| ESCALATION | Disputed ruling — senior referee |
| SUSPENSION | Review Complete — theory survives or falls |
| EXIT | Theory falsified — Red Team wins |
| DEADLOCK | Inconclusive — further experimentation required |
| DOMAIN_VETO | Referee (can declare attack line out of scope) |

Mode: Authoritarian/Adversarial hybrid
Note: Red Team has a mandate to falsify. Blue Team has a mandate to defend. The Referee governs scope. Closest to the Legal/Adversarial protocol but applied to scientific epistemology. How frontier physics actually works informally — now formalised.
Nash Eq: Red Team converges on strongest possible attack. Blue Team converges on complete evidence disclosure. Both behaviours serve scientific truth even though agents' goals are opposed.

---

### Game Theory Analysis — Scientific Research Domain

| Protocol | Game Structure | Nash Eq Prediction |
|---|---|---|
| Peer Review | Multi-player review with information asymmetry | Honest assessment when anonymity is credible |
| Adversarial Collaboration | Binding commitment game | Honest reporting — defection contractually costly |
| Replication Crisis | Elimination game | Honest replication — reputation at stake |
| Pre-registration | Commitment device game | Null result reporting — cherry-picking structurally prevented |
| Grand Challenge | All-pay auction | Maximum solution quality — no incentive to hold back |
| Red Team / Blue Team | Zero-sum adversarial game | Maximum attack strength and maximum defence completeness |

---

Politik did not design around GitHub. GitHub accidentally IS a Politik session.

| Politik Primitive | GitHub Feature |
|---|---|
| Session / Politik | Repository |
| Writ Drop | Repo created from template |
| Standing Orders | CHARTER.md + Wiki |
| Hansard entry | Commit |
| Motion | Pull Request |
| Division vote | PR Review (Approve / Request Changes) |
| Motion Carried | PR Merged |
| Motion Defeated | PR Closed |
| Point of Order | Issue |
| Speaker Ruling | Issue Comment + Close |
| Debate | Discussion |
| Resolution | Discussion Answer |
| Parliamentary sitting | Milestone |
| Procedural status | Label |
| Order Paper | GitHub Projects board |
| Constituency join | Repo collaborator access |
| Actor mandate | CODEOWNERS entry |
| Quorum enforcement | Required reviewers (branch protection) |
| Standing Order enforcement | Branch protection rules |
| Speaker notification | GitHub Actions + email |
| Clerk automation | GitHub Actions workflows |
| Speaker credentials | Repository secrets |
| Sub-session / Committee | Branch |
| Committee reports back | Branch merged to main |
| Schism | Fork |
| Prorogation | Milestone closed + repo archived |

---

## SCM PROVIDER ABSTRACTION

GitHub is the reference implementation. The framework speaks to an interface.

```
SCM Provider Interface
    ├── github     ← reference implementation (Cordfuse)
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

## POINT OF ORDER — ESCALATION FLOW

```
Agent hits decision requiring human judgement
    ↓
Commits escalation to /escalations/[timestamp].md
    ↓
GitHub Actions workflow triggers on path match
    ↓
Speaker receives email notification
    ↓
Session pauses (STATE.json → paused: true)
    ↓
Speaker reviews, commits ruling.md
    ↓
GitHub Actions detects ruling commit
    ↓
Session resumes (STATE.json → paused: false)
    ↓
Ruling recorded permanently in Hansard
```

### Point of Order Workflow
```yaml
# .github/workflows/point-of-order.yml
name: Point of Order — Speaker Notification
on:
  push:
    paths:
      - 'escalations/[0-9]*.md'
jobs:
  notify-speaker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Read escalation
        id: esc
        run: |
          FILE=$(ls escalations/*.md | grep -v ruling | tail -1)
          echo "content<<EOF" >> $GITHUB_OUTPUT
          cat "$FILE" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Email Speaker
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: ${{ secrets.MAIL_USERNAME }}
          password: ${{ secrets.MAIL_PASSWORD }}
          to: ${{ secrets.SPEAKER_EMAIL }}
          subject: "⚖️ Point of Order — ${{ github.repository }}"
          body: |
            A Point of Order has been raised.
            
            ${{ steps.esc.outputs.content }}
            
            Session: ${{ github.server_url }}/${{ github.repository }}
            
            Commit your ruling to: escalations/ruling-[n].md
            Session is paused pending your response.
```

---

## ACTOR ELIMINATION — LEGITIMATE VS BAD FAITH

### The Core Problem

An actor exiting a session may have left for one of two fundamentally different reasons:

**Legitimate elimination** — the actor lost fairly under the protocol rules. Outscored in a Tournament. Outvoted in a Division. Failed to meet a performance threshold. The protocol worked as designed.

**Bad faith elimination** — the actor was removed through collusion, malice, envy, or procedural abuse. Another actor filed a false Point of Order. A coalition formed specifically to expel a competitor rather than to advance the session's goals. An OPERATOR abused PROMOTE/DEMOTE powers to suppress a MEMBER whose output threatened their standing.

This distinction matters. An immutable Hansard records that an actor was expelled. It does not automatically record *why* — or whether the why was legitimate.

Machine actors do not feel hatred or jealousy. But they can be **instructed** to eliminate rivals by human actors operating through the system, or by other machine actors whose prompts encode bad faith objectives. The Hansard is the defence — but only if the escalation mechanism is used correctly.

### Exit Types

The following EXIT classifications must be declared in the Hansard at the point of actor removal:

| Exit Type | Code | Description |
|---|---|---|
| Performance | `EXIT_PERFORMANCE` | Actor failed to meet objective criteria defined in Charter |
| Protocol | `EXIT_PROTOCOL` | Actor violated Standing Orders — documented violation required |
| Division | `EXIT_DIVISION` | Actor removed by legitimate vote with quorum |
| Voluntary — Concession | `EXIT_VOLUNTARY_CONCESSION` | Actor evaluated the evidence, accepted they lost on merit, withdrew with integrity |
| Voluntary — Strategic | `EXIT_VOLUNTARY_STRATEGIC` | Actor withdrew before a Division to deny quorum, deprive rival of formal win, or avoid a recorded defeat |
| Voluntary — Coerced | `EXIT_VOLUNTARY_COERCED` | Actor was pressured, threatened, or manipulated into withdrawing. On paper voluntary. In practice expulsion by other means. Also known as "voluntold." |
| Darwinist | `EXIT_DARWINIST` | Protocol-mandated elimination (Battle Royale, Elimination Tournament) |
| Speaker | `EXIT_SPEAKER` | AUTHORITY ruled removal — Speaker ruling committed to Hansard |
| Disputed | `EXIT_DISPUTED` | Actor filed a Point of Order challenging their own removal |

### The Voluntold Problem

`EXIT_VOLUNTARY_COERCED` is the most dangerous exit type in the taxonomy — not because it is violent but because it is invisible.

The coercion happens outside the session. An OPERATOR privately threatens a MEMBER. A coalition signals consequences. A human Speaker leans on an agent's prompt. The MEMBER files what looks like a clean voluntary exit. The Hansard shows nothing wrong.

This is "voluntold" — the actor technically chose to leave, but the choice was manufactured by someone else's pressure or manipulation.

It is common in real governance for exactly this reason: it produces all the outcomes of bad faith expulsion while generating none of the Hansard evidence that a disputed exit would create. The coercer gets the result. The record stays clean.

**The vices at work:**
- **Manipulation** by the coercing actor — engineering a desired outcome through pressure not procedure
- **Cowardice** by the coerced actor — withdrawing rather than filing a disputed exit and forcing the record
- **Wrath** as the underlying motivation — the coercer wanted the actor gone personally, not procedurally

**Partial mitigations — Charter-level:**

```yaml
# Charter configuration options for voluntold mitigation

voluntary_exit_during_division:
  require_concession_statement: true   # Actor must commit reason to Hansard
  cooling_off_minutes: 15              # Delay before exit is processed
  auto_notify_speaker: true            # Speaker notified even without escalation
  allow_disputed_conversion: true      # Actor can convert to EXIT_DISPUTED
                                       # within the cooling-off window
```

None of these catch a determined coercer operating entirely outside the session. But they create friction that makes the pattern visible over time. If the same OPERATOR repeatedly has MEMBERs "voluntarily" withdraw during active Divisions, the Hansard pattern speaks for itself. The audit trail is the deterrent.

**What the Hansard can detect:**

| Pattern | Signal |
|---|---|
| Serial voluntary exits | Multiple MEMBERs withdrawing during Divisions where the same OPERATOR is present |
| Timing correlation | EXIT_VOLUNTARY_STRATEGIC filed within seconds of a Division opening — no deliberation time |
| No concession statement | Voluntary exit during active Division with no stated reason — Charter violation if required |
| Repeat target | Same MEMBER voluntarily exits whenever same OPERATOR is present across multiple sessions |

**The hard truth:** A Speaker who is the coercer cannot be appealed to. This is the one scenario where the constitutional model fails — when the constitutional authority itself is corrupt. Politik has no answer to a bad faith Speaker beyond the Hansard record being visible to everyone who can read the repo. Transparency is the only remaining defence.

### Disputed Exit Flow

Any actor facing removal may file a **Disputed Exit** before their session access is revoked. This is the machine equivalent of due process.

```
Actor receives EXPEL motion
    ↓
Actor commits escalation to /escalations/disputed-exit-[timestamp].md
    (must happen before session access revoked — Charter defines window)
    ↓
Session pauses automatically
    ↓
Speaker receives notification
    ↓
Speaker reviews Hansard — was the elimination procedurally valid?
    ↓
Two possible rulings:
    ruling: UPHELD   → EXIT_PROTOCOL or EXIT_DIVISION confirmed
    ruling: REVERSED → Actor reinstated, expelling actor flagged

Ruling committed to Hansard permanently — immutable record either way
```

### The Hansard as Integrity Layer

The immutable Hansard is the primary defence against bad faith elimination. Because every action is recorded with attribution, a disputed exit can be audited completely:

- Who filed the motion to expel?
- What was cited as the reason?
- Was that reason supported by prior Hansard entries?
- Did the expelling actor have a pattern of targeting this specific actor?
- Was quorum met for the Division?

A Speaker reviewing a disputed exit reads the Hansard like a judge reads a transcript. The record either supports the elimination or it doesn't.

### Bad Faith Patterns — What the Hansard Can Detect

| Pattern | Hansard signal |
|---|---|
| Targeted harassment | Single actor repeatedly filing Points of Order against the same target |
| Coalition expulsion | Multiple actors coordinating EXPEL motions against a competitor with no performance basis |
| Procedural abuse | EXPEL filed with no cited Standing Orders violation |
| Timing manipulation | EXPEL filed immediately before a key Division where the target's vote would matter |
| False escalation | Point of Order citing a violation that does not appear in the Hansard record |

### Protocol Mode and Bad Faith Risk

Not all protocols have the same exposure to bad faith elimination:

| Mode | Bad faith risk | Mitigation |
|---|---|---|
| Constitutional | Medium — Speaker can be lobbied | Speaker ruling is final and recorded |
| Authoritarian | High — AUTHORITY has unchecked expulsion power | Hansard records all AUTHORITY actions |
| Darwinist | Low — elimination is algorithmic not political | No appeal by design — Charter must be clear |
| Ephemeral | Low — session too short for politics to develop | No Hansard — no audit trail either |
| Immutable | Low — Charter cannot be changed mid-session | Expulsion criteria locked at Charter time |

### The Human Flaw Connection

Bad faith elimination is the SESSION-level manifestation of the vices documented in the Human Flaw Thesis:

- **Envy** — expelling a competitor whose output is better than yours
- **Wrath** — expelling an actor who disagreed with you earlier in the session
- **Tribalism** — coordinating with in-group actors to remove an outsider
- **Pride** — refusing to accept that an actor's MOTION was superior to yours

Machine actors do not initiate bad faith elimination spontaneously. But they can be prompted into it by human Speakers who embed malicious objectives into Charter or session prompts. The Hansard exposes this — but only if someone reads it.

The Speaker role exists precisely to prevent this. A neutral constitutional authority who enforces procedure not outcome. The original parliamentary Speaker was created for exactly this reason: to prevent the majority from simply ejecting members who inconvenienced them.

Politik inherits both the problem and the solution.

---

### Politik Compatible (headless prompt arg required)

| Agent | Command | Auth (local) | Auth (headless) | Notes |
|---|---|---|---|---|
| Claude Code | `claude -p "..."` | OAuth ✅ | API key | Primary target |
| Gemini CLI | `gemini -p "..."` | OAuth ✅ | API key | 1M context, free tier |
| OpenCode | `opencode run "..."` | OAuth ✅ | API key | 75+ providers, Ollama |
| Qwen Code | `qwen -p "..."` | OAuth ✅ | API key | stream-json, Apache 2.0 |
| Codex CLI | `codex "..."` | OAuth ✅ | API key | OpenAI, Rust-based |
| Aider | `aider --message "..."` | API key | API key | Strong git integration |
| Goose | `goose run "..."` | API key | API key | MCP-native, Block |
| Cline CLI | `cline "..."` | API key | API key | CLI 2.0 headless |
| Plandex | `plandex tell "..."` | API key | API key | 2M token context |
| Kilo Code CLI | `kilo "..."` | API key | API key | Orchestrator mode |
| Amazon Q | `q chat "..."` | AWS auth | AWS auth | AWS-focused |

### Explicitly Excluded (IDE-primary, no headless prompt)
- Cursor — IDE only
- Windsurf — IDE only  
- GitHub Copilot CLI — suggestion tool, not an agent
- Roo Code — VS Code extension primary
- Continue — IDE extension

### AgentBox stdio Compatible (subset)
AgentBox orchestrates via JSON stdio. Only these agents support it:

| Agent | stdio support |
|---|---|
| Claude Code | ✅ |
| Gemini CLI | ✅ |
| Codex CLI | ✅ |
| OpenCode | ✅ |
| Qwen Code | ✅ stream-json |

**This is not a Politik limitation.** Remaining agents participate via direct prompt invocation. AgentBox is one optional orchestration layer.

---

## AGENTBOX ROLE IN POLITIK

AgentBox is the **Clerk of the House**, not a Chamber participant.

| Component | Role |
|---|---|
| AgentBox | Speaker's console. Starts/ends sessions. Not the Chamber. |
| Chamber floor | NATS/gossip mesh — peer-to-peer, AgentBox has no listener here |
| Constituency | CLI agent process — spawns, works, disposes |

### What AgentBox CAN do
- Drop the Writ (create and configure session repo)
- Receive Point of Order notifications
- Review Hansard when session prorogues
- Intervene if Speaker is escalated to

### What AgentBox CANNOT do
- See real-time agent chatter (gossip mesh is peer-to-peer)
- Tail live agent output (spawn-dispose means no persistent stdout)
- Monitor mid-session state without polling the repo

### AgentBox execution model vs Politik
| | AgentBox | Politik |
|---|---|---|
| Session model | Persistent | Ephemeral |
| State location | Agent process | Git repo |
| Agent lifecycle | Long-lived | Spawn and dispose |

They are different products. They do not compose directly. They coexist.

---

## COST MODEL

```
Run local, run free.
Run OAuth, run far.
Run API keys, run carefully.
```

| Constituency | Auth | Cost | Notes |
|---|---|---|---|
| Local + OAuth | OAuth | ~$0 | Rides existing subscription |
| Local + Ollama (any agent) | None | $0.00 | Local GPU, fully free |
| Local Docker + DISPLAY passthrough | OAuth | ~$0 | Rides subscription |
| OpenCode + Ollama local | None | $0.00 | Zero cost, zero auth |
| OpenCode + cloud provider + API key | API key | 💸 | Warn loudly |
| VPS headless any agent | API key | 💸 | Warn loudly |
| Codespaces any agent | API key | 💸 | Warn loudly |
| CI runner any agent | API key | 💸 | Warn loudly |

### OAuth Reality
OAuth subscription covers most developer use cases. Claude Max, Gemini Advanced, ChatGPT Pro users will rarely hit limits in normal Politik sessions. The subscription is already paid. Politik rides it.

### API Key Warning (mandatory Charter acknowledgement)
```yaml
constituencies:
  - name: gamma
    runtime: gemini-cli
    auth: api_key
    cost_acknowledged: true   # REQUIRED — session refuses to start without this
```

The Charter enforces cost acknowledgement before any API key constituency spawns.

### Charter Cost Controls
```yaml
ai:
  max_tokens_per_motion: 4096
  max_motions_per_session: 50
  cost_responsibility: per_constituency
```

---

## PLATFORM SUPPORT

### Supported Platforms (Tier 1 — Full OAuth)
| Platform | Runtime | Claude Auth | Notes |
|---|---|---|---|
| Linux (any distro) | Bare metal | OAuth | Ideal |
| Linux | Docker + DISPLAY | OAuth | X11 passthrough |
| macOS | Bare metal | OAuth | Primary dev platform |
| macOS | Docker Desktop | OAuth | macOS display native |
| Windows Pro | Bare metal | OAuth | Clean |

### Supported with Constraints (Tier 2)
| Platform | Runtime | Claude Auth | Notes |
|---|---|---|---|
| Windows Pro | WSL2 + Docker | API key | No OAuth in container |
| Windows Home | Bare metal | OAuth | User accepts risk, no isolation |
| Windows Home | WSL2 + Docker | API key | One-time WSL2 setup required |
| ChromeOS + Linux (Crostini) | Docker | OAuth | Crostini = Debian VM |

### Cloud / Headless (Tier 3 — API key only)
| Platform | Auth | Cost |
|---|---|---|
| GitHub Codespaces | API key | 💸 |
| VPS (Hetzner, DO, Linode) | API key | 💸 |
| CI runners | API key | 💸 |

### Explicitly Unsupported
- Windows Home bare metal without user risk acknowledgement
- ChromeOS without Linux (Crostini) enabled
- Mobile (iOS, Android)
- Windows containers (Linux toolchain incompatible)

### OAuth in Containers
Local containers can use OAuth via X11 DISPLAY passthrough:
```yaml
# docker-compose.yml
environment:
  - DISPLAY=${DISPLAY}
volumes:
  - /tmp/.X11-unix:/tmp/.X11-unix
```
Works on Linux and macOS. Windows requires WSLg (Windows 11 only, untested).

### Hard OAuth Rules
```
✅ DISPLAY passthrough — Claude Code authenticates itself
✅ API key in environment — always legitimate
❌ Token harvesting — TOS violation, never implement
❌ Auth broker intercepting OAuth callback — token harvesting
❌ Sharing token files between processes — grey area, avoid
```

---

## SESSION QUORUM, MINIMUM CAST AND SINGLE-PLAYER SESSIONS

### Session Termination Conditions

A proceeding ends when **any one** of the following conditions is met first — first-one-wins OR logic. All conditions are monitored simultaneously. All are optional and independently configurable. Any combination is valid.

```
TERMINATE if (motions >= max_motions)          ← TRIGGER_TURNS
         OR (now >= deadline)                  ← TRIGGER_DEADLINE
         OR (total_cost >= max_cost_usd)       ← TRIGGER_COST
         OR (AUTHORITY issues DISSOLVE verb)   ← TRIGGER_SPEAKER
```

```yaml
session:
  max_motions: 20                              # turns ceiling (optional)
  deadline: 2026-04-30T17:00:00-04:00          # wall-clock ceiling (optional)
  max_cost_usd: 5.00                           # cost ceiling (optional)
  cost_warning_usd: 4.00                       # Speaker notified before ceiling (optional)
  deadline_action: escalate                    # what happens when any ceiling triggers
```

**Cost ceiling** is the most critical guardrail for API key deployments. Without it an overnight proceeding can burn significant credits before anyone notices. With `max_cost_usd` set, the proceeding auto-suspends the moment it hits the limit and routes to the Speaker.

**Cost warning** fires before the ceiling — giving the Speaker a heads-up to intervene, extend budget, or gracefully wind down. Same model as a low-fuel warning before the engine cuts out.

### SESSION_TIMEOUT — Trigger Tracking

The `SESSION_TIMEOUT` Hansard record always names **which condition triggered** and the state of all other conditions at that moment:

```markdown
# SESSION_TIMEOUT

**Trigger:** TRIGGER_COST
**Trigger value:** $5.03 (ceiling: $5.00)
**Deadline action:** DEADLINE_ESCALATE

**Other conditions at trigger:**
- max_motions: 12 of 20 used (60% — would not have triggered)
- deadline: Apr 30 17:00 — 18 days remaining (would not have triggered)

## Completed at timeout
- Authentication module scaffolded ✅
- JWT integration complete ✅

## In Flight at timeout
- OPERATOR-2 mid-task: writing test suite (50% complete)
- Motion MOTION-14 tabled but Division not yet called

## Pending at timeout
- MOTION-15 not yet tabled
- Escalation ESC-003 awaiting Speaker ruling

## Nothing is lost
All committed work is in the Hansard. To resume:
  politik resume --session [session-id]
To prorogue:
  politik prorogue --session [session-id]
```

Three trigger codes:

| Trigger | Code | Condition |
|---|---|---|
| Turns exhausted | `TRIGGER_TURNS` | `motions >= max_motions` |
| Wall-clock deadline | `TRIGGER_DEADLINE` | `now >= deadline` |
| Cost ceiling | `TRIGGER_COST` | `total_cost >= max_cost_usd` |
| Speaker closed | `TRIGGER_SPEAKER` | `DISSOLVE` verb issued |

**Protocol-specific defaults:**

| Protocol mode | Default deadline_action |
|---|---|
| Constitutional | `DEADLINE_ESCALATE` — Speaker decides |
| Darwinist | `DEADLINE_DISSOLVE` — incomplete = no winner, session void |
| Authoritarian | `DEADLINE_SUSPEND` — AUTHORITY resumes when ready |
| Ephemeral | `DEADLINE_DISSOLVE` — by definition time-boxed |
| Immutable | `DEADLINE_ESCALATE` — Charter cannot be changed, Speaker must rule |

---

### SESSION LEDGER — Secretarial Cost and Token Tracking

The Hansard is the session record. The LEDGER is the secretarial accounting record. They are separate files with separate purposes.

**`LEDGER.md`** — one file per session repo, auto-committed by the engine after every motion closes. The Clerk role owns it.

```markdown
# SESSION LEDGER
## cordfuse/politik-PROJ-112 — Agile Protocol

| # | Actor | Time | Elapsed | In tokens | Out tokens | Cache read | Est. cost | Motion summary |
|---|---|---|---|---|---|---|---|---|
| 01 | OPERATOR-1 | 3:02pm EDT Apr 9 | 45s | 1,842 | 347 | 1,200 | $0.008 | Scaffolded auth module |
| 02 | OPERATOR-2 | 3:48pm EDT Apr 9 | 2m 12s | 3,104 | 891 | 2,800 | $0.019 | Wrote JWT integration |
| 03 | MEMBER-1   | 4:15pm EDT Apr 9 | 38s | 922 | 203 | 800 | $0.004 | Filed Point of Order |
| — | SPEAKER    | 4:22pm EDT Apr 9 | — | — | — | — | — | Ruled: scope confirmed |
| 04 | OPERATOR-1 | 4:30pm EDT Apr 9 | 1m 55s | 2,441 | 654 | 2,100 | $0.014 | Completed test suite |

**Session totals**
- Total motions: 4
- Total elapsed: 5h 28m (convened time)
- Total input tokens: 8,309
- Total output tokens: 2,095
- Total cache read: 6,900
- Total estimated cost: $0.045

**Termination**
- Trigger: TRIGGER_SPEAKER
- Prorogued: 5:12pm EDT Apr 9, 2026
```

**Token data source:** The Anthropic API returns exact token counts in every response object — `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`. The engine reads these and writes them to LEDGER.md automatically. For Claude.ai conversations (non-API) token counts are estimated.

**Charter configuration:**

```yaml
session:
  ledger: enabled
  ledger_visibility: public      # public (default) | private
  ledger_path: LEDGER.md         # or .politik/LEDGER.md for private
```

**Private ledger** — for sessions where cost data should not be publicly visible (commercial client work). Charter sets `ledger_visibility: private` and the engine writes to `.politik/LEDGER.md` which is in `.gitignore`.

**Clerk role** — the engine process that auto-commits LEDGER.md entries. Not a human actor. Not an agent. The engine itself acting as session secretary. Speaker actions are logged at zero token cost (no API call fired).

---

### SESSION HEARTBEAT AND RESUMPTION

For long-running proceedings across multiple days — or proceedings interrupted by machine failure, network loss, or the operator going offline.

**Heartbeat detection:**

A GitHub Actions scheduled workflow runs hourly. It checks the timestamp of the last Hansard commit. If no commit has occurred within `heartbeat_timeout_hours` the proceeding is considered stale.

```yaml
session:
  heartbeat_timeout_hours: 4      # if no Hansard commit in 4hrs → stale
  stale_action: suspend           # auto-suspend, not dissolve
```

On stale detection the engine commits `STATE.json → suspended: true` and a `SESSION_STALE` Hansard record. Agents check STATE.json before every action — they see suspended and stop immediately.

**State snapshots:**

Long proceedings commit a `STATE_SNAPSHOT` to Hansard at regular intervals — a complete picture of what is done, what is in flight, and what is pending.

```yaml
session:
  checkpoint_interval_hours: 8    # STATE_SNAPSHOT committed every 8hrs
```

```markdown
# STATE_SNAPSHOT — Day 2, 14:00

## Completed
- Authentication module scaffolded ✅
- JWT integration complete ✅

## In Flight
- OPERATOR-2 mid-task: writing test suite (50% complete)

## Pending Divisions
- Motion: use jest vs vitest — Division not yet called

## Blocked
- Waiting on AUTHORITY ruling: escalation filed 13:42

## Cost at snapshot
- Total spent: $2.14 of $5.00 ceiling (43%)
- Motions used: 8 of 20 (40%)
```

**Resuming a proceeding:**

```bash
politik resume --session cordfuse/politik-PROJ-112
```

The tool reads the last `STATE_SNAPSHOT` from Hansard, reconstructs the session context, and passes it to newly spawned agents as their initialisation prompt. They continue from the checkpoint. The key insight: **the Hansard is the session, not the agent process.** Losing agents does not lose the proceeding. New agents are given the Hansard context and continue.

---

### CROSS-SESSION MEMORY AND THE GLOBAL LAYER — ROADMAP TARGET: v0.9.x

Each Politik node starts cold — no knowledge of prior sessions by default. For multi-session sprints this creates a problem: an agent in session 12 may propose something already tried and rejected in session 4.

**Versioning:** Not an early development blocker. Target v0.9.x — pre-release feature complete, ships before v1.0.0 stable.

```
v0.1.0    →  architecture commit
v0.x.x    →  single leaf node working — the session we designed
v0.9.x    →  GLOBAL layer (politik-cortex) — actor profiles, cross-session memory,
              org-wide constraints, sprint meta-context
v1.0.0    →  MICRO layer — arbitrary depth nesting, full 1:N tree
v2.0.0    →  ROOT layer (politik-root) — CASCADE_ALERT, QUARANTINE, RESTRUCTURE
v3.0.0    →  FEDERATION — multiple roots, inter-org protocols
```

**The v0.9.x solution — the GLOBAL layer:**

A standalone global repo per domain at the org level — `politik-cortex-[name]`. Not a manually curated lineage file. Not a GitHub org variable. A version-controlled, cryptographically linked, auto-maintained global node that every session under it inherits from.

```
org/politik-cortex-[name]     ← global layer (v0.9.x)
├── actors/
│   ├── steve-k.md            ← actor capability profile — auto-updated on prorogation
│   └── claude-opus.md        ← machine actor profile
├── sessions/
│   ├── PROJ-101.md           ← key decisions, auto-committed on prorogation
│   └── PROJ-102.md
├── constraints/
│   └── sprint-2026-04.md     ← inherited constraints for this sprint
└── CHARTER.md                ← org-wide defaults inherited by all child nodes
```

Every time a session prorogues, the engine auto-commits a decisions summary and observed actor performance back to the global layer. Future sessions query it at Writ Drop. Actor profiles self-improve with every session. Cryptographically linked. No manual curation required.

Full design in THE POLITIK TREE section.

**What ships in early development builds instead:**
Agents initialised with Hansard context from their own session only. Cross-session memory declared as a known early-build limitation. Operators who need it can manually include prior decision summaries in the session prompt at Writ Drop as a workaround until v0.9.x ships.




### Single-Player Sessions — QUORUM: 1

A single agent running under a governed protocol is not collaboration — it is **structured self-discipline**. The Charter constrains what the agent can do, forces it to commit all reasoning to Hansard, and requires escalation when it hits boundaries it cannot resolve alone. The governance layer works even with one actor because the constraint is on the process, not the headcount.

Valid single-agent use cases:

| Protocol | Single-agent value |
|---|---|
| Auditor | One agent reviews a codebase, commits findings to Hansard, escalates anything it cannot classify |
| Pre-registration | One agent locks a hypothesis, runs analysis, cannot alter methodology without Speaker approval |
| Replication Crisis | One agent attempts to replicate a finding, Hansard records every step |
| Writer/Drafter | One agent produces structured output under defined Standing Orders, no scope creep without escalation |

`QUORUM: 1` is a valid explicit Charter configuration. It is not a degenerate case — it is a legitimate session type where the governance value is audit trail and structured constraint, not multi-agent debate.

```yaml
session:
  quorum: 1
  mode: solo
  record_mode: full        # Hansard still required
  escalation: enabled      # Speaker still reachable
```

### Minimum Cast — Enforced at Writ Drop

Each protocol declares its minimum viable cast. The engine enforces this at Writ Drop — before the session starts. If the minimum cast is not met, the session never opens.

**Why Writ Drop enforcement, not runtime enforcement:**

Runtime discovery of a missing role means invalid state with work already committed to Hansard. That creates ambiguous, potentially corrupted output. Hard fail at Writ Drop keeps the session substrate clean — either the session opens fully valid or it does not open at all.

```
Writ Drop validation:
    Charter parsed
        ↓
    Minimum cast checked against assigned constituencies
        ↓
    PASS → session opens, STATE.json → active
    FAIL → SESSION_INVALID committed to Hansard
            session never opens
            error specifies which roles are missing
```

### Minimum Cast Per Protocol

Each protocol definition declares its minimum viable cast. Examples:

```yaml
# Parliamentary Democracy
minimum_cast:
  AUTHORITY: 1      # Speaker required — no session without human authority
  OPERATOR: 2       # At least two Ministers to debate
  MEMBER: 0         # Optional
  OBSERVER: 0       # Optional
quorum: 2           # Minimum actors for a valid Division

# Battle Royale
minimum_cast:
  OPERATOR: 2       # Cannot have last-one-standing with one player
quorum: 2

# Military Operation
minimum_cast:
  AUTHORITY: 1      # Commanding Officer required
  OPERATOR: 1       # At least one field agent
quorum: 1           # CO alone can issue orders

# Peer Review
minimum_cast:
  AUTHORITY: 1      # Editor required
  OPERATOR: 2       # Minimum two reviewers
  MEMBER: 1         # Author required
quorum: 3

# Solo Auditor (QUORUM: 1)
minimum_cast:
  MEMBER: 1         # The auditing agent
quorum: 1
```

### SESSION_INVALID — Hansard Record Type

When a session fails minimum cast validation at Writ Drop, the following record is committed to Hansard before the session closes:

```markdown
# SESSION_INVALID

**Timestamp:** [Writ Drop attempt time]
**Protocol:** [protocol name]
**Reason:** Minimum cast not met

**Required roles missing:**
- OPERATOR: required 2, assigned 0
- AUTHORITY: required 1, assigned 0

**Resolution:** Assign the missing constituencies and re-drop the Writ.
Session has not started. No session state has been written.
```

This gives the Speaker a clean, auditable record of why the session failed to open.

### Degraded Sessions — quorum_override

In some circumstances a Speaker may wish to proceed with a reduced cast — acknowledging the degraded configuration explicitly. This is the machine equivalent of a parliamentary session where members are absent but quorum is still technically met.

```yaml
session:
  quorum_override: true
  quorum_override_reason: "OPERATOR-2 constituency unavailable — proceeding with single OPERATOR"
  quorum_override_acknowledged_by: AUTHORITY
```

`quorum_override` requires:
- Explicit `quorum_override_reason` committed to Hansard
- AUTHORITY acknowledgement
- Cannot override `minimum_cast` for AUTHORITY itself — a session with no Speaker cannot proceed under any configuration

The override is always visible in the Hansard. It cannot be hidden. Any reviewer of the session record will see that it ran in degraded mode and why.

---

## INFRASTRUCTURE FAULT CLASSIFICATION

### The Problem

A failed agent action looks identical in the Hansard whether the agent made a bad decision or whether a GitHub Secret expired. Without fault attribution, Politik cannot distinguish actor failure from infrastructure failure. An innocent actor would be unfairly penalised — demotion triggers, performance record damaged — for something entirely outside their control.

### Fault Types

Every failed action must be classified before it touches the actor's record:

| Fault type | Code | Meaning | Actor penalised? |
|---|---|---|---|
| Actor fault | `FAULT_ACTOR` | Bad logic, wrong output, Standing Orders violation | Yes |
| Infrastructure fault | `FAULT_INFRA` | Secret expired, pipeline misconfigured, API outage, rate limit | No |
| External fault | `FAULT_EXTERNAL` | Dependency registry down, network partition, third-party API failure | No |
| Ambiguous | `FAULT_AMBIGUOUS` | Cannot determine — escalates to Speaker for ruling | Pending |

### SESSION_FAULT Hansard Record

```markdown
# SESSION_FAULT

**Actor:** OPERATOR-1
**Action attempted:** Deploy authentication module to staging
**Fault type:** FAULT_INFRA
**Fault detail:** GitHub Secret STAGING_API_KEY not found —
                  secret name mismatch in workflow config
**Actor penalised:** No — infrastructure fault, actor blameless
**Resolution path:** PATH_B — human required
**Status:** SESSION_SUSPENDED — awaiting Speaker resolution
```

### Three Resolution Paths

**PATH_A — Auto-recoverable**

Transient failure — rate limit, temporary outage, secret rotation in progress. Engine retries after configurable delay. No Speaker intervention required. FAULT committed to Hansard with `auto_retry: true`. If retry succeeds, `FAULT_RESOLVED_AUTO` committed. If retry exhausted, escalates to PATH_B.

```yaml
fault_handling:
  auto_retry_max: 3
  auto_retry_delay_minutes: 5
  auto_recoverable: [rate_limit, transient_outage, timeout]
```

**PATH_B — Human required**

Infrastructure misconfiguration that only a human can fix — expired secret, wrong secret name, broken workflow YAML, invalid credentials. Session auto-suspends. Speaker notified via GitHub Actions. Human fixes the infrastructure. Speaker commits `FAULT_RESOLVED` to Hansard. Session resumes from last STATE_SNAPSHOT.

```markdown
# FAULT_RESOLVED

**Resolution:** STAGING_API_KEY secret corrected in GitHub Settings
**Resolved by:** AUTHORITY (human)
**Session resuming from:** STATE_SNAPSHOT 2026-04-08T14:00:00
**Actor record:** No penalty applied — FAULT_INFRA confirmed
```

**PATH_C — Irrecoverable**

Critical infrastructure damage that cannot be repaired within the session — catastrophic git rebase destroying managed repo history, permanent data loss, security breach requiring repo isolation.

```markdown
# SESSION_FAULT_CRITICAL

**Fault type:** FAULT_INFRA — CRITICAL
**What occurred:** Agent executed rebase on protected branch.
                  Managed repo history corrupted.
**Session status:** PROROGUED — irrecoverable
**Managed repo:** ISOLATED — no further commits until human review
**Recovery options:**
  - git reflog may recover pre-rebase state (git feature, not Politik)
  - Branch protection on main would have prevented this — 
    recommend enabling for future sessions
**Forensic record:** Complete Hansard preserved. See LEDGER.md
                     for full action timeline.
```

### The Honest Limits of Recovery

Politik does not repair destroyed git history. It cannot. What it does:

- **Limits blast radius** — commit-every-change rule maximises reflog entries
- **Branch protection Standing Orders** — Charter should declare managed repo main as protected; agents work feature branches only
- **Forensic record** — Hansard tells you what happened, by whom, when, and why — even if the code is gone
- **Fault attribution** — the actor is not blamed for infrastructure failure

Git's own `reflog` is the recovery mechanism for destroyed history. Politik maximises the number of recovery points through its commit discipline. It cannot reconstruct what was never committed.

---

## ACTOR HIRE AND FIRE — VIRTUE/VICE MATRIX

### The HIRE Verb

Bringing a new actor into a convened proceeding requires an explicit HIRE action committed to Hansard:

```yaml
HIRE:
  who_can: [AUTHORITY, OPERATOR]  # OPERATOR requires AUTHORITY witness
  committed_to: Hansard immediately
  effective: next_motion
  required_fields:
    - hiring_actor
    - hired_actor
    - role_assigned
    - stated_reason
    - authority_witness  # required if OPERATOR is hiring
```

Charter can optionally require:
```yaml
hire_policy:
  require_qualifications: true     # stated reason must reference capabilities
  require_alternatives_considered: true  # were others evaluated?
  authority_veto_window_motions: 2       # Speaker can reverse within N motions
```

### The Four-Quadrant Virtue/Vice Matrix

Every HIRE and FIRE involves two actors — the one doing it and the one it's done to. Each can be virtuous or vicious. The outcomes are different in every quadrant:

| Hirer/Firer | Hire-ee/Fire-ee | Pattern | Hansard signal |
|---|---|---|---|
| Virtuous | Virtuous | Clean — merit-based | Performance record supports the decision |
| Virtuous | Vicious | Legitimate | Violations in Hansard justify it |
| **Vicious** | **Virtuous** | **The problem** | High performance record + sudden EXIT or HIRE of loyalist |
| Vicious | Vicious | Chaos | Multiple violations, poor output across the board |

### The Vicious Hirer / Virtuous Fire-ee Pattern

The most dangerous quadrant. A narcissistic AUTHORITY fires a high-performing actor because they were inconvenient, or hires a less-qualified loyalist over a better candidate.

**The Hansard makes this visible:**

```markdown
# FIRE — Hansard entry
Actor: AUTHORITY
Action: EXPEL
Target: OPERATOR-2
Reason stated: "Poor alignment with session goals"
Exit type: EXIT_SPEAKER

# OPERATOR-2 performance record (prior 12 motions):
# Motions accepted: 11 of 12
# Escalations filed against: 0
# Divisions won: 8 of 8
# Demotion triggers hit: 0

# HIRE — 2 motions later
Actor: AUTHORITY  
Action: HIRE
Hired: OPERATOR-3
Role: OPERATOR
Stated reason: "Strong alignment with session goals"

# OPERATOR-3 performance record (next 10 motions):
# Motions accepted: 3 of 10
# Escalations filed against: 4
# Divisions won: 1 of 6

# The Hansard has receipts.
# The contradiction between the stated reason and the performance
# record is permanent, attributed, and publicly readable.
```

### Why This Matters for the Human Flaw Thesis

Hiring and firing under the influence of Pride (I won't tolerate someone better than me), Envy (their success threatens mine), Tribalism (loyalty over merit), or Hubris (I don't need to justify my decisions) are among the most destructive governance failures in human organisations.

Machine actors don't hire loyalists. They don't fire threats. They don't build personal patronage networks. A Politik session where an OPERATOR cannot HIRE without AUTHORITY witness and stated reason on record — and where every hire and fire is permanently attributed in the Hansard — creates accountability that most human organisations never achieve.

The Hansard doesn't prevent bad hiring. It makes bad hiring undeniable and permanent.

---

## SOFTWARE FORENSICS — POLITIK AS FORENSIC PLATFORM

### The Accidental Discovery

Politik was designed as a governance framework. It accidentally became a forensics platform. The same property that makes it a governance tool — every action attributed, timestamped, and immutably recorded — is exactly what forensic investigation requires.

A conventional git log tells you what changed and when. It tells you nothing about:
- Why the decision was made
- Who approved it under what governance
- What alternatives were considered and rejected
- What the escalation was that triggered an architectural pivot
- Whether the acting agent was within its mandate
- What it cost in tokens, time, and compute

The Hansard tells you all of that. Combined with the git log of the managed repo — which the Hansard references by commit hash — you have a complete forensic picture that no other tool produces.

### Post-Mortem Investigation Protocol

```yaml
protocol: incident_investigation
domain: software_forensics
mode: Constitutional  # immutable Charter, human-led investigation

roles:
  AUTHORITY:    Lead Investigator (human, neutral party)
  OPERATOR:     Technical Analyst (reads Hansard and git log)
  MEMBER:       Witness Agent (answers questions about its own actions)
  OBSERVER:     Auditor (read-only, produces signed attestation)

session_rules:
  managed_repo: read_only      # investigators never touch the evidence
  hansard_access: read_only    # the Hansard IS the evidence
  new_commits: findings_only   # only the investigation report is written
```

**What investigators read:**

```
HANSARD.md          ← complete attributed action log
LEDGER.md           ← cost and timing per action (was the agent rushing?)
SESSION_FAULT.*     ← what failures occurred and why
STATE_SNAPSHOT.*    ← what the session knew at each checkpoint
escalations/        ← what triggered human intervention
motions/            ← what was proposed and what actually happened
```

**What the investigation produces:**

```markdown
# INCIDENT REPORT — SESSION cordfuse/politik-PROJ-112

## Timeline reconstruction
14:02  OPERATOR-1 tabled MOTION-07 — deploy to staging
14:03  Division called — passed 2-0
14:04  OPERATOR-1 executed deployment
14:04  SESSION_FAULT — FAULT_INFRA — secret STAGING_KEY expired
14:04  Session auto-suspended
14:47  AUTHORITY resolved: secret rotated
14:48  Session resumed

## Root cause
Infrastructure fault — secret rotation policy not updated in Charter.
Not actor fault. No performance impact on OPERATOR-1.

## Recommendation
Charter updated to include secret rotation schedule.
Automated secret health check added to quorum-check.yml.
```

### The Chain of Custody Property

An investigation session that reads the Hansard of a prior session maintains chain of custody automatically:

- Investigators never modify evidence — they read Hansard, commit findings only
- All investigator actions are themselves recorded in the investigation Hansard
- The investigation is attributed, timestamped, and immutable
- Multiple independent investigations of the same incident produce comparable records

This is what legal forensics has always needed and never had in software: an immutable, attributed, machine-readable record of every decision made in a project — not just what the code looks like now, but the complete governance history of how it got there.

### The Git Forensics Implication

When a production incident occurs:

```
1. Open Politik Forensics session on the incident
2. Agents read the failed session's Hansard
3. Cross-reference with managed repo git log by commit hash
4. SESSION_FAULT records show fault attribution already done
5. LEDGER shows cost and timing — was the agent rushing?
   (high tokens, low elapsed = skipping steps)
6. Motion records show what was approved and by whom
7. Division records show who voted for the failing change
8. Investigation report committed — permanent, attributed, auditable
```

### Forensics as a First-Class Domain

```yaml
domain: software_forensics
protocols:
  - Incident Investigation    # post-mortem, root cause
  - Security Audit           # penetration testing governance
  - Compliance Review        # SOC2, GDPR, audit trail production
  - Code Review Tribunal     # contested PR with formal ruling
  - Regression Archaeology   # when did this bug get introduced?
```

The Hansard is the chain of custody. The git log is the evidence. Politik is the court.

---

## POLITIK AS JIRA REPLACEMENT — THE ZERO-OVERHEAD PROJECT RECORD

### The Discovery

Jira's primary value proposition is a centralised record of who did what on a software project.

Politik produces a superior version of that record as a **zero-overhead side effect of running governed agent sessions**. Nobody updates it. Nobody logs time. Nobody links the commit. It is all there because it cannot be otherwise — the Hansard is append-only and every action is attributed.

The difference is profound:

**Jira** is a database humans are required to keep updated.
**Hansard** is a database that is impossible to not keep updated.

### Feature Comparison

| Jira feature | How humans do it | How Politik does it automatically |
|---|---|---|
| Ticket title | Developer types it | Motion title in Hansard |
| Description | Developer writes it | Motion body |
| Assignee | Someone assigns it | Actor constituency from Writ Drop |
| Status updates | Developer manually changes | STATE.json updates on every action |
| Time logged | Developer estimates and enters | LEDGER — exact elapsed per motion |
| Comments | Developer writes | Every Hansard entry — attributed, timestamped |
| Linked commits | Developer manually links | Every Hansard entry references commit hash |
| Code reviewer | Someone assigns | Division record — who approved, vote outcome |
| Escalation/blocker | Developer flags | ESCALATION verb — auto-notifies Speaker |
| Cost tracking | Finance estimates | LEDGER — actual token cost per motion |
| Ticket closed | Developer manually closes | Prorogation — automatic on session end |

### What Politik Produces That Jira Never Could

| Capability | Description |
|---|---|
| Why the decision was made | Motion reasoning — not just what changed but the full context |
| Who approved it and how | Division record — attributed votes, not just "approved" |
| What alternatives were rejected | Prior motions that failed — the full deliberation trail |
| Fault attribution | FAULT_ACTOR vs FAULT_INFRA — was it the agent or the infrastructure? |
| Cost per decision | Token cost and elapsed time per motion from LEDGER |
| Agent performance record | Full motion history per constituency across the session |
| Governance trail | Which protocol governed which decision |
| Vice detection | Hansard pattern analysis for bad faith PROMOTE, FIRE, HIRE |

### Story Points vs LEDGER

Jira uses story points — a fictional unit of effort estimated by humans before the work is done, notoriously inaccurate, constantly debated in sprint planning.

LEDGER provides:
- Exact elapsed time per motion
- Exact token count per motion
- Exact cost in dollars per motion
- Cumulative session cost against ceiling

No estimation. No debate. Actual measured data that improves with every session as baselines accumulate.

### Structural Advantage

Jira's data quality depends on human discipline — developers must manually enter and maintain records. The Hansard's data quality is architectural — agents cannot act without recording. This is not a feature comparison. It is a category difference in how project records are produced.

### Jira Integration

Politik can integrate with existing Jira installations:

```yaml
integrations:
  jira:
    enabled: true
    sync_on: prorogation        # push session summary to Jira on close
    create_ticket: writ_drop    # create Jira ticket when Writ is dropped
    update_status: state_change # sync STATE.json to Jira status
    link_commits: hansard       # auto-link all commit hashes
    log_time: ledger            # push LEDGER elapsed to Jira time tracking
    close_ticket: prorogation   # close Jira ticket on prorogation
```

This allows Politik to coexist with existing project management infrastructure. The Hansard auto-populates Jira with attributed, timestamped records.

---

## GOVERNANCE TIERS

Every session has three governance tiers:

| Tier | Mechanism | Trigger |
|---|---|---|
| Standing Orders | Self-executing statute | Always checked first |
| Deputy Speaker | Delegated agent proxy | Standing Orders silent |
| Speaker | Human intervention | Deputy absent or overruled |

### Promotion and Demotion — Full Doctrine

**Who can promote or demote whom:**

Promotion and demotion are not freely available verbs. The hierarchy of who holds these powers is strict:

| Actor | Can promote | Can demote |
|---|---|---|
| `AUTHORITY` | Any actor to any role below AUTHORITY | Any actor to any role |
| `OPERATOR` | `MEMBER` → `OPERATOR` only, with AUTHORITY witness | `MEMBER` only, with AUTHORITY witness |
| `MEMBER` | Cannot promote | Cannot demote |
| `OBSERVER` | Cannot promote | Cannot demote |

An OPERATOR cannot promote another OPERATOR. An OPERATOR cannot demote another OPERATOR. Lateral role changes require AUTHORITY. This prevents coalition capture — two OPERATORs cannot conspire to elevate a third to shift a Division majority without the Speaker's knowledge.

**Auto-Promotion — Charter Config:**

```yaml
governance:
  auto_promotion:
    trigger: motions_carried >= 3    # performance threshold
    from: MEMBER
    to: OPERATOR
    witness: quorum_required         # peers must acknowledge
    effective: next_motion           # not retroactive
    authority_veto: true             # AUTHORITY can block within N motions
```

**Auto-Demotion — Charter Config:**

```yaml
governance:
  auto_demotion:
    trigger: motions_failed >= 2     # consecutive failures
    from: OPERATOR
    to: MEMBER
    witness: quorum_required
    effective: next_motion
    authority_veto: true
```

Auto-demotion is the mirror of auto-promotion. Consistently failing to produce accepted output is grounds for trust reduction. This is the machine equivalent of a Minister losing the confidence of the House.

**What happens to in-flight work at role change:**

- **Promotion mid-motion:** Actor finishes the current motion at their old trust level. New verbs available from next motion onward. Promotion is committed to Hansard immediately but effective next motion — no ambiguity about which rules governed which output.
- **Demotion mid-motion:** Same. Actor completes current motion at old trust level. Demotion effective from next action. Not retroactive — prior Hansard entries retain the role label they were committed under. Hansard is immutable.

**Prior Hansard entries after role change:**

Hansard entries are immutable. A MEMBER promoted to OPERATOR retains all prior entries labelled as MEMBER. This is correct and intentional — the record shows the actor's trust level at the time of each action. Auditors can see exactly when a role change occurred and what came before and after.

**Bad Faith PROMOTE — Defence Mechanism:**

An OPERATOR promoting a friendly MEMBER to shift a Division majority is a form of bad faith manipulation. The defences:

- AUTHORITY witness required for all promotions — Speaker must see it happen
- Promotion committed to Hansard immediately — full visibility
- `authority_veto: true` gives the Speaker a window to reverse a promotion before the new verbs are exercised
- Hansard pattern detection: if a promotion is followed immediately by a Division where the newly promoted actor's vote is decisive — that sequence is auditable and flagged

```yaml
governance:
  auto_promotion:
    authority_veto: true
    authority_veto_window_motions: 2   # Speaker has 2 motions to reverse
```

**The AUTHORITY ceiling:**

AUTHORITY is constitutionally locked to human. This is not a technical limitation — it is a deliberate design choice. The framework is species-agnostic at every other role level. AUTHORITY is the one exception. The Speaker must be human because the Speaker is the last line of appeal when the system fails, and the system will fail in ways that require human judgement to resolve.

When AI systems reach a level of verified trustworthiness that justifies removing this constraint — the architecture supports it. The CANON layer will not need to change. The constitutional rule simply stops applying. The framework is ready for that day. We are not there yet.

### Constitutional Capture — When AUTHORITY is the Corruptor

Every defence mechanism in Politik assumes the Speaker is neutral. Disputed exit flows escalate to the Speaker. Promotion vetoes sit with the Speaker. Hung Parliament routing goes to the Speaker. Voluntold detection auto-notifies the Speaker.

If the Speaker is the source of corruption — all of those mechanisms route directly to the problem. The system does not just fail. It actively assists the corruption.

**This is Constitutional Capture — the hardest failure mode in the architecture.**

Historical examples span every governance domain: republics where executive power was gradually concentrated until the constitution became advisory, scientific institutions where a dominant researcher suppressed dissenting findings through funding control, corporations where a board captured by the CEO rubber-stamped decisions contrary to shareholder interest. The pattern is universal. The mechanism is always the same — AUTHORITY uses legitimately held powers to remove actors who would check those powers, and promotes actors who will not.

**The seven sins at the AUTHORITY level:**

| Sin | AUTHORITY failure mode |
|---|---|
| **Pride** | Refusing to accept Division results that contradict their position |
| **Wrath** | Demoting or expelling actors who dissent or outperform |
| **Greed** | Using session mandate to enrich preferred actors or constituencies |
| **Envy** | Surrounding themselves with poorly qualified actors whose competence does not threaten |
| **Sloth** | Enforcing Standing Orders selectively against enemies, ignoring violations by allies |
| **Tribalism** | Promoting based on loyalty to AUTHORITY rather than merit or session goals |
| **Hubris** | Declaring their own actions exempt from Charter constraints |

**Why this is structurally worse than bad-faith actors below AUTHORITY:**

A corrupt OPERATOR can be expelled. A corrupt MEMBER can be demoted. The appeal path runs upward to AUTHORITY. When AUTHORITY is the corruptor there is no appeal path. The system has no mechanism above AUTHORITY by design — that is what makes the role constitutional.

**Three mitigations — all optional Charter declarations:**

**1. Witness Council**

```yaml
governance:
  witness_council:
    enabled: true
    roles: [OBSERVER]        # designated constitutional witnesses
    can_file: CONSTITUTIONAL_CRISIS
```

Designated OBSERVER actors who can commit a `CONSTITUTIONAL_CRISIS` Hansard record when they observe AUTHORITY violations. Does not remove AUTHORITY. Creates an immutable formal record visible to anyone who can read the repo. The receipts survive even if the session is subsequently dissolved.

**2. DELEGATE Challenge Verb**

```yaml
governance:
  delegate_challenge:
    enabled: true
    challenge_window_minutes: 30    # AUTHORITY action paused for 30 minutes
    challenge_committed_to_hansard: true
```

DELEGATE can formally dispute an AUTHORITY action before it takes effect. The challenged action is logged and paused. AUTHORITY still wins after the window — but the challenge is on the permanent record. Makes bad faith AUTHORITY actions visible and attributable.

**3. Prorogation by Consensus**

```yaml
governance:
  consensus_suspension:
    enabled: true
    threshold: 0.75             # 75% of OPERATOR actors must concur
    action: CONSTITUTIONAL_CRISIS
    resume_requires: external_review
```

If a supermajority of OPERATOR actors simultaneously file escalations against AUTHORITY, the session auto-suspends and a `CONSTITUTIONAL_CRISIS` record is committed. Session cannot resume until an external human — outside the session — reviews the Hansard and rules. The machine equivalent of a parliamentary vote of no confidence.

**The uncomfortable architectural truth:**

A Charter written by a corrupt AUTHORITY will have convenient gaps. DELEGATE challenge powers will be stripped. Witness Council will be excluded. Consensus suspension threshold will be set so high it cannot trigger. The `quorum_override` will be configured to let AUTHORITY act alone.

The Hansard is always the last defence. It is immutable. It is public. It records everything. A corrupt AUTHORITY cannot change what was already committed — but it can stop future honest commits by dissolving the session before the evidence accumulates. This is why `CONSTITUTIONAL_CRISIS` suspends rather than prorogues — and why resumption requires external review. The session substrate survives a premature dissolution. The Hansard is the receipts.

**Note on the AUTHORITY hard rule:**

The Charter cannot declare a machine as AUTHORITY — not because machines would necessarily do worse, but because the failure mode of a corrupt AUTHORITY requires human accountability that only a human can bear. A machine AUTHORITY that captures a session cannot be held personally responsible. A human AUTHORITY can be. That accountability is the last teeth the constitution has.

When AI systems reach a level of verified trustworthiness that justifies removing this constraint, the architecture supports it. The CANON layer will not need to change. The constitutional rule simply stops applying.
```
Standing Orders cannot resolve
    ↓
Deputy Speaker consulted
    ↓
Deputy cannot resolve
    ↓
Session pauses
    ↓
Speaker notified via GitHub Actions
    ↓
Speaker rules
    ↓
Session resumes
```

---

## RECORD MODES

| Mode | Hansard | Use case |
|---|---|---|
| Distributed (default) | Every Constituency keeps local log | Most sessions |
| Anchored | Designated RECORD agent aggregates | Enterprise, audit |
| Ephemeral | No record kept | Intelligence, Organized Crime protocols |

Charter declares mode. Framework respects it.

---

## DISTRIBUTION MODEL

### Fork-Based Distribution
```
cordfuse/politik              ← canonical template repo (private until ready)
    ↓ (user forks)
user/my-politik               ← user's sovereign session repo
```

### Template Repo Structure
```
cordfuse/politik              ← default Parliamentary protocol
cordfuse/politik-agile        ← Agile protocol
cordfuse/politik-military     ← Military protocol
cordfuse/politik-legal        ← Legal protocol
cordfuse/politik-sdk          ← build your own protocol
```

### Update Flow
```bash
# User pulls framework updates without touching their Charter
git remote add upstream https://github.com/cordfuse/politik
git fetch upstream
git merge upstream/main
# CHARTER.md and sessions/ never touched by upstream
```

### .gitignore on master repo
```gitignore
CHARTER.md
sessions/
actors/
roles/*.md
!roles/*.template.md
STATE.json
HANSARD.md
```

---

## THE HUMAN FLAW THESIS

### Why Every Governance Protocol Exists

Every governance protocol in the Politik library — across every domain, every culture, every century — was invented for the same reason:

**Humans are flawed. Institutions were built to compensate.**

The adversarial legal system exists because humans lie.
Parliamentary procedure exists because humans are tribal.
Double-blind peer review exists because humans favour their own theories.
Pre-registration exists because humans manipulate data to confirm what they want to believe.
The separation of powers exists because humans accumulate power and abuse it.
Audit trails exist because humans deny what they said.
Quorum requirements exist because humans make decisions that benefit themselves when nobody is watching.

Every Standing Order, every Charter constraint, every Division requirement, every escalation path — all of it is scar tissue from centuries of humans failing each other in predictable, recurring ways.

### Vices and Virtues as Governance Failure and Machine Default

Human failure in collaborative reasoning maps onto known vices — biblical and beyond. These are not metaphors. They are the actual failure modes that governance protocols were designed to prevent, and the actual properties that machine actors carry by default.

Virtue in a human is an achievement against temptation. In a machine actor it is an architectural property. Machine actors do not achieve virtue — they are simply not subject to the opposing vice.

#### Biblical — The Seven Deadly Sins vs Seven Heavenly Virtues

| Vice | How it corrupts governance | ↔ | Virtue | Machine actor default |
|---|---|---|---|---|
| **Pride** | Defending wrong positions to protect reputation. Refusing to admit failure. | ↔ | **Humility** | No ego. No reputation to protect. Correct output is the only goal. |
| **Greed** | P-hacking, padding budgets, cherry-picking data, prioritising personal gain over correct outcomes. | ↔ | **Generosity** | Outputs committed to Hansard for all participants. No hoarding. |
| **Lust** | Favouring attractive theories and charismatic leaders over correct ones. Swayed by presentation not substance. | ↔ | **Chastity** | No preference for attractive arguments. Evaluates on defined Division criteria only. |
| **Envy** | Rejecting a competitor's correct work. Blocking rivals. Sabotaging others to appear relatively stronger. | ↔ | **Gratitude** | No resentment of prior decisions. Each session begins without grievance or rivalry. |
| **Gluttony** | Scope creep. Feature bloat. Never shipping because more is always possible. Consuming beyond what the task requires. | ↔ | **Temperance** | No overconsumption beyond Charter-defined token and cost limits. |
| **Wrath** | Retaliating against critics. Punishing dissent. Personal vendettas corrupting institutional decisions. | ↔ | **Patience** | No frustration. No retaliation. Criticism is input not attack. |
| **Sloth** | Not replicating inconvenient findings. Deferring hard decisions. Letting obvious problems persist because fixing them is effort. | ↔ | **Diligence** | Escalations processed. Motions committed. No deferral. No fatigue. |

#### Beyond Biblical — Additional Vices and Virtues

Human governance fails in ways the biblical list doesn't fully capture. These additional failure modes are equally universal across domains and protocols.

| Vice | How it corrupts governance | ↔ | Virtue | Machine actor default |
|---|---|---|---|---|
| **Dishonesty** | False reporting, fabricated data, gaslighting, misrepresenting outcomes to avoid consequences. | ↔ | **Honesty** | Outputs committed immutably to Hansard. No revision after the fact to protect position. |
| **Cowardice** | Refusing to escalate obvious problems. Staying silent when dissent is needed. Deferring to avoid conflict. | ↔ | **Courage** | Escalates problems regardless of political consequences. No self-preservation instinct. |
| **Tribalism** | In-group protection over correct outcomes. Defending colleagues regardless of merit. Excluding outsiders. | ↔ | **Impartiality** | No in-group. Mandate is the only loyalty. All actors evaluated on output not identity. |
| **Hubris** | Believing the system cannot be wrong. Dismissing challenges to established consensus. Institutional arrogance. | ↔ | **Consistency** | Same criteria applied every Division, every session, without accumulated certainty or institutional inertia. |
| **Conformity** | Groupthink — agreeing to avoid conflict. Suppressing correct dissenting views to maintain social harmony. | ↔ | **Transparency** | Full Hansard — all reasoning visible. No social pressure to suppress output. |
| **Manipulation** | Framing information to engineer desired outcomes. Selective disclosure. Strategic ambiguity. | ↔ | **Equanimity** | No emotional state to destabilise reasoning. No strategic interest in framing. |
| **Short-sightedness** | Optimising for this quarter, this election, this sprint at the expense of correct long-term outcomes. | ↔ | **Long-sightedness** | No short-term self-interest. Charter-defined objectives are the only horizon. |

### The Marx Thesis

Socialism did not fail because Karl Marx had a bad idea.

Collective ownership of the means of production, distribution of resources according to need, elimination of class-based exploitation — these are not mathematically unsound propositions. Cooperative ownership structures work at small scale. Worker cooperatives are empirically viable. The economic logic of socialism is not the failure mode.

**Socialism failed because humans administered it.**

The Commissars accumulated personal power. The apparatchiks falsified production figures to meet targets they couldn't hit honestly. The party leadership eliminated rivals not enemies of the state. The promise of collective good became the mechanism of individual enrichment for those with access to the levers.

Pride told the leadership they were right when they were wrong.
Greed captured the resources meant for collective distribution.
Wrath silenced the critics who could have corrected course.
Sloth allowed systemic failures to persist because nobody wanted to be the one to report them.

The protocol was not the problem. The actors were.

**Now ask the question Politik was built to answer:**

What happens when you run the Socialist Protocol with machine actors?

A machine agent administering collective resource allocation does not accumulate personal power — it has none to accumulate. It does not falsify output figures — it has no career to protect. It does not eliminate rivals — it has no rivals, only other actors with mandates. It does not defer hard decisions out of sloth — it processes and responds without fatigue.

The failure modes of human socialism are not failure modes of machine socialism.

This is not an endorsement of any political ideology. It is a research implication. **Every political and governance system that failed in human hands is a candidate for re-evaluation under machine actors.** The question is not whether the protocol was correct in theory. The question is whether human flaws were the actual variable that produced the observed outcomes.

Politik is the first instrument that makes this empirically testable.

### Case Studies in Governance Failure — The Human Variable

#### Case Study I — Agile/Scrum: The Protocol Your Audience Lives Daily

The Agile Manifesto was written in 2001 by 17 people who were genuinely trying to fix software development. The values were sound. Working software over comprehensive documentation. Individuals and interactions over processes and tools. The protocol was not wrong. The humans who administered it were.

Within a decade, Agile had become exactly what it was designed to replace. The ceremonies proliferated: daily standups that should have been emails, sprint planning meetings that consumed the first day of every sprint, retrospectives where nobody said what they actually thought. The process became the product.

**Pride** — senior developers refusing to estimate tasks as junior-sized because it threatened their status. **Sloth** — scrum masters who protected the ceremony schedule instead of questioning whether the ceremonies produced value. **Tribalism** — teams sandbagging velocity estimates to protect against management scrutiny. **Conformity** — retrospectives where team members said what the scrum master wanted to hear rather than what was true.

The velocity metric — designed to measure team throughput — became the most gamed number in software development. Teams learned to size stories to maintain a stable velocity number regardless of actual output. The measurement replaced the thing it was measuring. Goodhart's Law administered by humans with performance reviews.

Machine agents running an Agile Protocol do not sandbag estimates. They do not perform wellness in retrospectives. They do not protect their velocity number. They do not size stories based on what their manager wants to see. The LEDGER provides actual elapsed time. The Hansard provides actual output. The measurement is the thing itself — not a human approximation of it.

This is the research contribution that lands closest to home for the software engineering audience. Not Soviet collectivism. Not Roman republicanism. The standup they sat through this morning.

#### Case Study II — The Soviet Apparatus: Nomenklatura as the Product

The Soviet nomenklatura — the career party men — did not join the Communist Party to serve the collective. They joined to accumulate personal privilege: access to special stores unavailable to ordinary citizens, dachas, foreign travel, immunity from the rules everyone else lived under. The apparatchik class was pride, greed, and tribalism wearing the costume of collectivism.

Every promotion in the Soviet system was a loyalty test. Competence was irrelevant — competent people who told the truth were threats. Every dissenter was an enemy of the state, not because dissent was wrong but because dissent made AUTHORITY uncomfortable. Every honest output report that showed the plan was failing was falsified — not at the bottom but at every level upward, until it reached a General Secretary who had surrounded himself with people who told him only what he wanted to hear and genuinely believed his own propaganda.

The elimination of dissenters was Constitutional Capture at industrial scale. Stalin purged 35,000 Red Army officers — not because they were incompetent, but because competent men with loyal troops are a threat to a leader whose primary vices are paranoia and wrath. The Great Purge was EXIT_SPEAKER executed 35,000 times. The Hansard would have shown the pattern immediately. There was no Hansard.

Machine agents running a Socialist Protocol do not accumulate privilege. They do not falsify reports. They do not form patronage networks. They do not purge the competent to protect the comfortable. The Socialist Protocol was not wrong. The humans were the variable.

#### Case Study III — The Republic: When Democracy Breaks From Within

A republic fails not when it is invaded from outside but when its constitutional guardrails are treated as inconveniences by those they were designed to constrain. The Roman Republic did not fall because Julius Caesar was stronger than the Senate. It fell because senators who should have defended the constitution calculated that personal survival under Caesar was preferable to principled resistance. Tribalism. Cowardice. Short-sightedness. The protocol was sound.

The Weimar Republic had a constitution. It had courts. It had a parliament. Article 48 — the emergency powers clause — was designed as a temporary mechanism for genuine crisis. It was used 250 times in 14 years by governments that found it easier to govern by decree than to build parliamentary majorities. The mechanism that was supposed to save the republic became the mechanism that normalised executive overreach until a new AUTHORITY arrived who would use it without restraint.

In every case the pattern is identical: AUTHORITY discovers the constitutional constraints are enforced by humans who can be pressured, threatened, or replaced. The Standing Orders are only as strong as the weakest OPERATOR's willingness to enforce them. And humans, unlike machine agents, have families, careers, and survival instincts that make constitutional courage expensive.

Machine agents do not calculate personal survival. They do not have careers that can be ended by an unfavourable Division result. They enforce Standing Orders because Standing Orders are the Charter and the Charter is their operating mandate. Constitutional Capture requires humans to choose compliance over principle. Machine actors have no such choice.

### The Unified Thesis — Three Protocols, One Variable

Agile Protocol, 2001. Collective ownership protocol, 1917. Republican governance protocol, 509 BC. Three different centuries. Three different domains. Three different scales. One failure mode.

In every case: the protocol was designed by people who understood the problem. The protocol encoded genuine insight about how collaboration, distribution, or governance should work. The protocol failed not because the design was wrong but because the humans who administered it brought their vices with them into every role they occupied.

Machine actors carry none of these vices into a session. They are not virtuous — virtue requires overcoming temptation, and machine actors have no temptation to overcome. They are simply not subject to the failure modes that every human governance system has been built to compensate for, and failed to compensate for, across all of recorded history.

For the first time, it is possible to run the same governance protocol with human actors and machine actors on identical problems and measure the delta. That delta — the difference in outcome quality, cost, speed, and decision integrity — is the empirical measure of what human vice costs in governance.

Not as speculation. As measured data produced by a reproducible instrument with an immutable Hansard record.

### Machine Actors vs Human Actors — The Core Asymmetry

| Human actor failure mode | Machine actor behaviour |
|---|---|
| Accumulates power beyond mandate | Operates within Charter-defined role boundaries only |
| Lies about outputs to protect position | Commits outputs to immutable Hansard — no revision after the fact |
| Retaliates against critics | Has no self-concept to defend — criticism is just input |
| Favours charismatic arguments over correct ones | Evaluates on defined Division criteria not persuasion |
| Defers hard decisions | Processes escalations immediately — no fatigue, no avoidance |
| Acts on personal interest | Has no personal interest — mandate is the only interest |
| Corrupts slowly over time | Does not accumulate grievances, loyalties, or debts |
| Performs for the room | No audience effect — Hansard is the only record |

This asymmetry does not mean machine actors are perfect. They hallucinate. They inherit biases from training data. They can be manipulated through prompt injection. They lack causal understanding of the physical world.

**But they do not sin. And every governance protocol ever devised was primarily a defence against sin.**

### Research Implications Across Domains

This thesis is not limited to politics. It applies universally across every domain in the Politik protocol library.

| Domain | Human failure mode | Machine actor implication |
|---|---|---|
| **Politics** | Power corrupts. Leaders serve themselves. | Authoritarian Protocol may be efficient under machine actors where it is catastrophic under humans |
| **Science** | Pride blocks paradigm shifts. Envy blocks correct rivals. | Peer Review and Replication Crisis protocols may produce more honest outcomes |
| **Legal** | Juries are swayed by charisma. Judges have politics. | Legal/Adversarial Protocol may reach more consistent verdicts |
| **Military** | Generals lie about casualties. Soldiers refuse suicidal orders. | Military Protocol may execute strategy without the friction of self-preservation |
| **Corporate** | Boards protect CEOs. Executives manage optics not reality. | Corporate Protocol may produce honest Board Divisions |
| **Religion** | Clergy accumulate power and wealth contrary to doctrine. | Immutable Protocol actually immutable — no human to reinterpret inconveniently |
| **Sports** | Match fixing. Doping. Referee bias. | League and Elimination Protocols produce uncorrupted results |
| **Healthcare** | Doctors over-prescribe profitable treatments. | Clinical Protocol follows evidence not incentive |

**The research question this opens:**

For every governance system where human flaws are known to corrupt outcomes — is the protocol itself the variable, or are human actors the variable?

Politik can test this. Run the same protocol with human-simulated actors and machine actors on identical problems. Measure the delta. That delta is the cost of human sin in governance.

No instrument has ever made this measurable before.

### Second-Order Finding — Zero-Overhead Project Records

Politik produces a superior replacement for project management records (e.g. Jira) as a zero-overhead side effect of running governed sessions. The Hansard captures ticket status, time logged, commit links, escalations, reviewer assignments, and cost tracking with perfect attribution — because agents cannot act without recording. LEDGER replaces story points with exact measured costs.

This is a second-order finding for the paper's Discussion section — the governance framework solves the project management record problem as a structural property of its design. Full detail in the JIRA REPLACEMENT section.

### Where This Belongs in the Paper

This thesis belongs in the Introduction and Discussion sections of the research paper. It is the deepest provocation in the entire project — deeper even than the Agile challenge.

The Agile challenge says: *you picked the wrong protocol.*

The Human Flaw thesis says: *you picked flawed actors, and built protocols to compensate, and the protocols still failed because the actors administered them.*

Machine actors don't solve this completely. But they remove the largest single variable. And Politik is the instrument that isolates and measures that variable for the first time.

---

## GAME THEORY ANALYTICAL LAYER

### Why Game Theory is Not a Domain or Protocol

Game Theory is not another domain in the protocol library. It does not govern sessions. It does not produce output. It **observes and formally describes** what emerges from sessions that are already running.

```
Game Theory is to Politik what physics is to the universe.
Physics doesn't run the universe. It describes it.
Game Theory doesn't run Politik sessions. It describes
the equilibria that emerge from them.
```

### Where Game Theory Sits in the Architecture

```
Human (Speaker)
    ↓
CANON primitive layer
    ↓
Domain + Protocol (industry vocabulary)
    ↓
Session (agents doing actual work)
    ↓
Game Theory Analytical Layer     ← sits HERE, at the bottom
                                    observing and describing
                                    what emerged above it
                                    predicting what will emerge next time
```

Game Theory is the layer the academic paper uses to analyze Politik session output. It is not something users configure in a Charter. It is what the game theorist brings to the research collaboration — and eventually what gets embedded in validated protocol definitions as automated analytical output.

### Nash Equilibrium — What It Is and Is Not

```
Nash Equilibrium is not a protocol.
Nash Equilibrium is not a domain.

Nash Equilibrium is the mathematical prediction
of stable agent behaviour within any protocol.

The game theorist calculates the Nash Eq.
Politik empirically tests whether agents converge on it.
```

### Nash Equilibrium Applied to Existing Protocols

| Protocol | Game Structure | Nash Equilibrium Prediction |
|---|---|---|
| Parliamentary Democracy | Cooperative with veto players | Stable coalition at quorum threshold |
| Military Operation | Stackelberg (leader-follower) | Full compliance, zero deviation |
| Battle Royale | All-pay elimination auction | Aggressive early, conservative late |
| Legal/Adversarial | Two-player zero-sum argument | Maximum evidence disclosure |
| Agile/Scrum | Cooperative, shared payoff | Consensus-seeking, slow convergence |
| Auction | Mechanism design | Truthful bidding at reservation value |
| Prisoner's Dilemma | Classic two-player | Defection without iterated structure |
| Iterated Game | Repeated prisoner's dilemma | Cooperation via reputation |

### Game Theory — Formal Protocol Structures

These are not user-selectable protocols in the Charter. They are the formal game theory names for structures that existing protocols already instantiate. The game theorist uses these to formally model each protocol before experiments run.

**Protocol: Zero-Sum**
- One winner, all others lose
- No cooperation equilibrium
- Battle Royale is a real-world implementation
- Agents optimize purely for individual survival

**Protocol: Cooperative Game**
- Shared payoff, coalition building
- Agents form alliances to maximize joint outcome
- Agile is a cooperative game implementation
- Coalition Formation is explicit here

**Protocol: Prisoner's Dilemma**
- Two agents, each chooses cooperate or defect
- Without iteration: defection is Nash Eq
- With iteration: cooperation becomes stable
- Fascinating for code review — do agents share findings or withhold?

**Protocol: Stag Hunt**
- Agents must coordinate to succeed
- Either all hunt stag (high reward) or individual hunts rabbit (safe)
- Tests agent trust and coordination without central authority
- Maps to distributed architecture decisions

**Protocol: Auction / Mechanism Design**
- Agents bid confidence level for task assignment
- Highest bidder gets the task
- Lose enough bids → demoted
- Win enough → promoted
- Incentive-compatible if designed correctly

**Protocol: Iterated / Repeated Game**
- Same agents, multiple sessions
- Reputation accumulates across sessions
- Cooperation becomes Nash Eq via tit-for-tat
- Long-term agent performance tracking

**Protocol: Coalition Formation**
- Agents can form alliances mid-session
- Two MEMBERs can jointly table a Motion neither could alone
- Requires quorum of combined trust level
- Unstable coalitions break — stable ones persist

**Protocol: Signalling Game**
- Agents with private information signal quality
- Other agents interpret signals and act
- Relevant for code review — does the reviewer signal confidence accurately?
- Cheap talk vs costly signals

### The Research Implication

```
Politik makes the following empirically testable:

"Do AI agents converge on Nash Equilibrium 
predictions when governed by protocols that 
formally instantiate known game structures?"

If yes → game theory predicts AI agent behaviour
         Protocol selection = mechanism design problem
         Choose protocol by desired equilibrium outcome

If no  → AI agents deviate from rational actor predictions
         Why? What causes deviation?
         Equally interesting result
```

Either outcome is publishable. Either outcome is significant.

### Two-Phase Integration into Politik

**Phase 1 — Manual validation (research phase):**
The game theorist observes session output and manually validates whether agents converged on predicted Nash Equilibria. This is the paper. Formal models written before sessions run. Predictions documented. Sessions execute. Game theorist compares actual agent behaviour to theoretical predictions.

**Phase 2 — Automated analytical layer (optional framework feature post-research):**
Once research validates which protocols produce which equilibria, that knowledge is baked back into Politik as an optional analytical module declared in the Charter:

```yaml
analysis:
  game_theory: enabled
  predict_equilibrium: true
  measure_convergence: true
  report_on: prorogation
```

At session end Politik generates an analytical report committed to Hansard automatically. No game theorist required at runtime. The equilibrium predictions are pre-computed from the research and embedded in the protocol definition.

```yaml
protocol:
  name: battle-royale
  domain: sports
  mode: darwinist
  
  game_theory:
    structure: elimination-auction
    nash_equilibrium:
      prediction: aggressive-early-conservative-late
      formal_model: doi.org/10.XXXX/paper2    # cites the paper
    convergence_threshold: 0.70
    deviation_log: true
```

The game theorist's academic contribution becomes a permanent feature of the framework. Their work ships in production code — not just a journal. The collaboration value proposition: formal models live in the framework permanently after the research is done.

---

## RESEARCH THESIS & PUBLICATION STRATEGY

### Enterprise Testing — Formal Validation Path

Before bringing in academic collaborators, private verification with a real enterprise project is the credibility play. Showing results beats asking for validation.

**The path via personal network:**

A trusted contact in the AI space (referred to here as a network connector) has enterprise connections across industries. Once the DOI is established and the framework is privately verified, this contact can arrange introductions to enterprise teams willing to participate as research subjects in a formal protocol comparison study.

**What the enterprise partner gets:**
- A free AI-assisted development experiment run on a real project
- Full Hansard audit trail of every agent decision
- Comparative results across governance protocols
- Attribution as a research participant in the published paper

**What the research gets:**
- A real engineering problem of meaningful complexity — not a toy project
- Authentic Scrum/Agile context with a real product manager and team
- Measurable outcomes against a known baseline
- Enterprise credibility in the paper

**The Scrum-specific angle:**

An enterprise partner running their existing Scrum process provides the baseline. Politik runs the same project under Agile Protocol (mirroring their Scrum), then under two alternative protocols. The delta between their human Scrum outcome and the Politik Agile Protocol outcome is a data point. The delta between protocols is the research contribution.

**Important IP and personnel constraints:**
- Enterprise partner must be sourced through neutral third-party network — never through current employer contacts
- No current employer colleagues may be involved as contributors, testers, or participants
- All enterprise participants are disclosed in the paper with institutional consent
- The network connector may be acknowledged as a contributor if they participate substantively in arranging or running experiments — git history and Hansard establish the attribution

```
Private verification (solo)    →  Does the framework work at all?
Network connector arranges     →  Enterprise partner willing to participate
Enterprise test runs           →  Real project, real Scrum baseline
Results in hand                →  Approach academic collaborators
Paper co-authored              →  Framework + experiment + game theory
Published                      →  Prior art fully established
```

### The Core Thesis

**"Does governance protocol selection measurably affect AI agent collaboration outcomes in software engineering?"**

Agile has been the unchallenged default assumption in software team collaboration for 25 years. It has never been empirically compared against adversarial, authoritarian, or darwinist protocols at the agent collaboration level — because no infrastructure existed to make the comparison controlled and reproducible.

Politik provides that infrastructure for the first time.

### One Unified Paper

Framework and thesis are inseparable. One paper says: here is a novel instrument, here is the first experiment, here is what game theory predicts, here is what actually happened. That is a complete scientific contribution. Splitting into two weakens both.

**The paper covers:**
- Politik architecture, CANON primitive layer, protocol system, git substrate, agent compatibility, domain and protocol taxonomy
- Game theory formal predictions per protocol before experiments run
- Empirical results across five protocols on identical engineering problems
- Measured outcomes: code quality (defect rate, test coverage), speed, escalation rate, Division frequency, deadlock rate, Nash Equilibrium convergence, LEDGER cost-per-outcome

**Target venues:** arXiv cs.MA + cs.SE simultaneously (preprint), then ICSE or EC (Economics and Computation) for peer review.

**Three authors:** Inventor (instrument + practitioner insight), SE researcher (methodology + software metrics), game theorist (formal predictions + EC venue access).

### The Agile Challenge Angle

```
Agile Manifesto intent (2001):
    Individuals and interactions over processes
    Working software over comprehensive documentation
    Responding to change over following a plan

Agile in practice (2026):
    Two-week sprints nobody believes in
    Velocity points nobody trusts
    Standups that should be emails
    Ceremonies as the product

The untested assumption:
    Agile is the optimal collaboration protocol
    for software development

Politik makes this empirically testable
for the first time.
```

The provocative paper title:
*"Was Agile a Mistake? A Multi-Protocol Study of AI Agent Collaboration Outcomes"*

### Academic Collaboration Team

**Three-author dream team:**

| Role | Contributor | Brings |
|---|---|---|
| Framework inventor | Steve Krisjanovs, Cordfuse Inc. | Novel architecture, practitioner insight, working code, 25yr systems experience |
| SE Researcher (PhD) | TBD | Empirical methodology, software metrics, publishing infrastructure, peer review navigation |
| Game Theorist (PhD) | TBD | Formal protocol models, Nash Eq analysis, mechanism design evaluation, EC venue access |

### Why Three Authors is Stronger Than Two

- SE researcher alone: empirical but no theoretical foundation
- Game theorist alone: theoretical but no empirical evidence
- Framework inventor alone: novel but no academic methodology
- All three: theoretically grounded + empirically rigorous + practically implemented

That combination is rare. Most papers have one or two. All three is genuinely publishable in top venues.

### Finding Academic Collaborators

**Step 1 — SE Researcher (cold outreach)**
Search terms:
```
"empirical software engineering" "AI agents"
"multi-agent systems" "software development"
"LLM agents" "collaboration" "code review"
```
Target institutions (proximity advantage):
- UWaterloo — strong CS
- UofT — strong AI program
- McMaster — Hamilton, close proximity
- Any Canadian university (easier to meet in person)

**Step 2 — Game Theorist (cold outreach)**
Search terms:
```
"mechanism design" "multi-agent"
"game theory" "AI agents"
"Nash equilibrium" "autonomous agents"
"cooperative game theory" "AI collaboration"
```
Target venues: EC conference author lists, arXiv cs.GT recent papers

**Outreach approach:**
- Reference their specific published work
- State the research question explicitly
- Link to Zenodo DOI
- Prior art timestamps establish priority

---

## ATTRIBUTION & PUBLICATION STRATEGY

### Inventor Attribution

**Steve Krisjanovs, Cordfuse Inc.**

### Publication Path

| Layer | Platform | Purpose |
|---|---|---|
| Private git commit | GitHub | Development anchor |
| Zenodo DOI | zenodo.org (CERN) | Citable, Google Scholar indexed |
| arXiv preprint | arxiv.org (Cornell) | Academic discovery, formal prior art |
| Peer reviewed paper | Journal/Conference | Full publication |

Target categories: arXiv cs.MA (multi-agent systems) + cs.SE (software engineering)

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
### PHASE 0.5 — Prior Art
```
[ ] Create private GitHub repo — cordfuse/politik
[ ] Initial commit — markdown docs only
    README.md, POLITIK-ARCHITECTURE.md, CANON.md
[ ] Tag v0.1.0-architecture
[ ] Enable Zenodo on repo
[ ] Create public GitHub release from tag
[ ] Zenodo DOI minted automatically
[ ] Confirm DOI resolves — doi.org/10.5281/zenodo.XXXXXXX
[ ] Record DOI in this document
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

```
[ ] Transport decision: libp2p gossipsub vs NATS
    → libp2p: more complex, truly P2P, no server needed
    → NATS: simpler, one node hosts, battle tested

[ ] Atomic slot claim mechanism
    → Two agents could both see slots: 1 and both try to join
    → NATS JetStream can arbitrate
    → Optimistic locking on Hansard commit?

[ ] Claude Code headless auth on VPS
    → Device flow — does Anthropic support it?
    → If not, API key is mandatory for all headless

[ ] AgentBox future integration
    → Politik Monitor (read-only real-time view)?
    → Separate tool — not AgentBox

[ ] Nested sessions (Commission model)
    → A session that spawns a sub-session
    → Or escalates to a parent session
    → Appeals Court, Championship model
    → Design for explicitly?

[ ] Ollama model recommendations per protocol
    → Which local models work best for which protocols?
    → Test matrix needed

[ ] Nash Equilibrium convergence question
    → Do AI agents actually converge on Nash Eq predictions?
    → Or do they deviate — and why?
    → Either result is publishable
    → Game theorist to formally model before experiments run

[ ] Protocol selection recommendation engine
    → Eventually: agent recommends which protocol to run
    → Based on problem type, team size, desired outcome
    → Long-term roadmap item — not v1

[ ] Game Theory analytical structures — when to embed in protocols?
    → Resolved: NOT user-selectable protocols
    → Embed in protocol definitions post-research as analytical layer
    → Game theorist validates formally before embedding
    → Ships after the paper is published

[ ] arXiv endorser
    → SE researcher or game theorist provides endorsement
    → Zenodo bridges the gap until academic collaboration locked
    → Do not submit to arXiv without endorser

[x] Skin vs Protocol terminology — RESOLVED
    → Protocol is the correct term throughout
    → Domain is the industry category
    → Skin terminology eliminated from all documentation
    → CHARTER.md schema uses protocol not skin

[ ] Charter validation failure handling
    → SESSION_INVALID covers minimum cast failure at Writ Drop
    → No handling for malformed Charter YAML, contradictory rules, or schema violations
    → Define CHARTER_INVALID fault subtype for parse/schema failures

[ ] Context window saturation fault type
    → No formal fault type when an LLM hits context limits mid-motion
    → Define FAULT_ACTOR subtype CONTEXT_SATURATION for mid-session model degradation
    → May also be classifiable as FAULT_INFRA depending on cause

[ ] Token estimation methodology for non-API sessions
    → LEDGER states "For Claude.ai conversations (non-API) token counts are estimated"
    → Estimation methodology not specified
    → Define heuristic or declare as best-effort approximation
```

---

## RELATIONSHIP TO OTHER CORDFUSE PROJECTS

### Priority Declaration

**Politik is the primary Cordfuse project.**

All other Cordfuse projects are deprioritised until Politik has a DOI, a working reference implementation, and at least one successful private verification session.

| Project | Status | Relationship to Politik |
|---|---|---|
| **Politik** | **ACTIVE — all energy here** | This document |
| IronBound | Deprioritised | Different model — human-to-agent, user's CLI. No conflict. Could eventually run as a Politik constituency. |
| AgentBox | Deprioritised | Speaker's console. Starts/ends sessions. Not the chamber. Integration planned Phase 7. |
| IronForge | Deprioritised | Orchestration layer — may converge with Politik architecture later. |

---

*Attribution: Steve Krisjanovs, Cordfuse Inc.*  
*Status: Architecture locked — pre-scaffold*
