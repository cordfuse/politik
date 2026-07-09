# ADR-0002 — CHARTER.md Schema

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

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
  merge_strategy: merge_commit   # merge_commit (default) | squash | fast_forward
  assent: AUTHORITY              # CANON role holding ASSENT; default AUTHORITY

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
5. `merge_strategy: squash` is **rejected** when `protocol.record_mode` is
   `distributed` — squash destroys per-commit attribution, which that record mode
   guarantees. Permitted otherwise (ADR-0004, Ruling 1).
6. `merge_strategy: fast_forward` is **rejected** unless `session.quorum` is `1` —
   a fast-forward leaves no merge node, so the Hansard would carry no evidence a
   Division occurred. At `quorum: 1` there is no Division to record (ADR-0004,
   Ruling 2).
7. `session.assent` must name a CANON role. Defaults to `AUTHORITY` (ADR-0004,
   Ruling 3).
8. On pass: `STATE.json.state = CONVENED`.

## Ruling — `mode` / `record_mode` key collision (resolved)

`POLITIK-ARCHITECTURE.md` defines `mode` and `record_mode` under a `protocol:`
block with fixed enums. `RUNTIME.md` § Single-Player Sessions reused the **same
key names** under a `session:` block with values (`solo`, `full`) present in
neither enum.

Git history settles the intent. The `protocol.mode` enum shipped in the original
`v0.1.0-architecture` invention disclosure. `session: mode: solo` first appeared
in the single commit that introduced RUNTIME.md — an illustrative YAML sketch,
not a designed second namespace.

**Ruling: `mode` and `record_mode` are protocol-level keys only.** They are
removed from the `session:` block. Nothing is lost:

- `mode: solo` is fully expressed by `session.quorum: 1`.
- `record_mode: full` states the default — the Hansard is required in every
  non-Ephemeral protocol, so there is nothing to opt into.

`POLITIK-ARCHITECTURE.md` is unchanged; the correction was made in `RUNTIME.md`,
which held the erroneous keys.
