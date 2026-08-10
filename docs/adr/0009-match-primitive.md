# ADR-0009 — The MATCH Primitive and Pairing

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted — built (`src/tournament.ts`, `src/standings.ts`, `politik pair` / `politik match`).

---

## Context

Scoring a competitive protocol (`standings.ts`) reads results from the record and
works. **Pairing did not exist**, and could not be expressed on the primitives as
they stood. Swiss, round-robin and single-elimination are all **1v1-match**
formats: they generate matchups between two named contestants, each matchup
resolves to a winner, and the next round's matchups depend on the results.

A Politik **DIVISION** is an N-actor vote on a **MOTION**. It has no notion of a
contest between two parties, and no winner in the tournament sense — a Motion
carries or is rejected; it does not defeat another Motion. So there was nothing
for a pairing algorithm to pair. The audit recorded this honestly: pairing needs
"an additive *match primitive*, a design question rather than a scoring read."
This ADR adds it.

## Decision

**Add `MATCH` to CANON as a first-class primitive: a contest between two
contestants that resolves to a single winner.** It sits beside MOTION/DIVISION —
the deliberative pair decides *questions*; MATCH decides *contests* — and reuses
the rest of the engine unchanged (the Hansard records it, standings score it,
git commits it).

Lifecycle, all on the record:

- **`MATCH_CREATED`** — a pairing: round, contestant A, contestant B (or a bye).
  Produced by `pairRound(contestants, standings, format, round, played)`, which
  reads the current standings and the pairs already played:
  - **single-elim** — pairs the still-undefeated (`losses === 0`); the bracket
    narrows by loss, so no cull is required and one-undefeated is the champion.
  - **swiss** — seeds by score and pairs adjacent, never rematching.
  - **round-robin** — pairs each contestant with an opponent not yet played; a
    bye when none remains.
- **`MATCH_DECIDED`** — the result: a referee (AUTHORITY) names the winner; the
  loser is the other contestant. Refuses to crown a non-contestant, re-decide a
  settled match, or resolve one that does not exist.

Scoring is unified: `standings.ts` reads `MATCH_DECIDED` exactly as it reads a
Division outcome — winner takes a win, loser a loss — so a tournament and a
deliberative body are scored on the same table.

CLI: `politik pair --format <f>` creates a round (byes auto-decided); `politik
match report --match <id> --winner <c>` settles one; `politik match list` shows
the bracket.

## Consequences

- **Pairing is now expressible** without distorting the deliberative model. MATCH
  is a separate primitive, so a Division never has to pretend to be a duel.
- **The engine is unchanged.** MATCH reuses the Hansard, the commit path, the
  scoring read. No new state machine, no change to SESSION/STATE.
- **No auto-elimination needed for single-elim** — a defeated contestant is
  simply never paired again; the bracket is derived from the loss column. This
  keeps MATCH orthogonal to the `exit: elimination` Division mechanic (ADR-0007),
  which remains how a *Division* culls a losing side.
- **Adjudication is by AUTHORITY/referee**, not a Division. A match result is a
  reported fact, not a vote; forcing it through a Division would reintroduce the
  N-actor model MATCH exists to avoid. A protocol that wants matches decided by a
  vote can still run a Division and report its outcome as the result.
- **POLITIK-ARCHITECTURE.md is not amended by this ADR.** As with ADR-0004 (which
  added the CONFLICT primitive and ASSENT verb), the CANON constant in `canon.ts`
  carries the addition; the locked invention-disclosure prose is revised only
  under explicit human instruction when next opened.
- **Not built:** seeding beyond score order, tie-breaks (Buchholz/Sonneborn),
  and best-of-N matches. All are additive over `MATCH_DECIDED` and out of scope
  here.
