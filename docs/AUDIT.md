# Audit — source vs documentation

**Attribution:** Steve Krisjanovs, Cordfuse
**Date:** 2026-07-25
**Baseline:** `main`, 31 modules, 511 tests passing, 10 protocol manifests, 19 CLI commands

A systematic scan of every markdown document against the implementation. Every
finding below was verified directly against source, not inferred.

## STATUS — 2026-07-25

**Closed:** both integration gaps, all eight real bugs (one rejected with
reasons), and the documentation drift.

**Still open:** the *Missing — specified, no implementation* section below. Those
are unbuilt features, not defects — the docs specify them and the code does not
have them. They remain the backlog.

| Finding | Outcome |
|---|---|
| SCM provider dead code | Fixed — Assent merges a real PR (`c6b48c91`) |
| Transport unwired | Fixed — `broadcast` publishes, `run --claim` receives |
| #1 ASSENT never enacts | Fixed with the provider wiring |
| #2 `RecordMode` split | Fixed — `charter.ts` re-exports the protocol type |
| #3 AUTHORITY-is-human unenforced | Fixed — constituencies carry `agent`; a machine Speaker fails Writ Drop |
| #4 `quorum.present` wrong | Fixed — carried forward untouched by a turn |
| #5 rule 3 counts slots | **Rejected** — Writ Drop precedes seating; see below |
| #6 unreachable suspension causes | Fixed — all five constructible |
| #7 ADR-0004 self-contradiction | Fixed — stale "Proposed" consequence removed |
| #8 ADR-0002 rule 7 unenforceable | Open — noted below; coercion at parse still masks it |
| Documentation drift | Corrected — CLAUDE.md, README, EXECUTION, manifests, dangling refs |
| **Missing features** | **Open — see that section; this is the backlog** |

**On #5.** The audit read ADR-0002 rule 3 ("check *assigned* constituencies") as
meaning seated actors. It cannot: Writ Drop runs before the session opens, so no
actor has been seated, and that reading would make the rule uncheckable at the
only moment it runs. The code was right. A subagent finding that did not survive
verification — which is why they get verified.

---

## RECONCILIATION — 2026-08-07

A second pass, verifying every finding above against the current `main` (now 669
tests). Much of the "still open" list turned out to be built in the interim.

**All eight real bugs are now closed.** #1–#7 were confirmed fixed in source
(`projectAssent` calls `provider.merge`; `RecordMode` re-exports the protocol
type; constituencies carry `agent` and a machine AUTHORITY fails Writ Drop; the
three suspension causes are all constructed). **#8 was still open and is now
fixed** — the parser coerced a bad `assent` to AUTHORITY, masking rule 7; it now
defaults only on absence, so rule 7 rejects a non-CANON assent.

**Missing features — several were built since 2026-07-25:**

| Item | Now |
|---|---|
| Hard Containment Rule | **Built** — `containment.ts`, wired into `runTurn`, tested |
| `witness_council` / `consensus_suspension` parsing | **Built** — parsed in `charter.ts` |
| `stale_action`, `checkpoint_interval_hours`, `cost_warning_usd`, `deadline_action` | **Built** — all parsed |
| DEADLOCK suspension | **Built** — `division tally` auto-suspends on a genuine tie; `division break` (`breakDeadlock`) is AUTHORITY's casting vote, which flows through the ordinary tally so Assent sees a decided Division |
| Disputed Exit | **Built** — `actor dispute` files (`disputeExit`); `actor reinstate --ruling UPHELD\|REVERSED` (`resolveDispute`) reinstates to the held seat or lets the removal stand, and resumes the sitting |
| GLOBAL layer (session registry, cascade propagation, roll-up) | **Built** — `src/federation.ts` + `politik registry` / `politik cascade` (ADR-0008 phase 2: the tree of directories is the federation, discovered by local traversal) |
| PATH_A auto-recovery | **Built** — the runner's synchronous retry loop (`classify` → `shouldRetry` → `faultRecord` → `autoResolvedRecord`); only the *scheduled* (delayed, daemon-driven) retry is backlog |
| DELEGATE challenge verb | **Built** — `challengeAction` + `politik challenge`: a DELEGATE's attributed, non-binding dissent on the permanent record (RUNTIME.md § DELEGATE Challenge Verb) |
| Scheduled workflows, Jira, `sync-vault`, NATS | **Still backlog** |

**Capability claims — re-checked:**

- *"Exact measured cost, `claude-code` only"* — **stale.** Five agents now report
  usage: `claude-code`, `codex-cli`, `gemini-cli`, `opencode`, `qwen-code`.
- *"Prorogation automatic on session end"* — **now partly true.** ADR-0007
  `termination: last-standing | verdict` auto-prorogues; ceiling-based
  termination is still read-only in `status`.
- *"35+ protocols across 12 domains"* — **still overstated.** 14 manifests ship
  (was 10; the Politics domain was transcribed this session).
