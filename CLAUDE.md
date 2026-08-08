<!-- parent: librarian -->
# Politik — Claude Code Instructions

## What This Repo Is

Politik is a governed multi-agent framework built on git. This repository
contains the architecture specification and invention disclosure for the
framework, plus the Phase 2 reference implementation.

**Attribution:** Steve Krisjanovs, Cordfuse

**Current status: PHASES 2–7 COMPLETE + protocol mechanics, on `main`.** The
framework runs, governs, and has been exercised live — Motions tabled by real
agents, carried by Division, enacted by Assent, a simulated constitutional
collapse. Protocols now genuinely **behave** differently (one shared engine,
composable mechanics — ADR-0007) and **read** differently (vocabulary display).
~35 modules, 656 tests, CI green.

Architecture decisions are in [`docs/adr/`](docs/adr/). ADR-0001 (transport),
ADR-0002 (CHARTER.md schema), ADR-0003 (STATE.json schema), ADR-0004 (motion
enactment), ADR-0005 (Hansard format), ADR-0006 (protocol behavioral
enforcement — `session.escalation`) and ADR-0007 (protocol mechanics — composable
`resolution`/`exit`/`termination` override points) are all **Accepted**.
`POLITIK-ARCHITECTURE.md` was amended only by ADR-0004, which added the `ASSENT`
verb and the `CONFLICT` primitive.

**Read [`docs/AUDIT.md`](docs/AUDIT.md) before trusting any capability claim in
the other documents.** It records a full source-vs-docs scan. Every code finding
is now closed; the remaining entries are documentation history.

Phase 1's only remaining item is the arXiv preprint. Phase 8 (public launch) has
not started.

## Where we left off (2026-08-07)

A long session that took Politik from "works" to "behaves, reads, and tells the
truth." What shipped, all on `main`:

- **ADR-0007 — protocol mechanics.** One engine, composable override points a
  protocol declares: `resolution` (majority/supermajority/unanimity), `exit`
  (division/elimination/none), `termination` (objective/last-standing/verdict).
  A Jury (unanimity+verdict) and a Battle Royale (elimination+last-standing)
  behave distinctly. `scaffold --protocol <name>` inherits a manifest's mechanics
  turnkey. Charter is the runtime authority (like `domain_veto`); manifests
  declare for coherence.
- **ADR-0006 — `session.escalation` enforced.** A no-escalation protocol refuses
  a Point of Order (CLI, pure `fileEscalation`, and the agent-turn auto-suspend).
- **Vocabulary display.** The CLI speaks each session's protocol (roles + terms),
  and `politik hansard` renders the CANON record in the protocol's language on
  demand. The stored `HANSARD.md` stays CANON — the engine parses it.
- **Ledger coverage.** Every governance act writes a LEDGER row (`unmeasured` for
  human acts), so the ledger is a complete account, not agent-turns-only.
- **Protocol library curated to 10 exemplars** (was 52 → cut fascism +
  organized-crime as liabilities, then the toys). Kept the political archetypes
  (parliamentary/republic/monarchy/socialism) at Steve's instruction. The wider
  catalogue lives as prose in PROTOCOLS.md.
- **Audit reconciled** (`docs/AUDIT.md`) — all 8 real bugs closed (#8 fixed this
  session); README honesty pass corrected the false capability claims.
- **Dogfood pass** earlier in the session closed 11 core-loop integrity bugs.

**Process note:** run `npm run lint` (tsc) before every push — `tsx` test runs
skip typechecking, which silently failed CI on ~30 commits until caught.

