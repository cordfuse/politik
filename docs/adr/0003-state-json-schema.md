# ADR-0003 — STATE.json Schema

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

---

## Context

`STATE.json` is the current session state. The RECORD agent owns it
exclusively, and every actor reads it before every action — a suspended session
must stop agents immediately. Phase 2 requires the session repo initializer and
the Hansard commit writer, both of which read and write this file.

No schema existed. The documents mutated it through three overlapping
vocabularies:

| Source | Vocabulary used |
|---|---|
| CANON (ARCHITECTURE) | `CONVENED`, `SUSPENDED`, `PROROGUED`, `STALE`, `INVALID` |
| RUNTIME | `paused: true/false`, `suspended: true`, `active` |
| EXECUTION § Obsidian | `convened`, `suspended`, `prorogued`, `constitutional crisis` |

These cannot all be the schema. `active` and `CONVENED` are the same condition
under two names. `paused` (Point of Order filed) and `suspended` (heartbeat
stale) are two *causes*, not two states.

## Decision

**One `state` field, CANON-valued. Cause is carried separately.**

```json
{
  "schema_version": "1.0.0",
  "session_guid": "0f9c1b3e-...",
  "protocol": "parliamentary",
  "state": "CONVENED",
  "suspension": null,
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
  "cause": "CONSTITUTIONAL_CRISIS",
  "since": "2026-04-08T14:02:11Z",
  "record_ref": "HANSARD.md#L482",
  "escalation_ref": "escalations/2026-04-08-001.md"
}
```

`cause` is one of:

| cause | Filed by | Resolved by |
|---|---|---|
| `POINT_OF_ORDER` | any actor | Speaker ruling (`escalations/ruling-NNN.md`) |
| `SPEAKER_ORDER` | AUTHORITY | AUTHORITY |
| `DISPUTED_EXIT` | any actor | Speaker ruling — `UPHELD` / `REVERSED` |
| `CONSTITUTIONAL_CRISIS` | OBSERVER with `can_file`, or OPERATOR supermajority | human AUTHORITY above the node |
| `DEADLOCK` | the engine, when a Division yields no valid outcome | AUTHORITY ruling; falls through to `CONSTITUTIONAL_CRISIS` if AUTHORITY is absent or is the subject (ADR-0004) |

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

## Ruling — is `CONSTITUTIONAL_CRISIS` a state or a fault? (resolved)

Neither. **It is a cause of suspension.**

`RUNTIME.md` § Constitutional Capture already defines its effect: when a
supermajority of OPERATOR actors file escalations against AUTHORITY, "the
session auto-suspends and notifies." A designated OBSERVER with `can_file:
CONSTITUTIONAL_CRISIS` produces the same effect.

So the behaviour is already specified, and it is *suspension*. Structurally it is
a Point of Order — something is filed, the session halts, a human resolves it.
The only difference is who stands accused.

**Ruling: add `CONSTITUTIONAL_CRISIS` to the `suspension.cause` enum. Do not add
a sixth CANON state, and do not model it as a free-standing fault attribute.**

Rationale:

- Agents already halt on `SUSPENDED`. No agent logic changes.
- CANON stays at five states, so `POLITIK-ARCHITECTURE.md` is untouched.
- The Obsidian layer still colours red — it reads `suspension.cause`, not a new
  state.

An earlier draft of this ADR modelled the crisis as a `fault` object on a
still-`CONVENED` session. That was wrong: a session in constitutional crisis is
halted, not running-with-a-warning. The `fault` field is removed from the
schema.

**Accepted trade-off:** a crisis and a routine Point of Order both read as
`SUSPENDED` at a glance; a reader must check `cause` to tell an emergency from
paperwork. This is correct — the governance response to both is identical (halt,
escalate to a human). It is the cause that differs, not the state, and the schema
says so.

`SESSION_FAULT` and `SESSION_FAULT_CRITICAL` remain Hansard record types. They do
not appear in `STATE.json`; their effect on state, if any, is expressed through
`state` and `suspension` like everything else.

## Consequences

- Agents check one field (`state`) before acting. `SUSPENDED`, `STALE`,
  `PROROGUED`, and `INVALID` all mean stop.
- `hansard_head` pins the last Hansard commit the state reflects, so a resumed
  agent can detect a state file that lags the record.
- The RECORD agent is the sole writer. Any other actor writing `STATE.json` is a
  Standing Orders violation.
- `schema_version` is present from the first commit so the file can migrate.
- The Obsidian sync script colours by `state`, and red on
  `suspension.cause == "CONSTITUTIONAL_CRISIS"`.