- *"Every Hansard entry references commit hash"* — **still false.** No entry
  carries a SHA.
- *LEDGER rows written by `politik run` only* — **still true.** `division`,
  `assent`, `escalate`, `rule`, `actor`, `crisis`, `prorogue` write no ledger row.

**New since the audit** (not defects — capability added): ADR-0006 (the
`session.escalation` flag is enforced), ADR-0007 (the mechanics framework —
`resolution` / `exit` / `termination` as composable override points, with a Jury
and a Battle Royale behaving distinctly and scaffoldable turnkey), and a dogfood
pass that closed eleven integrity bugs across the core loop.

**Genuinely still open, ranked by value:**

1. ~~LEDGER rows only from `run`.~~ **Closed** — every governance act (division,
   assent, escalate, rule, actor, crisis, prorogue) now writes a LEDGER row with
   unmeasured cost, so the LEDGER is a complete account of a session.
2. ~~Doc overstatements.~~ **Closed** — the README honesty pass corrected the shipped-protocol list (10 exemplars), the cost-agent count (five report usage), the "runs natively on every layer" claim, and the game-theory table; no false capability claim remains in the front door.
3. **DEADLOCK / Disputed Exit** are constructed but not wired into the CLI flow.
4. The rest of the missing-features list remains the backlog.

---

*Original findings follow, as recorded before any fix.*

---

## The headline: two subsystems are built, tested, and never wired in

### 1. The SCM provider is dead code at runtime

`src/providers/github.ts` implements all eleven `ScmProvider` methods, has 21
passing tests, and was live-verified against a real GitHub repository in
Phase 2. **No module in `src/` ever instantiates it or calls a single one of its
methods.** The only thing that ever exercised it was a standalone smoke script.

Verified:

```
grep -rn "new GitHubProvider" src/                      -> no results
grep -rnE "\.(openPR|requestReview|openIssue|...)\(" src/ -> no results outside the provider itself
```

The five modules that import from `scm.ts` import only the `FileWrite` **type**.

**Consequence.** Politik runs on local markdown plus git commits. README's
central mapping — "Pull Request = Motion, PR Review = Division, Issue =
Escalation" — describes a provider the runtime never touches. No Motion has ever
been a PR; no Division has ever been a review.

### 2. The transport is equally unwired

`GitTransport` is imported by nothing except `src/index.ts` and its own test.
`runTurn` **synthesizes** the broadcast envelope from CLI arguments
(`src/runner.ts:199-233`), so no process has ever received a broadcast.

`runner.ts` is therefore a single-turn executor driven by CLI args — not an
engine loop. There is no loop and no subscription. EXECUTION.md § Phase 7.5
overstates this.

---

## Real bugs — code contradicts itself or an ADR

| # | Finding | Where |
|---|---|---|
| 1 | **`ASSENT` never enacts.** ADR-0004 defines Assent as "merge the PR" and added `scm.merge(pr, strategy)` for it. `grantAssent` writes a Hansard entry and never calls the provider. `merge_strategy` is validated at Writ Drop then never used. | `src/division.ts:289-341`, `src/cli.ts` |
| 2 | **`RecordMode` disagrees with itself.** `charter.ts` declares `'centralised' \| 'distributed'`; `protocol.ts` and ARCHITECTURE declare `distributed \| anchored \| ephemeral`. **8 of 10 shipped protocols declare `anchored`** — unrepresentable in the type Writ Drop rule 5 consumes. `'centralised'` exists nowhere else. | `src/charter.ts:32` vs `src/protocol.ts:39` |
| 3 | **The one hard constitutional rule is unenforced.** "A Charter declaring a machine as AUTHORITY is invalid and fails Writ Drop." `isHumanOnlyRole` is exported and never called; the Charter schema has no human/machine field, so the rule is unimplementable as written. `canon.ts` carries a comment asserting the check exists. | `src/canon.ts:35-36,165`, `src/charter.ts` |
| 4 | **`quorum.present` is wrong** — set to leftover broadcast slots, not a count of actors present. | `src/runner.ts:351` |
| 5 | **Writ Drop rule 3 counts the wrong thing.** ADR-0002 says check *assigned* constituencies; the code sums declared `slots`. A session with 3 declared and 0 filled seats passes. | `src/charter.ts:328-341` |
| 6 | **Three of five suspension causes are unreachable** — `DISPUTED_EXIT`, `SPEAKER_ORDER`, `DEADLOCK` are never constructed, including the tie→DEADLOCK path the Division tally reports in prose. | `src/canon.ts:120-126` |
| 7 | **ADR-0004 contradicts itself** — header says "Accepted"; line 200 says "which is why this ADR is Proposed and not Accepted". | `docs/adr/0004-motion-enactment.md:5,199-201` |
| 8 | **ADR-0002 rule 7 is unenforceable** — `charter.ts` coerces a non-CANON `assent` value to `AUTHORITY` at parse, so the rule-7 guard can never fire. | `src/charter.ts:253,366-372` |

