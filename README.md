# Politik

[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.19490359-blue)](https://doi.org/10.5281/zenodo.19490359)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**A governed multi-agent framework built on git.**

Pluggable governance protocols. Stateless agent workers. Git as the session substrate. Immutable Hansard. Append-only LEDGER. Human constitutional authority.

---

## The Problem

Multi-agent AI coordination today is:

- **Ungoverned** — agents act without rules, quorum, or accountability
- **Unrecorded** — no immutable audit trail of who decided what and why
- **Uncosted** — no per-decision attribution of time, tokens, or dollars
- **Single-machine** — no framework for agents across machines, orgs, or human teams
- **Human-absent** — humans monitor, not govern

The result: agents that produce outputs nobody can fully trust, audit, or reproduce.

---

## What Politik Solves

Politik is a **governed multi-agent operating system** where:

- A **human** is the constitutional authority — present but not operational
- **Agents** are stateless CLI workers that spawn, do work, and dispose
- A **git repository IS the session** — charter, record, state, and invite in one
- **Pluggable governance protocols** translate the framework to any industry vocabulary
- **A governed tree, not a single machine** — sessions nest into an Org → Team → Ticket hierarchy in one repository; `politik registry` reports the state of everything, across machines and teams
- **No new infrastructure required** — git already built it

Nobody connected these pieces this way before.

---

## Install

Politik runs on Node with **no build step** — the source is TypeScript, executed
directly via `tsx`. Requires Node 20+ and git.

```sh
npm install -g @cordfuse/politik
politik doctor                    # probe this host: can it run a session, with which agents?
```

Or run without installing:

```sh
npx @cordfuse/politik doctor
```

From source, if you want to hack on it:

```sh
git clone git@github.com:cordfuse/politik.git
cd politik && npm install
node bin/politik.js doctor
```

## A first session

Every command below is a git commit. `git log` in the session directory is the
Hansard — the immutable record.

```sh
politik scaffold --dir ./session --quorum 2                                  # write a Charter to edit
politik init     --dir ./session --charter ./session/CHARTER.md --speaker you
politik division call  --dir ./session --motion adopt-standard --actor you --role AUTHORITY
politik division vote  --dir ./session --motion adopt-standard --actor ada --role MEMBER --vote AYE
politik division vote  --dir ./session --motion adopt-standard --actor bo  --role MEMBER --vote AYE
politik division tally --dir ./session --motion adopt-standard               # → Motion CARRIED
politik assent         --dir ./session --motion adopt-standard --actor you --role AUTHORITY
```

Seat a real agent to do the work instead of a human vote:

```sh
politik run --dir ./session --agent claude-code --actor ada --role OPERATOR \
  --task "Draft and commit a Motion to adopt trunk-based development."
```

The agent's turn is captured, its cost measured, and the result recorded — see
`politik ledger --dir ./session`.

---

## Technical

### CANON — The Primitive Layer

The engine speaks in canonical terms. Protocols translate them to domain vocabulary.

**Roles:** `AUTHORITY` (human only) · `DELEGATE` · `OPERATOR` · `MEMBER` · `OBSERVER`

**Primitives:** `SESSION` · `PROCEEDING` · `CHARTER` · `RECORD` · `MOTION` · `DIVISION` · `MATCH` · `ESCALATION` · `SUSPENSION` · `QUORUM` · `CONFLICT` · `DEADLOCK`

**Verbs:** `READ` · `WRITE` · `VOTE` · `ASSENT` · `ESCALATE` · `PROMOTE` · `DEMOTE` · `HIRE` · `FIRE` · `SUSPEND` · `EXPEL` · `VETO` · `SPAWN` · `DISSOLVE` · `EXIT`

**States:** `CONVENED` · `SUSPENDED` · `PROROGUED` · `STALE` · `INVALID`

### The Session Repo

The git repository IS the Politik session. That much is always true — Charter,
Hansard, state and audit trail all live there.

An **SCM provider is optional**. Configure one and governance acts are
additionally projected onto the platform; without one a session runs complete
and correct on git alone. *Run local, run free.*

| GitHub feature (when hosted) | Politik primitive |
|---|---|
| Repository | Session |
| CHARTER.md | Standing Orders |
| Pull Request | Motion |
| PR Review | Division (vote) |
| Issue | Escalation |
| GitHub Actions | Clerk automation |
| Repo access | Taking a Seat |
| git history | Hansard (immutable record) |

### The Politik Tree

A session is either a standalone repository or a **node in a tree** — an
organisation's Org → Team → Sprint → Ticket hierarchy as nested directories in
one repository, each node inheriting its parent's Charter. Federation is **local
traversal over that one working tree**, not cross-repository orchestration: no new
service, no registry server. `politik registry` walks the tree and reports every
session's state and cost with a roll-up; `politik cascade` flags a fault repeating
across sibling sessions. `politik init --standalone` opts a node out into its own
repository when it needs per-session pull requests or a hard permission boundary.

### Agent Model

Agents are stateless. No persistent processes. State lives in git.

```
Broadcast received → Agent spawned → Prompt executed → Result committed to Hansard → Agent disposed
```

### The Human Role

The Speaker (human) is constitutionally present, not operationally present. Drops the Writ, defines Standing Orders, rules on escalations. The session governs itself.

### Governance Protocols

**Eleven reference protocols ship** — Parliamentary, Republic, Monarchy, Socialism (political archetypes), Jury Deliberation, Elimination Tournament, Emergency Response (ICS), Corporate, Peer Review, Adversarial Collaboration, and Solo (single-lead) — spanning constitutional, authoritarian and darwinist modes. Each is a vocabulary translation **plus** a composition of behavioral mechanics — how a decision resolves (majority · supermajority · unanimity), how an actor exits (voted out · elimination · none), and when a session ends (objective · last-standing · verdict) — on top of CANON. You compose your own for anything else; the framework is the product, these are exemplars. Parliamentary is protocol #1, not a privileged mode. Each protocol's vocabulary and mechanics are documented in [PROTOCOLS.md](PROTOCOLS.md).

Competitive protocols run on the `MATCH` primitive — a real 1v1 contest that a Motion-and-vote Division cannot model. `politik pair` generates a round (Swiss, round-robin, or single-elimination), `politik match report` settles a result, and `politik standings` scores the field from the record.

### Hansard and LEDGER

**Hansard** — append-only session record. Every motion, vote, escalation, and commit. Attributed, timestamped, immutable. Cannot be edited. Cannot be gamed.

Because the record is the defence against bad faith, `politik integrity` reads the Hansard for the signatures of coercion — a coerced exit, a serial "voluntold" — and surfaces them to the Speaker. Detect and report; it never auto-punishes. The record catches what a naive log would hide.

**LEDGER** — cost accounting per act: elapsed time, token count, dollar cost, model. Every governance act writes a row; agent turns carry measured spend, and the human-driven acts (division, assent, escalation, ruling) carry `unmeasured` cost, so the ledger is a complete account of a session. No story points.

Measured, never estimated — and the distinction is enforced. An agent that reports usage produces exact figures; one that does not is recorded as `unmeasured`, never as `$0.00`, and totals report unmeasured rows separately rather than folding them in. Five CLI agents report usage today — Claude Code, Codex, Gemini, OpenCode and Qwen; the rest record elapsed time and mark cost `unmeasured`.

---

## Game Theory

Game theory is not a protocol in Politik. It is the analytical layer that **observes and describes** what emerges from sessions that are already running.

> Game theory is to Politik what physics is to the universe. Physics doesn't run the universe — it describes it. Game theory doesn't run Politik sessions — it describes the equilibria that emerge from them.

Every protocol in Politik instantiates a formal game structure:

| Protocol | Game Structure | Nash Equilibrium Prediction |
|---|---|---|
| Parliamentary | Cooperative with veto players | Stable coalition at quorum threshold |
| Emergency Response (ICS) | Stackelberg leader-follower | Full compliance, zero deviation |
| Jury Deliberation | Unanimity / holdout game | Convergence to consensus, or a hung result |
| Elimination Tournament | All-pay elimination | Aggressive early, conservative late |
| Adversarial Collaboration | Two-player, pre-committed | Maximum honest disclosure |

**The research question** (not yet a built feature — see [RESEARCH.md](RESEARCH.md)): do AI agents converge on Nash Equilibrium predictions when governed by protocols that formally instantiate known game structures? If yes — protocol selection becomes a mechanism design problem. If no — why do agents deviate? Either result is publishable.

---

## Business Disruption

### Jira is a database humans are required to keep updated. Hansard is a database that is impossible to not keep updated.

That is not a feature comparison. It is a category difference.

| Jira | Politik |
|---|---|
| Developer types ticket title | Motion title in Hansard |
| Developer estimates story points | LEDGER — exact elapsed, tokens, dollars |
| Someone manually assigns reviewer | Division record — attributed votes |
| Developer links commits manually | Every governance act is its own commit — the git history is the audit trail |
| Developer manually closes ticket | Prorogation — one command, with the terminating trigger recorded |
| Cost tracking is finance's estimate | LEDGER — actual cost per decision |

Politik produces a superior project record as a **zero-overhead side effect** of running governed sessions. Nobody updates it. Nobody logs time. It is all there because it cannot be otherwise.

### GitHub Alignment

A session is a git repository, so Politik runs anywhere git does. Point it at a GitHub repo and governance acts additionally project onto the platform — a Motion becomes a pull request, a Division a review request, an Escalation an issue, Assent a merge — and a shipped Actions workflow emails the Speaker when an escalation is filed. Agents run in GitHub Actions like any other CLI. The projection is optional; without it a session is complete and correct on git alone.

### Open Source

MIT licensed. The entire framework — CANON, protocol library, session engine, Hansard substrate, CLI tooling, reference implementation — is open source.

---

**Attribution:** Steve Krisjanovs, Cordfuse  
**Architecture:** [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md) · [PROTOCOLS.md](PROTOCOLS.md) · [RUNTIME.md](RUNTIME.md) · [RESEARCH.md](RESEARCH.md) · [EXECUTION.md](EXECUTION.md)  
**DOI:** [10.5281/zenodo.19490359](https://doi.org/10.5281/zenodo.19490359)  
**License:** MIT