**Open / next, ranked:** (1) **Virtues & vices → working code — v1 SHIPPED**
(`src/integrity.ts` + `politik integrity`): a bad-faith detector reads the Hansard
for the voluntold signatures (coerced-exit, strategic-withdrawal, serial-voluntold)
and an honest-concession virtue, surfacing them to the Speaker. Makes "the record
is the defence against bad faith" a mechanism, not a claim. **v2/v3 open** —
procedural-abuse patterns, cross-session repeat-target (needs federation), Charter
knobs. Spec: [`docs/plans/virtues-and-vices.md`](docs/plans/virtues-and-vices.md).
(2) wire
`DEADLOCK` auto-suspend on a tie and the `disputed-exit` reinstatement flow into
the CLI (both constructed + tested, not wired). (3) Backlog: PATH_A auto-recovery,
scheduled heartbeat/ruling workflows, NATS transport, the `pairing`/`scoring`
override points (Swiss/tournament). (4) A showcase run (real agents, a Jury or
Battle Royale deciding something, ledger showing real cost) as the launch
artifact. Phase 8 (public launch) not started.

**Implementation stack (decided):** Node + TypeScript, npm `@cordfuse/politik`,
binary `politik`. Consistent with the namespace reserved in Phase 0 and the
TypeScript SCM provider interface in POLITIK-ARCHITECTURE.md.

**Politik does not depend on Crosstalk.** Crosstalk is *one* git-based transport
implementation (POLITIK-ARCHITECTURE.md § Chamber Transport). No Politik
specification names a Crosstalk version or API. The historical sequencing rule
was about attention, not a build dependency.

---

## Key Concepts

### CANON — The Primitive Layer

The engine speaks in canonical terms. Protocols translate them to industry vocabulary.

- **Roles:** AUTHORITY (human only), DELEGATE, OPERATOR, MEMBER, OBSERVER
- **Primitives:** SESSION, PROCEEDING, CHARTER, RECORD, MOTION, DIVISION, ESCALATION, SUSPENSION, QUORUM, CONFLICT, DEADLOCK
- **Verbs:** READ, WRITE, VOTE, ASSENT, ESCALATE, PROMOTE, DEMOTE, HIRE, FIRE, SUSPEND, EXPEL, VETO, SPAWN, DISSOLVE, EXIT
- **States:** CONVENED, SUSPENDED, PROROGUED, STALE, INVALID

### Protocols

Protocols are vocabulary translation manifests on top of CANON. Parliamentary Democracy is the reference protocol. 35+ protocols span Politics, Software Development, Sports, Military, Legal, Healthcare, Creative, Business, Education, Community, Scientific Research, and Novel domains.

### The Session Repo

The git repository IS the Politik session — charter, record, state, and invite in one. GitHub features map directly to Politik primitives (PRs = Motions, Reviews = Divisions, Issues = Escalations, Actions = Clerk automation).

---

## Reading This Repo

- **POLITIK-ARCHITECTURE.md** — Lean core: CANON, session structure, broadcast envelope, chamber transport. Read this first.
- **PROTOCOLS.md** — Full protocol library, 35+ protocols across 12 domains.
- **RUNTIME.md** — Session mechanics, escalation flows, cost model, governance tiers, fault handling.
- **RESEARCH.md** — Human Flaw thesis, game theory analytical layer, publication strategy.
- **EXECUTION.md** — Phases 0–11, Politik Tree hierarchical architecture.
- **README.md** — Public-facing brief description with DOI.

### The implementation — 32 modules

**Governance core** (pure: no I/O, no clock, no randomness — timestamps and
GUIDs are always caller-supplied, which is what makes the logic deterministic
and testable without a network):

