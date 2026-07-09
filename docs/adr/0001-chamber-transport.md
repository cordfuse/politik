# ADR-0001 — Chamber Transport: git-based default, NATS opt-in

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

---

## Context

The Chamber floor is the transport that carries the broadcast envelope between
Constituencies. Three candidates were considered: a git-based transport, NATS,
and a pure P2P mesh (libp2p gossipsub).

An earlier revision of the plan named NATS as the default and treated git as an
ambient alternative. That ordering was inverted when the durability argument was
worked through, but two documents were not updated at the time and continued to
state the superseded ordering.

## Decision

**Transport is a pluggable hook, not a fixed dependency.**

1. **git-based transport is the default** — the zero-infrastructure reference
   transport. It preserves the framework's core promise: git already built the
   substrate, so no new infrastructure is required to convene a session.
2. **NATS is an opt-in latency upgrade.** Session GUID is the subject, the
   envelope is the message payload. Queue groups deliver each message to exactly
   one subscriber, which is a native primitive for the
   First-Actor-Per-Constituency rule and removes the need for a hand-rolled
   mutex. For multi-machine assemblies, Tailscale + NATS.
3. **Pure P2P mesh (libp2p gossipsub) is rejected** — over-built for known,
   permissioned assemblies.

## Rationale

The durable substrate is *always* the session repo. The Hansard is the ordered,
attributable source of truth, and slot claims commit there atomically. Transport
carries only the ephemeral real-time nudge — "a motion is live". A dropped
message therefore loses nothing: peers fall back to reading the repo.

Because correctness never depends on the transport, the transport must not
impose an infrastructure requirement on the default path. NATS earns its place
only where latency matters, and it accelerates the nudge without ever becoming
the source of truth.

## Consequences

- A session convenes with no broker, no daemon, and no network service.
- The engine must implement the git transport first; NATS is a later, additive
  provider behind the same hook.
- Crosstalk (`cordfuse/crosstalk`) is **one such git-based transport
  implementation**, not a dependency of Politik. Politik does not require
  Crosstalk to convene a session, and no Politik specification names a Crosstalk
  version or API.
- Any transport provider must be able to lose a message without loss of
  correctness. This is a conformance requirement, not a quality goal.

## Supersedes

- `EXECUTION.md` Phase 1, transport hook line — previously "NATS default …
  git/Crosstalk ambient alternative".
- `RUNTIME.md` Chamber floor table row — previously "NATS default, or
  git-ambient".

Both have been corrected to match this ADR and
`POLITIK-ARCHITECTURE.md` § Chamber Transport, which was already correct.
