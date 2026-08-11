# ADR-0006 — Protocol Behavioral Enforcement

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

---

## Context

A protocol is a vocabulary-translation manifest over CANON, plus a small set of
behavioral flags: `mode` (`constitutional` | `authoritarian` | `darwinist` |
`ephemeral` | `immutable`), and `no_escalation`, `no_record`,
`immutable_charter`, `domain_veto`. Eleven protocol manifests ship in
`protocols/*.yml`, several game-theory shapes among them (Elimination Tournament,
Jury Deliberation, Peer Review, Adversarial Collaboration).

The vocabulary half works: `roleTerm`/`term` translate CANON into a protocol's
words for the interface and the record. The behavioral half did not. The flags
were declared on the `Protocol` type, checked for internal coherence by the SDK
linter, and shipped in every manifest — but **no engine module ever read them**.
The predicates written for exactly this purpose (`allowsEscalation`,
`keepsRecord`, `allowsCharterAmendment`) were exported and never called.

The consequence: an `elimination-tournament` session and a `parliamentary` session ran
byte-for-byte identical mechanics, differing only in the words written to the
Hansard. A Darwinist protocol that declares "no appeals" still accepted them.
The thesis that different governance structures change how a chamber behaves was,
at the engine level, unimplemented — and a declared-but-inert flag is worse than
an absent one, because a reader trusts it.

`domain_veto` is the exception that shows the intended pattern: it is declared in
the Charter and enforced by the engine (`actors.ts` veto). The other behavioral
declarations should work the same way.

## Decision

**The Charter is the runtime authority for behavioral settings, and the engine
enforces them — matching `domain_veto`.** A protocol manifest still declares the
same flags for SDK coherence, but a running session enforces the Charter's copy,
because a session is one repository and must be self-contained.

**Scope is the flags that already exist and have a real enforcement point. It
explicitly excludes game-theory mechanics.** Elimination, tournament brackets,
scoring, and Nash-equilibrium behavior are not built here; they remain the
RESEARCH.md experimental agenda. `mode: darwinist` is a bundle of behavioral
flags, not a distinct engine.

### Wired now — `session.escalation`

The Charter already carries `session.escalation: 'enabled' | 'disabled'` (the
`no_escalation` flag by another name), previously enforced only in `tree.ts`
inheritance tightening. When a Charter declares it `disabled`, the engine now
refuses every escalation path:

- the CLI `escalate` command refuses;
- `fileEscalation` throws, so no caller can raise a Point of Order;
- during an agent turn, a file written under `escalations/` no longer suspends
  the sitting — a protocol with no appeals has no mechanism to resolve one, so
  the turn is recorded and the session stays live rather than deadlocking in a
  suspension it cannot lift.

This is what makes a Darwinist chamber behave like one: a decision stands, and an
actor that dislikes it exits rather than appeals.

### Identified but not wired — and why

- **`no_record`** has no Charter field and contradicts the core invariant that
  the Hansard *is* the session (POLITIK-ARCHITECTURE.md). An ephemeral chamber is
  a real design question — what is a session with no record? — not a flag to flip.
- **`immutable_charter`** has no Charter field and no runtime charter-amendment
  command to guard. There is nothing to refuse yet.

Both remain protocol-manifest metadata consumed only by the SDK's coherence
linter until a design exists. Recording them here keeps the gap explicit rather
than silent.

## Consequences

- Protocols that declare `session.escalation: disabled` — the Darwinist and
  elimination shapes — now behave distinctly from Parliament, not just in
  vocabulary.
- PROTOCOLS.md still describes elimination and Nash-equilibrium mechanics this
  ADR does not build. A separate documentation pass must trim those claims to
  what the engine enforces, or the credibility gap moves from the code to the
  docs.
- The pattern is now uniform: a behavioral setting lives in the Charter, is
  enforced by the engine, and is declared redundantly on the protocol manifest
  for SDK coherence. Future flags follow this path.
