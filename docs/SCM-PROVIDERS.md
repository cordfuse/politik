# SCM Provider Interface

**Attribution:** Steve Krisjanovs, Cordfuse

GitHub is the reference implementation. The framework never talks to an SCM
directly — it talks to `ScmProvider`, and anything that implements those eleven
methods can host a Politik session.

This document is the contract. `src/providers/github.ts` is the worked example.

---

## What a provider is responsible for

A provider is **transport and platform mapping only.** It turns CANON acts into
API calls and returns typed handles.

It is **not** responsible for governance. It does not decide whether a Motion
carried, whether an actor may vote, or whether a session is suspended. Those
questions are settled before a provider method is ever called. A provider that
starts making governance decisions has moved logic out of the Hansard's reach,
which defeats the point of the framework.

Concretely: `merge()` enacts a Motion. It does **not** check whether the Motion
carried — the caller does that, because the answer belongs in the record.

---

## The interface

```ts
interface ScmProvider {
  readonly name: string;

  commit(message: string, files: readonly FileWrite[]): Promise<CommitRef>;
  openPR(title: string, body: string, branch: string): Promise<MotionRef>;
  requestReview(pr: number, actors: readonly string[]): Promise<DivisionRef>;
  merge(pr: number, strategy: MergeStrategy): Promise<AssentResult>;
  openIssue(title: string, body: string, labels: readonly string[]): Promise<EscalationRef>;
  openDiscussion(title: string, body: string, category: string): Promise<Ref>;
  closeMilestone(id: string): Promise<void>;
  notify(actor: string, message: string): Promise<void>;
  triggerWorkflow(name: string, inputs: Readonly<Record<string, string>>): Promise<Ref>;
  createLabel(name: string, color: string): Promise<Ref>;
  addCollaborator(grant: CollaboratorGrant): Promise<void>;
}
```

Full definitions in `src/scm.ts`.

### CANON mapping

| Method | CANON | Platform (GitHub) |
|---|---|---|
| `commit` | RECORD write | git data API |
| `openPR` | MOTION | pull request |
| `requestReview` | DIVISION | review request |
| `merge` | ASSENT | merge |
| `openIssue` | ESCALATION | issue |
| `openDiscussion` | debate floor | discussion |
| `closeMilestone` | prorogation step | milestone |
| `notify` | Speaker notification | issue @-mention |
| `triggerWorkflow` | Clerk automation | Actions dispatch |
| `createLabel` | taxonomy | label |
| `addCollaborator` | taking a Seat | collaborator |

---

## Contracts every provider must honour

**1. Every call is async.** Every provider is a network boundary.

**2. Every mutation returns a typed handle.** Never a bare string. The Hansard
writer needs something attributable to record — an opaque `id` plus a
human-readable `url`. Identifiers stay opaque; the engine never parses them.

**3. `commit()` is one commit for the whole file set.** A Writ Drop writes nine
files. Landing that as nine commits would put nine Hansard-visible events on the
record for one governance act. Use whatever batching your platform offers — on
GitHub that is blobs → tree → commit → ref.

**4. A non-zero result is a result; a transport failure is an error.** Throw when
the platform genuinely failed (auth rejected, host unreachable). Do not throw
because a governance outcome was unfavourable.

**5. Never leak credentials into an error.** Error messages reach the Hansard,
and the Hansard is often public. The reference provider is tested for this: a
403 response must not put the token in the message.

**6. Fail loudly on an unimplementable method.** If your platform genuinely
cannot do something, throw with a clear reason and a status — do not silently
succeed. The reference provider does exactly this for `openDiscussion`, which
GitHub exposes only through GraphQL: it throws 501 rather than bending the
interface to accommodate a platform detail.

**7. Map CANON roles to platform permissions explicitly, and say it is a
mapping.** Governance trust and repository capability are different axes.
GitHub's mapping (`AUTHORITY`→admin, `DELEGATE`→maintain, `OPERATOR`/`MEMBER`
→push, `OBSERVER`→pull) is a **design decision, not a spec quotation**, and it
is labelled as such in the code. OPERATOR and MEMBER deliberately collapse to
one permission: the Charter separates their verbs, not the repo ACL. The SCM is
the coarse outer gate; governance lives in the Hansard.

**8. Merge strategy mapping may be approximate — document it.** GitHub has no
true fast-forward, so `fast_forward` maps to `rebase` (no merge node). ADR-0002
rule 6 already confines fast_forward to quorum-1 sessions, where there is no
Division to evidence. Say what you mapped and why.

---

## Testing a provider

The reference provider's tests inject a `fetch` double and assert the exact URL,
method and body of every request. No network, no token, no fixtures to refresh.

```ts
const gh = new GitHubProvider({ owner, repo, token: 'tok', fetch: stub });
```

Take `fetch` (or your platform client) as a constructor option. A provider that
hard-codes its transport cannot be tested without credentials, and nobody will
run those tests.

Verify against the real platform at least once before shipping. Phase 3 found
two documented-but-wrong CLI invocations that way; the same applies to APIs.

---

## Contributing a provider

GitLab, Gitea and Forgejo are **community contributions** — Cordfuse ships and
maintains the GitHub reference implementation only. That is a deliberate scope
decision: one provider maintained properly is worth more than four maintained
thinly.

### Checklist

- [ ] implements all eleven methods, or throws with a reason for any the
      platform cannot support
- [ ] takes its HTTP client as an injectable option
- [ ] tests assert request shape without a network
- [ ] verified live against the real platform at least once
- [ ] credentials never appear in an error message
- [ ] `commit()` produces one commit per call
- [ ] role→permission mapping documented as a decision
- [ ] merge strategy approximations documented

### Where it goes

```
src/providers/
  github.ts     <- reference, maintained by Cordfuse
  gitlab.ts     <- community
  gitea.ts      <- community
  forgejo.ts    <- community
```

Open a PR against `src/providers/`. A provider that passes its own tests, has
been run against the real platform once, and is honest about what it cannot do
is the bar.

---

## What the framework guarantees you

Everything above the provider is pure — no I/O, no clock, no randomness.
Charter validation, state transitions, the Hansard, quorum, escalation and
prorogation all run without touching a network. A provider therefore never has
to reason about governance state; it receives a finished decision and a file
set, and puts them somewhere.
