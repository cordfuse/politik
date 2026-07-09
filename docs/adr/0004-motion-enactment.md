# ADR-0004 — Motion Enactment: ASSENT, Merge Strategy, and CONFLICT vs DEADLOCK

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Proposed — requires human ruling. Amends CANON.

---

## Context

A `MOTION` is a Pull Request. A `DIVISION` is the vote on it. PROTOCOLS.md:1055
maps "Motion Carried" to "PR Merged".

**But nothing in Politik can merge a Motion.** There is no CANON verb for
enactment, and `scm` exposes no merge method. A Motion can be tabled, debated,
and carried — and then the proceeding has no way to give effect to its own
decision. The framework can decide but cannot act.

Three further gaps compound this, all discovered together:

1. **No merge strategy vocabulary.** `squash`, `fast-forward`, `merge commit`,
   and `force-push` appear **zero times** across every specification document.
   `rebase` appears only as a catastrophe (RUNTIME.md § "Agent executed rebase on
   protected branch" — unrecoverable session damage).
2. **`DEADLOCK` is overloaded.** CANON defines it as "irreconcilable state — no
   valid Division outcome" (POLITIK-ARCHITECTURE.md:147). The Software
   Development protocol maps it to "Merge Conflict" (PROTOCOLS.md:122). These are
   not the same thing.
3. **`DEADLOCK` has no exit.** It is named as a state and never handled. No
   document specifies how a proceeding leaves it.

## The load-bearing observation

**Merge strategy is not an implementation detail in Politik. It is a Charter-level
constraint, because each strategy makes a different promise about the Hansard.**

The Hansard is append-only, immutable, and attributed. That is the framework's
central claim. Merge strategy directly determines whether that claim survives
contact with git:

| Strategy | Effect on the Hansard |
|---|---|
| **Merge commit** | Preserves every actor's individual commits **and** records a merge node proving a Division occurred. Attribution chain intact. |
| **Squash** | Collapses an actor's commits into one. **Destroys per-commit attribution inside the Motion.** |
| **Fast-forward** | Leaves no merge node. **The Hansard contains no evidence a Division ever happened.** The Motion silently becomes trunk. |

A framework whose thesis is the attributed forensic record cannot treat squash
and fast-forward as neutral options. Both erase evidence the Hansard exists to
guarantee.

---

## Proposal 1 — New CANON verb: `ASSENT`

Add to the CANON verb table:

| Canonical | Description |
|---|---|
| `ASSENT` | Enact a carried Motion — merge the PR. Distinct from `VOTE`. |

`DIVISION` decides. `ASSENT` enacts. Whoever holds `ASSENT` under the Charter is
the actor who may push the button — which is precisely the governance question a
merge represents.

**Vocabulary note (corrected).** An earlier draft of this ADR claimed
PROTOCOLS.md:97 mis-mapped `DIVISION` → "Royal Assent" in the Parliamentary
protocol. That was wrong on two counts, and the claim is withdrawn:

- Line 97 belongs to the **Monarchy** protocol, not Parliamentary.
- Parliamentary already maps `DIVISION` → "Division", which is correct.
- Monarchy is Authoritarian-mode: there is no vote, and the Crown's assent *is*
  the decision. `DIVISION` → "Royal Assent" is therefore defensible as written.

What the protocols actually need is an `ASSENT` **term**, which no protocol has
because no such primitive existed:

- Parliamentary: `ASSENT` → "Royal Assent" (in Westminster practice, Royal Assent
  is precisely the enactment following the Division — the term fits `ASSENT`, not
  `DIVISION`).
- Software Development: `ASSENT` → "Merge".

This produces a term collision: "Royal Assent" would name `DIVISION` under
Monarchy and `ASSENT` under Parliamentary. Protocols are independent translation
manifests, so this is legal — a term may mean different things in different
protocols. It is nonetheless confusing, and **Ruling 4 below asks whether to
accept it.**

**Preconditions.** `ASSENT` is invalid unless the Motion carried a Division, the
session is `CONVENED`, and no `VETO` is outstanding. An `ASSENT` on an uncarried
Motion is a Standing Orders violation.

## Proposal 2 — Charter key: `merge_strategy`

```yaml
session:
  merge_strategy: merge_commit    # merge_commit | squash | fast_forward
```

**Default: `merge_commit`.** It is the only strategy that preserves both
attribution and proof of Division.

The ruling below decides whether the other two are *banned* or merely *off by
default*.

## Proposal 3 — New CANON primitive: `CONFLICT`

| Canonical | Description |
|---|---|
| `CONFLICT` | Two Motions touch the same lines. Mechanical, routine, resolvable by an actor. |

`CONFLICT` is not `DEADLOCK`. A merge conflict is an ordinary event in
concurrent work; a `DEADLOCK` is a governance failure in which the vote itself
cannot produce an answer. Conflating them means routine textual overlap gets
classified as a constitutional-grade impasse.

Resolution: `CONFLICT` is resolved by any actor holding `WRITE` on the Motion,
recorded in the Hansard. It never escalates on its own. It escalates only if
resolution is itself disputed — at which point it becomes an `ESCALATION`, by the
existing mechanism.

PROTOCOLS.md:122 changes from `DEADLOCK | Merge Conflict` to
`CONFLICT | Merge Conflict`, and the Software Development protocol gains a
distinct `DEADLOCK` mapping (proposed: "Irreconcilable Review — Tech Lead
rules").

## Proposal 4 — `DEADLOCK` gains an exit

`DEADLOCK` is currently terminal by omission. Proposed resolution ladder,
reusing mechanisms that already exist:

1. `DEADLOCK` declared → session auto-suspends
   (`state: SUSPENDED`, `suspension.cause: DEADLOCK` — extends ADR-0003's enum).
2. AUTHORITY rules, exactly as for a Point of Order.
3. If AUTHORITY is absent or is itself the subject, the existing
   `CONSTITUTIONAL_CRISIS` path applies.

No new machinery. `DEADLOCK` becomes a fourth suspension cause, and the Speaker
resolves it like any other halt.

---

## Rulings required

**Ruling 1 — Is `squash` banned, or merely off by default?**

- *Banned:* the Charter validator rejects `merge_strategy: squash` outright.
  Consistent with the Hansard's immutability claim; a squashed Motion cannot
  produce a per-actor forensic record. Costs flexibility for protocols that
  genuinely do not care (Hackathon, Battle Royale).
- *Off by default:* permitted where a protocol declares it, with the attribution
  loss recorded at Writ Drop. Preserves protocol-agnosticism, which is a stated
  design principle ("Parliamentary is protocol #1, not a privileged mode").

  *My recommendation:* **off by default, and prohibited whenever
  `protocol.record_mode` is `distributed`.** This ties the ban to the record
  guarantee rather than to a blanket rule, and it lets Ephemeral protocols —
  which already discard the record — squash freely. It keeps the framework
  protocol-agnostic while making the constitutional case where the record
  actually matters.

**Ruling 2 — Is `fast_forward` ever legitimate?**

A fast-forward leaves no proof a Division occurred. *My recommendation:* permit
it only when `session.quorum: 1`, where there was no Division to record. Reject
it otherwise.

**Ruling 3 — Does `ASSENT` default to AUTHORITY only?**

*My recommendation:* yes, with the Charter free to grant it to `DELEGATE` or
`OPERATOR`. Defaulting the merge button to the Speaker matches every
Constitutional-mode protocol; Darwinist and Authoritarian protocols will want to
move it.

**Ruling 4 — Is the "Royal Assent" term collision acceptable?**

Under Monarchy, "Royal Assent" names `DIVISION`. Under Parliamentary it would
name `ASSENT`. Both are correct within their own protocol.

*My recommendation:* **accept the collision.** Protocols are independent
vocabulary manifests over CANON — that independence is the whole design. Forcing
globally-unique industry terms across 35+ protocols would distort the vocabulary
to serve the engine, which inverts the framework's stated direction of
translation (CANON → industry vocabulary, never the reverse). The engine never
reads these terms; only humans do, and always inside one protocol at a time.

---

## Consequences

- **CANON changes.** One new verb (`ASSENT`), one new primitive (`CONFLICT`).
  `POLITIK-ARCHITECTURE.md` — the invention disclosure — must be amended. Per
  repo Rule 1 this requires explicit human instruction, which is why this ADR is
  Proposed and not Accepted.
- **SCM interface grows.** `scm.merge(pr, strategy)` is required. The interface
  also still lacks `createBranch`, `removeCollaborator`, `updatePermission`, and
  tag/release methods — all needed by verbs CANON already defines (`FIRE`,
  `EXPEL`, `DEMOTE`, `DISSOLVE`). Those are signature work, not governance, and
  are tracked separately.
- **ADR-0003 extended.** `suspension.cause` gains `DEADLOCK`.
- **PROTOCOLS.md changes.** Line 122 (`DEADLOCK` → Merge Conflict) is wrong as
  written and becomes `CONFLICT` → Merge Conflict. Protocols additionally gain an
  `ASSENT` term. Line 97 (Monarchy `DIVISION` → Royal Assent) is **correct** and
  is left alone.
- **No reverting.** A carried and assented Motion later found wrong still has no
  path back. `REVERT` is deliberately out of scope here; it deserves its own ADR.