---

## False or overstated capability claims

- **"Every Hansard entry references commit hash"** (README:124) — no entry carries a SHA; the link exists only in git log.
- **LEDGER rows are written by `politik run` only** — not by `division`, `assent`, `escalate`, `rule`, `actor`, `crisis` or `prorogue`, which are precisely the acts the Jira-replacement table is about.
- **"Exact measured cost"** — true for `claude-code` only. The other seven agents record `unmeasured`; no document says so.
- **"Prorogation — automatic on session end"** — nothing auto-prorogues; `checkTermination` is read-only in `status`.
- **"35+ protocols across 12 domains"** (README, CLAUDE.md) — 10 manifests ship. EXECUTION.md states this correctly.
- **"Runs natively on every layer of the GitHub stack"** — the only Actions artefact is the point-of-order notification workflow.

---

## Missing — specified, no implementation

- **Hard Containment Rule** — traversal above CWD should be logged, escalated and suspend the session. Prompt prose only; nothing detects it.
- **`CONFLICT` primitive** (ADR-0004) — a string in `canon.ts` and nothing else.
- ~~**`DEADLOCK` auto-suspend** (ADR-0004 Proposal 4) — the tally writes the word into free text; no suspension is ever constructed.~~ **→ Built:** `division tally` auto-suspends; `division break` is AUTHORITY's casting vote.
- ~~**Disputed Exit flow** — no filing, no auto-suspend, no UPHELD/REVERSED reinstatement.~~ **→ Built:** `actor dispute` / `actor reinstate --ruling UPHELD|REVERSED`.
- ~~**PATH_A auto-recovery** — no retry config or loop; `FAULT_RESOLVED_AUTO` is an unused constant.~~ **→ Built:** the runner's synchronous retry loop; scheduled retry remains backlog.
- **`witness_council` / `consensus_suspension` are not parsed from the Charter** — the crisis mechanisms work, but the documented YAML is inert; callers must hand-construct the config.
- **Scheduled heartbeat and ruling-detection workflows** — only `point-of-order.yml` is emitted.
- **`stale_action`, `checkpoint_interval_hours`, `cost_warning_usd`, `deadline_action`** — documented Charter keys, never parsed.
- ~~**DELEGATE challenge verb**~~ (**→ Built:** `politik challenge`), three-tier escalation ladder, ~~GLOBAL layer~~ (**→ Built:** `src/federation.ts`), Jira integration, `politik sync-vault`.
- **NATS transport** — ADR-0001 frames it as a later additive provider; expected-unbuilt rather than a contradiction.

---

## Documentation drift

- **CLAUDE.md lists 13 of 31 modules**, still says "PHASE 2 COMPLETE" on branch `feat/phase-2-scaffold`, and omits ADR-0005.
- **CLAUDE.md's purity claim is false** — "everything except the provider and CLI is pure" is untrue of `runner`, `transport`, `git`, `spawn`, `doctor`, `election`.
- **9 of 19 CLI commands appear in no document**: `actor`, `assent`, `crisis`, `division`, `escalate`, `heartbeat`, `ledger`, `rule`, `snapshot` — the entire voting, enactment, actor-lifecycle, crisis and cost surface.
- **`RECORD_TYPES` exports 7; the code writes 21.**
- **LEDGER columns don't match RUNTIME.md** — 7 emitted vs 9 documented, and no totals block is written.
- **Parliamentary manifest disagrees with PROTOCOLS.md in ~6 rows**, including `CONFLICT: Merge Conflict` — the *Agile* term copied into the Parliamentary file.
- **`DOMAIN_VETO` is published as a CANON table key** in PROTOCOLS.md but is neither a primitive nor a verb; the SDK linter treats it as an error.
- **Three modules cite "§ FILE OWNERSHIP"**; the section is titled *File Sovereignty Rules*.
- **Several modules implemented that no EXECUTION.md phase mentions**: `actors`, `division`, `crisis`, `heartbeat`, `ledger`, `capability`, `tree`, `transport`, `git`, `doctor`.
- **EXECUTION.md counts are stale** — "324 tests" (now 511), "twenty tests" (now 21).

---

## Recommended order when work resumes

1. **Wire the SCM provider into the governance path.** Make `assent` merge, `division call` request review, `escalate` open an issue. This fixes bug #1, makes README's core claim true, and turns 21 passing tests into a working integration. Highest value by a distance.
2. **Wire the transport** so a broadcast is received rather than synthesized.
3. **Bugs #2–#6** — small, self-contained, and two of them mean headline governance claims are currently false.
4. **Documentation drift** — larger in volume, far lower risk. CLAUDE.md and the undocumented CLI surface first.

Everything above is unstarted.
