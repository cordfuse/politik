# ADR-0008 — Session Storage: Subtree vs. Standalone Repo

**Attribution:** Steve Krisjanovs, Cordfuse

**Status:** Accepted — **fully built.** Phase 1 (monorepo placement, auto-detected),
phase 2 (federation as local traversal — `politik registry`/`cascade`), and phase 3
(explicit mode: `init --standalone` overrides the default) all implemented.

---

## Context

EXECUTION.md § The Politik Tree makes **every node its own git repository** —
"just a new repo with `inherits_from` pointing at it." A real organisational tree
(Org → Division → Team → Sprint → Ticket → Sub-ticket) is therefore a repo at
every level: a single Jira-style board becomes hundreds, a company thousands.

This is operationally heavy, and the evidence is in the codebase: the **federation
layer — whose entire job is to wrangle those repos** (the GLOBAL layer, the
session registry, cross-repo cascade propagation) — is the least-built part of
Politik, flagged as backlog in `docs/AUDIT.md`. When the hardest, unfinished part
of a design is the part that manages the design's own multiplicity, the design is
signalling a problem. Even at small scale (twenty tickets, twenty repos) the
sprawl is a real adoption blocker — nobody spins up twenty repos to try a tool.

The root cause is a conflation. **"A session is a git repo" was read as "a session
is its own *standalone* repo."** But the engine does not require that. The CLI
operates on `--dir` — a session is a *directory under git* holding CHARTER.md,
HANSARD.md, STATE.json and LEDGER.md. And `inherits_from` is a **Charter field**
(data), indifferent to whether the parent is a sibling directory or a separate
repository. `tree.ts` — the inheritance, cascade, and quarantine logic — operates
on Charters, not on repos. So *where* a session's directory lives is a deployment
concern, not an architectural one.

## Decision

**A session is a git-tracked directory containing its four records. Whether that
directory is a standalone repository or a subtree of a larger one is a deployment
choice; the session logic is identical.** Politik supports two modes, and the
default changes:

### Monorepo mode — the new default

The whole Politik tree lives in one repository; nodes are nested directories;
`inherits_from` points at a parent directory. One clone, one CI, trivial
discovery. Critically, **the unbuilt federation becomes tractable**: cascade,
actor mobility, the registry, and "state of everything" reduce to local file
operations over one working tree, instead of cross-repository orchestration git
was never built for. The hard part gets easy.

### Standalone-repo mode — a supported mode, not the default

One repository per node, retained for the two cases that justified it:
- **GitHub-native projection** — a standalone repo can carry per-session pull
  requests, reviews and issues (Motion / Division / Escalation), which a
  directory cannot.
- **Per-node access control** — a repository is a permission boundary; a
  directory is not.

Both are real needs for large organisations. They are not needs for a solo dev or
a small team, who are the near-term adopters and for whom the default must be
manageable.

The engine stays **storage-agnostic** — it already does. Only `scaffold`/`init`
(where a session's directory is placed and what `inherits_from` points at) and the
federation orchestration differ by mode.

## Consequences

- **Manageable by default.** One repo, one clone, one CI, `grep`-able discovery.
  The tree is legible instead of scattered across an org's repo list.
- **Federation becomes buildable.** The most ambitious, least-built piece —
  cascade propagation, the session registry, actor mobility across the tree —
  becomes ordinary file traversal in monorepo mode. This is the strongest reason
  to flip the default: it doesn't just tidy the sprawl, it unblocks the roadmap.
- **Cost — per-session GitHub projection is monorepo's price.** A directory
  cannot own a pull request, so monorepo mode drops per-session PR/review/issue
  projection. Standalone mode keeps it. This is acceptable: projection is already
  *optional* (ADR context; a session is complete on git alone), so the core is
  untouched — only the GitHub-native *presentation* narrows.
- **Better onboarding and demo.** "Clone one repo — here is your whole governance
  tree" beats "create a repo per ticket" decisively.
- **Access control is coarser** in monorepo mode (one boundary; path-based
  CODEOWNERS partially mitigates). Reach for standalone mode when per-node ACL is
  a hard requirement.
- **Scale trade is a wash.** A monorepo with many sessions and full Hansards
  grows large; standard monorepo tooling handles that. Standalone spreads the load
  but multiplies the repos. Neither is a blocker at realistic scale, and monorepo's
  problems appear only at *high* scale, where standalone's appear immediately.
- **POLITIK-ARCHITECTURE.md and EXECUTION.md are not amended by this ADR.** The
  tree model stands; this ADR reinterprets "node = repo" as "node = git-tracked
  directory (standalone repo *or* subtree)." Those documents should be revised to
  match when the architecture doc is next opened — with explicit human instruction,
  as the locked invention disclosure requires.

## Implementation (phased, not yet built)

1. **`scaffold --tree <parent-dir>` / monorepo placement.** Init a session as a
   subdirectory of a parent node, `inherits_from` resolved to the parent
   directory rather than a repo. Standalone remains the current behavior.
2. **Federation as local traversal — built.** The registry ("all sessions and
   their state"), cascade propagation, and roll-up implemented as reads over the
   monorepo tree in `src/federation.ts`, surfaced as `politik registry` and
   `politik cascade` — the GLOBAL layer the audit listed as backlog.
3. **Mode is a CLI setting — built.** The default is auto-detect (monorepo when
   already inside a repo); `politik init --standalone` is the explicit opt-out,
   nesting the session its own repo even inside an enclosing tree — for the
   GitHub-native-projection and per-node-ACL cases standalone mode exists for.
