# Contributing a Protocol

**Attribution:** Steve Krisjanovs, Cordfuse

A protocol is a vocabulary translation manifest over CANON. Writing one is
authoring, not engineering — you are mapping an existing governance structure
onto primitives that already exist.

---

## What a protocol is, and is not

**It is** a mapping from CANON terms to your domain's vocabulary, plus four
declared behavioural flags.

**It is not** a place to add governance mechanics. If your protocol seems to
need a primitive CANON does not have, that is a finding worth raising as an
issue — not something to encode in a manifest. The engine will never look up a
term it does not have, so an invented key is dead vocabulary that misleads the
next reader. The linter treats it as an error for that reason.

Parliamentary is protocol #1, not a privileged mode. Every domain is equally a
protocol.

---

## Quick start

```bash
politik protocol new my-protocol --mode constitutional --out protocols
# edit protocols/my-protocol.yml
politik protocol lint protocols/my-protocol.yml
```

The generated skeleton maps every CANON role, primitive and verb to itself, so
the full translatable surface is visible in the file. Delete any line you want
to fall back to the CANON term — the fallback is always readable, because CANON
terms were deliberately chosen to be self-evident.

---

## The four flags

Everything else in a manifest is presentation. These four change behaviour:

| Flag | Effect |
|---|---|
| `no_escalation` | No appeals. A Point of Order is a category error, not a governance event. |
| `no_record` | No Hansard. Only for Ephemeral protocols — the session evaporates on close. |
| `immutable_charter` | Standing Orders cannot be amended mid-session. |
| `record_mode` | `distributed` guarantees per-commit attribution, which forbids `merge_strategy: squash` in any Charter using this protocol (ADR-0002 rule 5). |

Set them from how your domain actually behaves, not from what sounds
authoritative. A Darwinist tournament genuinely has no appeals; a corporate
board genuinely does.

---

## Modes

| Mode | Description | Examples |
|---|---|---|
| `constitutional` | Checks and balances, escalation paths, human override | Parliamentary, Legal, Corporate, Peer Review |
| `authoritarian` | Single authority, no Division, escalation routes back to the top | Military, Red/Blue Team |
| `darwinist` | No AUTHORITY during the session, pure statute, no appeals | Battle Royale, Elimination Tournament |
| `ephemeral` | No RECORD by design | Intelligence, Jury Deliberation |
| `immutable` | Standing Orders cannot be amended mid-session | Religion, Aviation, Emergency Services |

The linter warns when your flags disagree with your mode. That is a warning, not
an error — modes are families, not constraints, and you may have a reason. Say
what it is in a comment.

---

## Rules the linter enforces

**Errors** — the protocol will not load:

- `name` must be lower-kebab-case; it is a filename and a Charter key
- every key under `primitives:` must be a CANON primitive or verb
- every key under `roles:` must be a CANON role
- two roles may not share one term — a human could not tell which acted
- `record_mode: ephemeral` requires `no_record: true`

**Warnings** — likely mistakes, not fatal:

- a non-semver `version`
- an unmapped role (falls back to the CANON term)
- flags inconsistent with the declared mode
- `AUTHORITY` in `domain_veto` — AUTHORITY already holds VETO, so this adds
  nothing mechanically. Kept in `red-blue-team.yml` anyway, where it documents
  *what* the Referee vetoes.

---

## Power inversions

Some protocols give a lower-trust role authority over a specific domain: the
Jury (OBSERVER) holds the final Division in a Criminal Trial; a Statistical
Reviewer can reject on methodology alone. Declare these in `domain_veto`. They
are never inferred from the role hierarchy — the whole point is that they
contradict it.

---

## Two constraints that are not yours to change

**AUTHORITY is always human.** No protocol may change this. A Charter declaring
a machine as AUTHORITY fails Writ Drop. Where your domain's authority figure is
nominal — a Battle Royale host who pre-bakes rules and then leaves — map the
role and say so in the term (`Host — pre-session only`).

**Record types stay in CANON.** A Parliamentary session records
`POINT_OF_ORDER`, never "Point of Order" (ADR-0005 ruling 3). Your vocabulary
renders in the interface; the Hansard stays machine-comparable across protocols,
which is what makes cross-protocol research possible at all.

---

## Checklist

- [ ] `politik protocol lint` passes with no errors
- [ ] every CANON role is mapped
- [ ] the four flags match how the domain actually behaves
- [ ] any warning you chose to keep is explained in a comment
- [ ] the file is named `<name>.yml` and `name:` matches it
- [ ] terms come from the domain's real vocabulary, not an approximation of it

Open a PR against `protocols/`. A protocol that lints clean and reads
recognisably to someone from that domain is the bar.
