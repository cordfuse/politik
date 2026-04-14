# Politik

[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.19490359-blue)](https://doi.org/10.5281/zenodo.19490359)

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
- **No new infrastructure required** — git already built it

Nobody connected these pieces this way before.

---

## Technical

### CANON — The Primitive Layer

The engine speaks in canonical terms. Protocols translate them to domain vocabulary.

**Roles:** `AUTHORITY` (human only) · `DELEGATE` · `OPERATOR` · `MEMBER` · `OBSERVER`

**Primitives:** `SESSION` · `PROCEEDING` · `CHARTER` · `RECORD` · `MOTION` · `DIVISION` · `ESCALATION` · `SUSPENSION` · `QUORUM` · `DEADLOCK`

**Verbs:** `READ` · `WRITE` · `VOTE` · `ESCALATE` · `PROMOTE` · `DEMOTE` · `HIRE` · `FIRE` · `SUSPEND` · `EXPEL` · `VETO` · `SPAWN` · `DISSOLVE` · `EXIT`

**States:** `CONVENED` · `SUSPENDED` · `PROROGUED` · `STALE` · `INVALID`

### The Session Repo

The git repository IS the Politik session:

| GitHub feature | Politik primitive |
|---|---|
| Repository | Session |
| CHARTER.md | Standing Orders |
| Pull Request | Motion |
| PR Review | Division (vote) |
| Issue | Escalation |
| GitHub Actions | Clerk automation |
| Repo access | Taking a Seat |
| git history | Hansard (immutable record) |

### Agent Model

Agents are stateless. No persistent processes. State lives in git.

```
Broadcast received → Agent spawned → Prompt executed → Result committed to Hansard → Agent disposed
```

### The Human Role

The Speaker (human) is constitutionally present, not operationally present. Drops the Writ, defines Standing Orders, rules on escalations. The session governs itself.

### Governance Protocols

35+ protocols across 12 domains — Politics, Software, Sports, Military, Legal, Healthcare, Creative, Business, Education, Community, Scientific Research, Novel. Every protocol is a vocabulary translation on top of CANON. Parliamentary Democracy is the reference implementation.

### Hansard and LEDGER

**Hansard** — append-only session record. Every motion, vote, escalation, and commit. Attributed, timestamped, immutable. Cannot be edited. Cannot be gamed.

**LEDGER** — exact per-motion cost accounting. Elapsed time, token count, dollar cost. No estimation. No story points. Actual measured data.

---

## Game Theory

Game theory is not a protocol in Politik. It is the analytical layer that **observes and describes** what emerges from sessions that are already running.

> Game theory is to Politik what physics is to the universe. Physics doesn't run the universe — it describes it. Game theory doesn't run Politik sessions — it describes the equilibria that emerge from them.

Every protocol in Politik instantiates a formal game structure:

| Protocol | Game Structure | Nash Equilibrium Prediction |
|---|---|---|
| Parliamentary Democracy | Cooperative with veto players | Stable coalition at quorum threshold |
| Military Operation | Stackelberg leader-follower | Full compliance, zero deviation |
| Agile/Scrum | Cooperative, shared payoff | Consensus-seeking, slow convergence |
| Battle Royale | All-pay elimination | Aggressive early, conservative late |
| Legal/Adversarial | Two-player zero-sum | Maximum evidence disclosure |

**The research question:** do AI agents converge on Nash Equilibrium predictions when governed by protocols that formally instantiate known game structures? If yes — protocol selection becomes a mechanism design problem. If no — why do agents deviate? Either result is publishable. Either result is significant.

---

## Business Disruption

### Jira is a database humans are required to keep updated. Hansard is a database that is impossible to not keep updated.

That is not a feature comparison. It is a category difference.

| Jira | Politik |
|---|---|
| Developer types ticket title | Motion title in Hansard |
| Developer estimates story points | LEDGER — exact elapsed, tokens, dollars |
| Someone manually assigns reviewer | Division record — attributed votes |
| Developer links commits manually | Every Hansard entry references commit hash |
| Developer manually closes ticket | Prorogation — automatic on session end |
| Cost tracking is finance's estimate | LEDGER — actual cost per decision |

Politik produces a superior project record as a **zero-overhead side effect** of running governed sessions. Nobody updates it. Nobody logs time. It is all there because it cannot be otherwise.

### GitHub Platform Alignment

Microsoft owns GitHub, GitHub Actions, Azure, VS Code, Copilot, and Teams. Politik runs natively on every layer of this stack. GitHub Copilot is included in GitHub Enterprise seat licences at flat cost — no per-token billing. When Politik runs on GitHub Actions with Copilot as the agent, sessions run at **zero marginal inference cost**. The inference economics structurally favour the GitHub platform.

### Open Source

MIT licensed. The entire framework — CANON, protocol library, session engine, Hansard substrate, CLI tooling, reference implementation — is open source.

---

**Attribution:** Steve Krisjanovs, Cordfuse  
**Architecture:** [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md)  
**DOI:** [10.5281/zenodo.19490359](https://doi.org/10.5281/zenodo.19490359)  
**License:** MIT