- **`canon.ts`** — CANON as types and frozen constants; drift is a compile error
- **`charter.ts`** — CHARTER.md parser + Writ Drop validator (ADR-0002)
- **`state.ts`** — STATE.json schema and invariants (ADR-0003)
- **`init.ts`** — session repo initializer; produces files, writes none
- **`hansard.ts`** — append-only record writer (ADR-0005)
- **`division.ts`** — Division, votes, tally, Assent, deadlock (ADR-0004)
- **`quorum.ts`** — runtime quorum + degraded-session override
- **`escalation.ts`** — Point of Order: file, suspend, rule, resume
- **`crisis.ts`** — constitutional capture, witness council, external review
- **`actors.ts`** — HIRE/PROMOTE/DEMOTE/EXIT/VETO/SPAWN, Speaker order, disputed exit
- **`capability.ts`** — the five actor dimensions; gates seating
- **`heartbeat.ts`** — staleness, STATE_SNAPSHOT, resume
- **`prorogation.ts`** — termination conditions and the seal
- **`envelope.ts`** — broadcast envelope parser + eligibility
- **`tree.ts`** — Charter inheritance, cascade, quarantine, scope moves
- **`protocol.ts`** / **`protocol-sdk.ts`** — vocabulary translation, lint, generate
- **`ledger.ts`** — measured cost per act; never an estimate dressed as one
- **`templates/parliamentary.ts`** — protocol #1 templates and label taxonomy

**I/O and integration** (everything that touches the world lives here):

- **`runner.ts`** — the turn: elect → compose → spawn → capture → record
- **`agents.ts`** / **`spawn.ts`** — agent registry and process lifecycle
- **`election.ts`** / **`lockfs.ts`** — first-actor mutex; local scope only,
  the Hansard commit is the global arbiter
- **`git.ts`** — commits the record; uncommitted work does not exist
- **`transport.ts`** — chamber bus; never authoritative
- **`projection.ts`** — projects acts onto an SCM when one is configured
- **`scm.ts`** — the `ScmProvider` interface every provider implements
- **`providers/github.ts`** — reference SCM provider, REST only
- **`doctor.ts`** — host capability probe
- **`cli.ts`** / **`bin/politik.js`** — the `politik` binary
- **`index.ts`** — public entry point; re-exports every module above

### The CLI

`version` · `doctor` · `scaffold` · `protocol lint|new` · `validate` · `init` ·
`status` · `run` · `broadcast` · `motion link` · `division call|vote|tally` ·
`assent` · `escalate` · `rule` · `crisis file|check|review` ·
`actor hire|promote|demote|exit|veto|spawn|list` · `heartbeat` · `snapshot` ·
`resume` · `ledger` · `prorogue`

### Local and hosted sessions

A session is a git repository — that is mandatory. An **SCM provider is
optional**: pass `--repo owner/name` with `GH_TOKEN` and governance acts are
additionally projected onto the platform (Motion → pull request, Division →
review request, Escalation → issue, Assent → merge). Without one the session is
complete and correct locally.

A projection failure never invalidates a governance act. The Hansard is the
record; if a Motion carried and the merge failed, the Motion still carried and
the gap is recorded.

---

## Rules for Agents in This Repo

1. **Do not modify POLITIK-ARCHITECTURE.md without explicit human instruction.** This is the invention disclosure. Every word matters for prior art.
2. **Do not add files without explicit instruction.** This is a minimal repo by design.
3. **Attribution is always:** Steve Krisjanovs, Cordfuse — always.
4. **No personal details, no dates, no employer references** in any committed file.
5. **Commit discipline:** After every file change, commit immediately with a descriptive message. Do not batch changes.

---

## Session Timestamp Rule

At the START of every response — before any work — log:

`START [12hr time] [TZ] — [Mon DD, YYYY]`

At the END of every response — after all work is complete — log:

`END [12hr time] [TZ] — [Mon DD, YYYY] (elapsed: ~X seconds/minutes)`

### Conversion rules

- Hours 0-11 = am (hour 0 = 12am)
- Hours 12-23 = subtract 12 for pm (hour 12 stays 12pm)
- Derive TZ from the UTC offset: -05=EST, -04=EDT, -06=CST, -07=PDT/MST, -08=PST, +00=UTC, +01=BST

---

## Commit and Push Rule

After every file change — no exceptions — immediately commit and push to the remote.

```bash
git add -A && git commit -m "[descriptive message]" && git push
```

Do not batch changes. Do not defer commits. Every change committed and pushed immediately. This ensures:

- The record is always current on the remote
- If the machine goes offline, the last push is the restore point
- No work is lost between checkpoints

This is not optional. It is a Standing Order.
