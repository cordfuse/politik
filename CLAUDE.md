<!-- parent: librarian -->
# Politik — Claude Code Instructions

## What This Repo Is

Politik is a governed multi-agent framework built on git. This repository
contains the architecture specification and invention disclosure for the
framework, plus the Phase 2 reference implementation.

**Attribution:** Steve Krisjanovs, Cordfuse

**Current status: PHASE 2 — REFERENCE IMPLEMENTATION COMPLETE.** All eleven
Phase 2 items are implemented, on branch `feat/phase-2-scaffold`. Phase 1 closed
earlier; the scaffolding gate was lifted by explicit human instruction.

Architecture decisions are recorded in [`docs/adr/`](docs/adr/). ADR-0001
(transport), ADR-0002 (CHARTER.md schema), ADR-0003 (STATE.json schema) and
ADR-0004 (motion enactment) are all **Accepted**. `POLITIK-ARCHITECTURE.md` was
amended only by ADR-0004, which added the `ASSENT` verb and the `CONFLICT`
primitive.

The SCM provider interface return types — the one item Phase 1 deferred to the
scaffold — are settled in `src/scm.ts`.

Phase 1's only remaining item is the arXiv preprint.

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

### The implementation

- **`src/canon.ts`** — CANON encoded as types and frozen constants. Single
  source of truth in code; drift from the architecture is a compile error.
- **`src/charter.ts`** — CHARTER.md parser and Writ Drop validator (ADR-0002).
- **`src/state.ts`** — STATE.json schema and invariants (ADR-0003).
- **`src/init.ts`** — session repo initializer. Produces files; writes none.
- **`src/envelope.ts`** — broadcast envelope parser and eligibility check.
- **`src/election.ts`** / **`src/lockfs.ts`** — first-actor-per-constituency
  mutex. Local scope only; the Hansard commit is the global arbiter.
- **`src/hansard.ts`** — append-only record writer.
- **`src/quorum.ts`** — runtime quorum, with the degraded-session override.
- **`src/escalation.ts`** — Point of Order: file, suspend, rule, resume.
- **`src/prorogation.ts`** — termination conditions and the seal.
- **`src/providers/github.ts`** — reference SCM provider. REST only.
- **`src/cli.ts`** / **`bin/politik.js`** — the `politik` binary.

Everything except the provider and the CLI is pure — no I/O, no clock, no
randomness. Timestamps and GUIDs are always caller-supplied, which is what makes
the governance logic testable and deterministic.

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
