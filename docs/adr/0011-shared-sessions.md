# ADR-0011 — Shared Sessions Across Machines

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted — building on `feat/shared-sessions` (stacked on ADR-0010).

---

## Context

A session is a git repository, so anyone *could* clone it — but Politik assumed
one machine. Every act committed locally and nothing was ever pulled or pushed.
Two people acting at once on different machines each appended to `HANSARD.md`
and rewrote `STATE.json` from their own copy; their histories diverged and the
record itself became a merge conflict.

ADR-0001 covers the *nudge* between machines (git by default, NATS opt-in). It
never covered keeping the **record** consistent, and there was no way to say where
a shared session lives.

ADR-0010 made this sharper: pending acts were local files, so an act staged by a
harness on one machine was invisible to a Speaker on another.

Both shapes are in scope: several humans, each with their own harness, seated in
one session; and one Speaker with agents running elsewhere.

## Decision

**A session can be shared through any git remote. Sharing is explicit and
opt-in; a session that never configures it behaves exactly as before.**

### 1. Configuring and joining

- `politik remote <url>` makes a session shared: it sets the git remote, turns on
  sync, and publishes the current history. `politik remote` alone shows the
  configuration; `politik remote --off` stops syncing.
- `politik init --remote <url>` does the same at Writ Drop.
- `politik join <url> [dir] --as <handle>` clones a shared session, checks it is a
  session with intact seals, turns on sync and records who the person is (their
  seat handle, see §4). Then they open their own harness there, as in ADR-0010.

The configuration lives in the clone's git config (`politik.sync`,
`politik.remote`, `politik.branch`, `politik.handle`), not in the session's
files: it describes this machine, not the proceeding.

### 2. Sync on every act, with a safe retry

For a shared session, every governance command runs as:

1. **fetch** the remote and **fast-forward** to the latest record;
2. run the act, which commits locally;
3. **push**.

If the push is rejected because someone else acted first, the local act is
discarded (`reset --hard` to where it started), the record is fast-forwarded again,
and the act is **recomputed** against the new record — up to three attempts. This
is safe because every act is computed from the current record; redoing it is not
the same as merging it. Output from discarded attempts is withheld, so the
operator only ever sees the act that was actually recorded (the "record, then
report" rule holds across machines). Nobody hand-merges the Hansard.

**Long-running acts are not retried.** `politik run` spawns an agent; re-running it
would re-run the agent. If its push is rejected, the commit stays local and the
operator is told to run `politik sync`.

**`politik sync`** fetches, fast-forwards, pushes local commits, and refreshes
pending acts. If local and remote have genuinely diverged it attempts a rebase and,
on conflict, aborts and explains rather than guessing.

**Reads** (`status`, `hansard`, `pending`, …) fetch first when they can and quietly
fall back to the local copy when the remote is unreachable.

### 3. Offline: governance refuses, reads keep working

If the remote cannot be reached, governance acts on a shared session **refuse**.
Acting offline and pushing later lets acts land out of order — the divergence this
ADR exists to prevent. Reads still work from the local copy.

### 4. Shared pending acts and who may confirm them

For a shared session, a staged act (ADR-0010) is stored as a git ref,
`refs/politik/pending/<id>`, pointing at a commit that holds the act. These refs
are pushed and fetched with the session but are **never part of its history**:
nothing staged is the record. `politik pending` on any machine lists them;
`politik confirm` on any machine executes one; confirming or rejecting deletes the
ref everywhere.

**Only the seat the act names may confirm it.** Each clone records its person's
seat handle (`politik.handle`, set by `join --as`, falling back to git
`user.name`). `confirm` refuses unless that handle matches the act's `--actor` —
the Speaker confirms the Speaker's assent; nobody confirms it on their behalf.

This is identity by configuration, not proof: anyone can set a name. Where proof
matters, the Charter sets `session.signed_confirmations: required` (§5).

### 5. Identity on the record

Every governance commit carries a third trailer naming the person operating that
clone:

```
Politik-Requested-Via: claude-code_2-1-283_agent
Politik-Confirmed-By: speaker-at-terminal
Politik-Operator: steve <steve@example.com>
```

Under `session.signed_confirmations: required`, a confirmed act's commit is
GPG/SSH-signed with the confirming person's git signing key, and confirmation
refuses if signing fails. `politik integrity` reports any confirmed commit whose
signature does not verify.

## Threat model

Sync makes the record consistent across machines; it does not make every machine
trustworthy. Who can act at all is who can push to the remote — Politik's existing
model ("repo access = taking a seat"), enforced by the host (branch protection,
access control). The handle check stops honest mistakes and casual impersonation;
signed confirmations stop forgery by anyone without the confirming person's key.
ADR-0010's limits still apply on each machine.

## Consequences

- Several people and their agents can share one session from different machines,
  each through their own harness.
- The record never needs a manual merge in normal use.
- A shared session needs the remote to be reachable to act.
- Retried acts that project to an SCM provider (ADR-0004) may attempt the
  projection again; projection is recorded either way, so a duplicate attempt is
  visible rather than silent.
