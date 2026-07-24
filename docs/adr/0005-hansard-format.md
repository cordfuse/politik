# ADR-0005 — Hansard Format

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted

---

## Context

`HANSARD.md` is the append-only attributed record of a proceeding. It is the
durable truth of a Politik session: transport may drop a broadcast, an agent may
die mid-task, a lockfile may go stale — none of that loses anything, because the
Hansard is the session.

No document specified its format. What existed was a consistent *record shape*
shown by three worked examples in `RUNTIME.md` (`SESSION_FAULT`,
`FAULT_RESOLVED`, `SESSION_FAULT_CRITICAL`):

```markdown
# SESSION_FAULT

**Actor:** OPERATOR-1
**Fault type:** FAULT_INFRA
```

a record-type heading followed by bold-label fields. `EXECUTION.md` § Phase 4
listed "Hansard format spec" as an open deliverable.

The Phase 2 reference implementation (`src/hansard.ts`) had to write records
before this ADR existed. It followed the worked examples and marked two choices
as provisional, pending this decision. This ADR settles them.

## Decision

**A Hansard is one markdown document: a preamble, then append-only entries.**

```markdown
# HANSARD

Append-only attributed record of this proceeding. The RECORD agent writes;
no actor edits an entry once committed.

---

## 2026-04-08T14:02:11Z — WRIT_DROP

**Actor:** speaker-handle (AUTHORITY)

Writ dropped. Session 0f9c1b3e convened under the attached Charter.

## 2026-04-08T14:04:00Z — SESSION_FAULT

**Actor:** OPERATOR-1 (OPERATOR)
**Action attempted:** Deploy authentication module to staging
**Fault type:** FAULT_INFRA
**Actor penalised:** No — infrastructure fault, actor blameless
**Resolution path:** PATH_B
```

### Ruling 1 — entries are H2, not H1

The RUNTIME.md examples show `# SESSION_FAULT`. Those examples describe a
record's *shape* in isolation, not its position in a file.

`HANSARD.md` opens with a `# HANSARD` title. A document whose body is a run of
sibling H1s does not read as one record — it reads as many documents
concatenated, and every markdown renderer, table-of-contents generator and
GitHub anchor treats it that way.

**Ruling: the document title is H1; every entry is H2.** The RUNTIME.md examples
remain correct as descriptions of an entry's fields; they were never file
layouts.

### Ruling 2 — the entry heading carries timestamp and type

Format: `## <ISO-8601 UTC> — <RECORD_TYPE>`

Both facts are needed to locate an entry, and putting them in the heading makes
the record navigable by anchor and greppable by either axis without parsing
fields. Timestamp first, so that lexical order is chronological order.

### Ruling 3 — record types are an open set

The source documents name `WRIT_DROP`, `SESSION_INVALID`, `SESSION_FAULT`,
`SESSION_FAULT_CRITICAL`, `FAULT_RESOLVED`, `FAULT_RESOLVED_AUTO`,
`ACTOR_STATE`, `SESSION_TIMEOUT`, `POINT_OF_ORDER`, `RULING`, `CASCADE_ALERT`,
`QUARANTINE`, `RESTRUCTURE`, `PROMOTE_SCOPE`, `DEMOTE_SCOPE` and
`STATE_SNAPSHOT` — and never declare the set complete.

**Ruling: `type` is an open string, not a closed enum.** A protocol may record
events CANON never anticipated; that is the point of a protocol layer. Known
types are exported as constants for convenience, not as a constraint.

Record types are always written in CANON, never in protocol vocabulary. A
Parliamentary session records `POINT_OF_ORDER`, not "Point of Order". Vocabulary
translation is a presentation concern; the record must stay machine-comparable
across protocols, which is what makes the research layer possible at all.

### Ruling 4 — attribution is mandatory

Every entry carries `**Actor:** <handle> (<CANON ROLE>)` as its first field. An
unattributed record is not a Hansard record, and the writer must refuse to
produce one rather than emit an anonymous entry. Same for the record type and
the timestamp.

The role is recorded **as at the time of the act**, not as at read time. Actors
are promoted and demoted mid-session; a record that rendered a current role
would silently rewrite history.

### Ruling 5 — fields are single-line; prose goes in the body

Fields render as `**Key:** value` and are single-line. A field value that spanned
lines would be indistinguishable from the prose body on read-back, and the
Hansard's value depends on being unambiguously parseable years later.

Long-form content belongs in the entry body, which follows the fields after a
blank line. Field order is insertion order and is preserved.

### Ruling 6 — append-only is mechanical, not conventional

A Hansard writer must produce a new document that contains the previous document
**verbatim as a prefix**. This is stronger than "don't edit entries": it makes
tampering a diff that cannot hide.

Enforcement is the implementation's job, not a matter of discipline. The
reference implementation is tested by appending N entries and asserting every
intermediate revision remains a prefix of the final document.

Git is the second line of defence, not the first — `HANSARD.md → Append only,
never edited` (POLITIK-ARCHITECTURE.md § FILE OWNERSHIP) is a Standing Order,
and a force-push that rewrites it is itself visible in the reflog.

### Ruling 7 — the Hansard is authoritative; readers are best-effort

`parseEntries()` exists so a record can be audited and asserted against. It is
explicitly best-effort: a document written by an older implementation, or by a
future protocol extension, may parse partially.

**Reading is never authoritative. Git history is.** No engine decision may
depend on a parse succeeding — `STATE.json` carries `hansard_head` precisely so
a resumed agent can detect a state file that lags the record without having to
re-read the whole Hansard.

## Consequences

- `src/hansard.ts` needs no change. Both provisional Phase 2 choices — H2
  entries and an open type set — are ratified as specified above.
- Phase 8.5's Obsidian layer can rely on a stable anchor per entry
  (`#YYYY-MM-DDTHHMMSSZ--RECORD_TYPE`).
- The research layer can compare records across protocols, because record types
  are CANON and never translated.
- A future format change requires a superseding ADR and a migration note; the
  preamble is the natural place to carry a format version if one becomes
  necessary. None is added now — a version field nobody reads is noise.

## Alternatives rejected

**YAML frontmatter per entry.** Machine-cleanest, but a Hansard is read by
humans during an escalation and by clinicians of the record after the fact.
Markdown that renders on GitHub without tooling is worth more than parse
convenience, and the field format is already unambiguous.

**One file per entry (`hansard/NNN.md`).** Trivially append-only and
merge-friendly. Rejected because the Hansard's readability as a single narrative
is its point — a reviewer reconstructing how a decision was made should scroll,
not `ls`. Cascade-level records across the Politik Tree already live in separate
per-node Hansards.

**JSON Lines.** Excellent for the LEDGER, wrong for the record. The Hansard
carries reasoning, not just events.
