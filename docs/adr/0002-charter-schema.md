# ADR-0002 — CHARTER.md Schema

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Proposed

---

## Context

`CHARTER.md` is the sovereign law of a session: the Speaker writes it, agents
read it, and the engine validates it at Writ Drop before the session opens.
Phase 2 of the execution plan requires a Charter parser and validator.

No document specifies the Charter as a single schema. Its fields are instead
scattered across `POLITIK-ARCHITECTURE.md` and `RUNTIME.md` as illustrative YAML
fragments. A parser cannot be written against scattered fragments. This ADR
consolidates them into one schema without inventing new governance semantics.

Machine-readable *protocol* configuration already has a home in
`.politik/protocol.yml` (the Protocol Schema Format). The Charter is distinct: it
is the per-session instrument, and it inherits from its parent node in the
Politik Tree.

## Decision

`CHARTER.md` is **markdown with a single YAML frontmatter block**. The
frontmatter carries all machine-read configuration; the markdown body carries
the human-readable Standing Orders prose, which the engine does not parse.

```markdown
---
charter_version: 1.0.0
protocol: parliamentary          # resolves against .politik/protocol.yml
inherits_from: cordfuse/politik-sprint-2026-04   # parent node, or null at root

session:
  quorum: 2                      # minimum actors for a valid Division
  escalation: enabled            # enabled | disabled (disabled => no_escalation)
  heartbeat_timeout_hours: 4     # no Hansard commit within window => STALE
  deadline: null                 # ISO-8601 wall-clock ceiling, or null

  endurance:
    max_motions: null
    max_cost_usd: null

ledger:
  enabled: true
  visibility: public             # public (default) | private
  path: LEDGER.md                # .politik/LEDGER.md when visibility: private

minimum_cast:                    # enforced at Writ Drop; hard fail
  AUTHORITY: 1
  OPERATOR: 1

domain_veto: []                  # CANON roles holding DOMAIN_VETO

constituencies:
  - role: OPERATOR
    slots: 3
    auto_demotion: false
    hard_skills:
      required: [BC_AL_development]
      excluded: [raw_SQL]
    model:
      required: claude-sonnet-5
      preferred: claude-opus-4-8
      knowledge_cutoff_minimum: 2025-01
    mandate_alignment: null
---

# Standing Orders

Human-readable prose. Not parsed by the engine.
```

### Provenance of every field

| Field | Source |
|---|---|
| `protocol` | `.politik/protocol.yml` (ARCHITECTURE § Protocol Schema Format) |
| `inherits_from` | EXECUTION § The Politik Tree |
| `session.quorum` | RUNTIME § Single-Player Sessions |
| `session.escalation` | RUNTIME § Single-Player Sessions |
| `session.heartbeat_timeout_hours` | RUNTIME § stale detection |
| `session.deadline` | RUNTIME § endurance |
| `session.endurance` | ARCHITECTURE § session.endurance |
| `ledger.*` | RUNTIME § LEDGER config |
| `minimum_cast` | RUNTIME § Minimum Cast |
| `domain_veto` | ARCHITECTURE § Protocol Schema Format |
| `constituencies[].hard_skills` | ARCHITECTURE § actor capability profile |
| `constituencies[].model` | ARCHITECTURE § model / knowledge grade |
| `constituencies[].auto_demotion` | RUNTIME § auto_demotion |
| `constituencies[].mandate_alignment` | ARCHITECTURE § actor.mandate_alignment |

Only the *grouping* is new. `constituencies` as a named top-level list is the one
structural proposal in this ADR: the source documents show a single
`constituency:` block in isolation, never a collection, but a session with more
than one role plainly needs a list.

## Validation rules (Writ Drop)

1. Parse frontmatter. Malformed YAML => `SESSION_INVALID`, session never opens.
2. Resolve `protocol` against `.politik/protocol.yml`.
3. Check assigned constituencies against `minimum_cast`. Shortfall =>
   `SESSION_INVALID` committed to Hansard, naming the missing roles.
4. `minimum_cast.AUTHORITY` may never be overridden to `0` — a session with no
   Speaker cannot proceed under any configuration.
5. On pass: `STATE.json.state = CONVENED`.

## Open question — requires a ruling

`ARCHITECTURE.md` defines `mode` and `record_mode` under a `protocol:` block:

- `mode: constitutional | authoritarian | darwinist | ephemeral | immutable`
- `record_mode: distributed | anchored | ephemeral`

`RUNTIME.md` § Single-Player Sessions uses the **same key names** under a
`session:` block, with values that appear in neither enum:

- `mode: solo`
- `record_mode: full`

These are either (a) two namespaces whose key names collide, or (b) a genuine
conflict. This ADR deliberately omits `mode` and `record_mode` from the
`session:` block pending a ruling, because resolving it would require amending
`POLITIK-ARCHITECTURE.md` — the invention disclosure — which is out of scope for
an ADR.

Until ruled, a Charter carries protocol mode via `protocol:` only, and
single-player sessions are expressed as `session.quorum: 1` (which is already
sufficient and is the value RUNTIME leans on).
