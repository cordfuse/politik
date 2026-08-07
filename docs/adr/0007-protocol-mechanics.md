# ADR-0007 — Protocol Mechanics (Composable Behavioral Strategies)

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

---

## Context

ADR-0006 wired the first protocol behavioral flag (`session.escalation`) into the
engine. It closed a credibility gap but not the central one: protocols still
share one set of *mechanics*. A Battle Royale and a Jury run the same Division
tally, the same exit rules, the same termination — they differ only in vocabulary
and whether appeals are allowed. The framework's thesis is that different
governance structures produce different behavior; a protocol layer that only
relabels words does not deliver it.

Two tempting answers are both wrong for Politik:

**An engine per protocol.** Subclass or fork the engine for each protocol. This
destroys the one thing Politik sells. The immutable Hansard, the audit trail, the
guarantees — all of it comes from a *single shared engine*. Forty-three engines is
forty-three codebases, forty-three sets of bugs, and no common trustworthy record.
The shared engine is not the enemy of unique protocols; it is what makes a unique
protocol trustable.

**Prose as the referee.** Describe each protocol's behavior in natural language
and have Politik interpret it at decision time. This trades away determinism —
and determinism *is* auditability. The moment "did the Motion carry?" depends on a
model's reading of a sentence, the Hansard can assert an outcome no one can
reproduce. A referee must be a rule, not a reading.

The correct model separates the **referee** (deterministic code) from the
**rulebook** (prose for humans and agents):

- The engine stays single and shared. It exposes a fixed set of decision points.
- Each point is filled by a named, deterministic **strategy** from a built-in
  registry. A protocol is unique because it *composes* a unique set of strategies.
- Composition, not inheritance: protocols mix independent rules (a tribunal may
  want a Jury's unanimity with a Battle Royale's no-appeals), which a class
  hierarchy cannot express cleanly and composition can.
- Functional, not class trees: a strategy is a pure function selected by name,
  matching this codebase's pure, table-driven core.
- Prose stays in the prompt as the rulebook agents read, and may serve as an
  authoring source that *compiles* to a strategy selection — but never runs as
  the referee.

## Decision

**The engine gains a fixed set of override points. A protocol declares which
built-in strategy fills each. The Charter is the runtime authority for the
selection, matching `domain_veto` (ADR-0006); the protocol manifest declares the
same for SDK coherence. An omitted selection falls back to the parliamentary
default, so every existing session is unchanged.**

The initial override points and their built-in strategies:

| Point | Question | Strategies (default first) |
|---|---|---|
| **resolution** | How does a Division resolve? | `majority` · `supermajority` (≥⅔ aye) · `unanimity` · `plurality` |
| **exit** | How does an actor leave? | `division` (voted out) · `elimination` (lose → out) · `none` (until terminal) |
| **pairing** | Who acts together? | `plenary` (all) · `bracket` · `swiss` |
| **termination** | When does the session end? | `objective` · `last-standing` · `rounds` · `verdict` |

Each strategy is a pure function with the same signature as its siblings, unit
tested in isolation. The engine dispatches by name; adding a strategy is a table
entry, not an engine change. Adding an override point is an ADR.

Battle Royale is then `{resolution: majority, exit: elimination, termination:
last-standing, escalation: disabled}`. A Jury is `{resolution: unanimity, exit:
none, termination: verdict}`. Parliament is the default of every slot. Same
engine, genuinely different behavior — every one still writing to the same Hansard.

### Phased implementation

The framework ships one slot at a time so each is proven before the next:

1. **`resolution`** — first, because Division already exists and resolution is the
   most visible difference (a Jury that needs unanimity behaves unmistakably
   unlike a Parliament that needs a majority). `tallyDivision` takes the strategy;
   the Charter carries `mechanics.resolution`; the default `majority` reproduces
   today's behavior exactly.
2. `exit`, `termination`, `pairing` follow, each its own change with its own
   dogfood and tests.

## Consequences

- Protocols behave distinctly and *deterministically*. The Hansard stays
  reproducible: an outcome is a function of recorded votes and a named strategy,
  both auditable.
- The strategy registry is the new extension surface. New governance shapes are
  new *combinations* of existing strategies, or a single new strategy function —
  never a new engine.
- Prose is decoupled from enforcement. It informs agents and may author a
  selection; it never decides an outcome.
- Backward compatible by construction: every default is the current parliamentary
  behavior, so untouched sessions do not change.
- The game-theory analysis in PROTOCOLS.md becomes progressively real as slots
  land, rather than remaining documentation.
