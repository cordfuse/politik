# ADR-0003 — STATE.json Schema

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Proposed

---

## Context

`STATE.json` is the current session state. The RECORD agent owns it
exclusively, and every actor reads it before every action — a suspended session
must stop agents immediately. Phase 2 requires the session repo initializer and
the Hansard commit writer, both of which read and write this file.

No schema exists. The documents mutate it through three overlapping
vocabularies:

| Source | Vocabulary used |
|---|---|
| CANON (ARCHITECTURE) | `CONVENED`, `SUSPENDED`, `PROROGUED`, `STALE`, `INVALID` |
| RUNTIME | `paused: true/false`, `suspended: true`, `active` |
| EXECUTION § Obsidian | `convened`, `suspended`, `prorogued`, `constitutional crisis` |

These cannot all be the schema. `active` and `CONVENED` are the same condition
under two names. `paused` (Point of Order filed) and `suspended` (heartbeat
stale) are two *causes* that the CANON collapses into one state, `SUSPENDED` —
but the engine must distinguish them, because a Point of Order resumes on a
Speaker ruling while a stale session resumes on a heartbeat.

## Decision

**One `state` field, CANON-valued. Cause is carried separately.**

```json
{
  "schema_version": "1.0.0",
  "session_guid": "0f9c1b3e-...",
  "protocol": "parliamentary",
  "state": "CONVENED",
  "suspension": null,
  "fault": null,
  "quorum": { "required": 2, "present": 2 },
  "hansard_head": "4863a96...",
  "updated_at": "2026-04-08T14:02:11Z",
  "updated_by": "RECORD"
}
```

`state` is exactly the CANON enum: `CONVENED | SUSPENDED | PROROGUED | STALE |
INVALID`. Nothing else is a state.

When `state` is `SUSPENDED`, `suspension` is populated:

```json
"suspension": {
  "cause": "POINT_OF_ORDER",
  "since": "2026-04-08T14:02:11Z",
  "escalation_ref": "escalations/2026-04-08-001.md"
}
```

`cause` is one of `POINT_OF_ORDER | SPEAKER_ORDER | DISPUTED_EXIT`.

### Mapping the legacy vocabularies

| Document says | Schema representation |
|---|---|
| `STATE.json → active` | `state: "CONVENED"` |
| `paused: true` | `state: "SUSPENDED"`, `suspension.cause: "POINT_OF_ORDER"` |
| `paused: false` | `state: "CONVENED"`, `suspension: null` |
| `suspended: true` (stale) | `state: "STALE"` |
| `SESSION_INVALID` | `state: "INVALID"` (terminal; session never opened) |
| prorogation | `state: "PROROGUED"` (terminal) |

`STALE` is its own CANON state, so heartbeat expiry does **not** use
`suspension`. This keeps "a human paused it" and "the agents went quiet"
distinguishable without a boolean soup.

### Faults are not states

`CONSTITUTIONAL_CRISIS`, `SESSION_FAULT`, and `SESSION_FAULT_CRITICAL` are
Hansard record types, not session states. EXECUTION § Obsidian colour-codes
"constitutional crisis" alongside three real states, which reads as a fourth
state but is not one. The schema carries it as:

```json
"fault": { "level": "CONSTITUTIONAL_CRISIS", "record": "HANSARD.md#L482" }
```

A session may be `CONVENED` with a non-null `fault`. The Obsidian sync script
colours red on `fault != null`, not on `state`.

## Consequences

- Agents check one field (`state`) before acting. `SUSPENDED`, `STALE`,
  `PROROGUED`, and `INVALID` all mean stop.
- `hansard_head` pins the last Hansard commit the state reflects, so a resumed
  agent can detect a state file that lags the record.
- The RECORD agent is the sole writer. Any other actor writing `STATE.json` is a
  Standing Orders violation.
- `schema_version` is present from the first commit so the file can migrate.

## Open question — requires a ruling

The Obsidian colour-coding in `EXECUTION.md` treats "constitutional crisis" as a
peer of `convened`/`suspended`/`prorogued`. This ADR demotes it to a fault
attribute. If a constitutional crisis is intended to *halt* the session as a
distinct terminal state, CANON needs a sixth state — which is an amendment to
`POLITIK-ARCHITECTURE.md` and therefore outside an ADR's authority.
