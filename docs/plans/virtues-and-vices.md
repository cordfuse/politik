# Plan — Virtues & Vices as a Bad-Faith Detector

**Attribution:** Steve Krisjanovs, Cordfuse
**Status:** v1 shipped (`src/integrity.ts` + `politik integrity`); v2/v3 open
**Parent:** [`CLAUDE.md`](../../CLAUDE.md) · builds on [RESEARCH.md](../../RESEARCH.md) (Human Flaw thesis) and [RUNTIME.md](../../RUNTIME.md) (§ Actor Elimination, The Voluntold Problem)

---

## The idea

Skills are **capability** — objective, declared before seating, and already coded
(`capability.ts`: hard skills required/excluded, scored soft skills, archetypes;
`checkCapability()` gates the turn in `runner.ts`). Virtues and vices are not
capability. Nobody writes "this agent is manipulative" in a profile. They only
appear in **behaviour, over time**. So the right code form for them is not a
profile field — it is a **detector that reads the immutable Hansard for the
patterns**.

This is the most on-thesis feature Politik could ship. The whole pitch is *the
record is the defence against bad faith*. A detector makes that literal: the
Hansard doesn't just store the coercion, it **catches** it.

## Design principle

**Detect, don't declare. Report, don't punish.** The detector surfaces findings
to the Speaker (AUTHORITY); it never auto-expels or auto-penalises. Per RUNTIME.md
§ The Voluntold Problem: *"the audit trail is the deterrent."* Transparency is the
mechanism. The one case it cannot solve is a bad-faith Speaker — and nothing can,
except the record being visible to everyone who can read the repo.

## What the detector reads

The Hansard already carries the raw material. `ACTOR_EXITED` entries record the
`Exit type` (the CANON `EXIT_TYPES` in `actors.ts`, including the voluntary set:
`EXIT_VOLUNTARY_CONCESSION` / `_STRATEGIC` / `_COERCED`), who declared the exit,
the seat held, and the timestamp. `DIVISION_CALLED` / `VOTE_CAST` / `MOTION_*`
entries give the voting context and timing. `ACTOR_HIRED` gives who was seated
when. That is enough to compute every signature below without new record fields.

## Vice signatures (v1) — from RUNTIME.md § What the Hansard can detect

| Vice | Signature to detect |
|---|---|
| **Coercion (voluntold)** | Serial voluntary exits — multiple MEMBERs withdrawing during Divisions where the *same* OPERATOR holds a seat |
| **Manufactured consent** | Timing correlation — an `EXIT_VOLUNTARY_STRATEGIC`/`_COERCED` filed within seconds of a Division opening, with no deliberation window |
| **Cowardice** | No concession statement — a voluntary exit during an active Division with no stated reason (a Charter violation when `require_concession_statement` is set) |
| **Targeted expulsion** | Repeat target — the same MEMBER voluntarily exits whenever the same OPERATOR is present, across sessions |
| **Wrath / procedural abuse** | A cluster of `EXIT_PROTOCOL` / Point-of-Order filings by one actor against one rival with a low upheld rate |

**Virtues** are largely the honest inverses, and are worth surfacing too so the
record praises as well as accuses: `EXIT_VOLUNTARY_CONCESSION` with a stated
reason (accepting a loss on merit), converting a coerced exit into an
`EXIT_DISPUTED` rather than folding (standing the record up), consistent
participation without strategic withdrawal.

## Module shape

- A **pure module** — proposed `src/integrity.ts` — matching the codebase's pure
  core: reads a Hansard string (and, for cross-session signatures, a set of
  Hansards), returns typed `Finding[]`. No I/O, no clock — timestamps come from
  the entries. Fully testable without a session.
- A **read-only CLI command** — proposed `politik integrity [--dir <dir>]` —
  mirroring `conflict check`: prints findings, optionally records an
  `INTEGRITY_REVIEW` entry to the Hansard, exits non-zero if any high-severity
  finding stands. Surfaces to the Speaker; changes no state.
- A finding names: the vice, the actors involved, the evidence (entry
  references), a confidence, and — honestly — a false-positive caveat (over-report
  is the safer failure here, same as `conflict`).

## Phasing

1. **v1 — single-session voluntold detector. ✅ SHIPPED (`c783a24`)** — The first three signatures above
   (serial exits, timing correlation, missing concession). Pure `integrity.ts` +
   tests + `politik integrity`. Highest value, smallest surface.
2. **v2 — procedural-abuse + virtues.** Point-of-Order abuse patterns and the
   honest-concession / disputed-conversion virtues.
3. **v3 — cross-session signatures.** Repeat-target across sessions (needs a set
   of Hansards; ties into the federation/tree layer).

## Scope boundaries

- Detects and reports; **never** auto-expels or auto-penalises.
- Over-reports rather than under-reports; every finding cites its evidence so the
  Speaker can judge.
- Does not attempt to read intent from prose bodies (non-deterministic); works
  from the structured, machine-read entry fields only, so findings are
  reproducible — the same property the Hansard's auditability depends on.

## Open questions

- Confidence scoring vs. binary flags — start binary, add scoring if noisy.
- Should a finding append to the Hansard (permanent, but risks the record
  accusing on a false positive) or stay a transient report? Lean transient for
  v1; the Speaker's *ruling* on a finding is what belongs in the record.
- Charter knobs: expose the thresholds (deliberation window, serial-exit count)
  as Charter fields, mirroring `voluntary_exit_during_division`.

## References

- RESEARCH.md — Human Flaw thesis (the analytical layer that observes what emerges)
- RUNTIME.md § Actor Elimination — Legitimate vs Bad Faith; the EXIT taxonomy;
  The Voluntold Problem; What the Hansard can detect
- `src/actors.ts` — `EXIT_TYPES`, `ACTOR_EXITED` entry, `disputeExit`
- `src/capability.ts` — skills/archetypes (the *capability* dimensions, already coded)
