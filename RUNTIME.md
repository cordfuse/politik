# POLITIK — RUNTIME MECHANICS

**Attribution:** Steve Krisjanovs, Cordfuse

Session operations, escalation flows, actor lifecycle, cost model, platform support, governance tiers, and session fault handling.

See [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md) for CANON and the engine layer.

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

