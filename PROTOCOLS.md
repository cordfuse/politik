# POLITIK — PROTOCOL LIBRARY

**Attribution:** Steve Krisjanovs, Cordfuse

See [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md) for CANON, session structure, and the engine layer.

---

## Implementation status

This document is the shipping protocol library — the eleven manifests in
`protocols/*.yml`, each a vocabulary translation over CANON plus a composition of
mechanics. What the engine enforces:

- **Vocabulary** — enforced. A protocol's role and primitive terms translate
  CANON for the interface and the record.
- **Behavioral flags** — mostly enforced. `session.escalation` is wired
  (a protocol declaring no escalation refuses a Point of Order — see
  [ADR-0006](docs/adr/0006-protocol-behavioral-enforcement.md)), and
  `immutable_charter` is now enforced: the engine fingerprints the Charter at
  Writ Drop and refuses a governance act if CHARTER.md is edited afterwards, so
  an adversarial-collaboration or elimination-tournament session cannot have its
  Standing Orders changed mid-session. `no_record` remains declared but
  unenforced — no shipping protocol sets it.
- **Mechanics** — enforced (ADR-0007). Each protocol composes how a decision
  resolves (majority · supermajority · unanimity), how an actor exits (division ·
  elimination · none), and when a session ends (objective · last-standing ·
  verdict). A Jury needs unanimity and seals on a verdict; an `exit: elimination`
  protocol genuinely culls the losing side of a Division. `mode: darwinist` is no
  longer just a flag.
- **Tournament mechanics** — built. The **MATCH** primitive (ADR-0009) supplies
  the 1v1 contest a Division cannot model; `politik pair` generates Swiss /
  round-robin / single-elimination rounds, `politik match` settles them, and
  `politik standings` scores the field (win-loss · survival). Seeding
  (`pair --seed` folds the field so strong seeds meet late, and breaks equal-score
  ties in later rounds), best-of-N series (`pair --best-of 3`, reported game by
  game), and Buchholz tie-breaks (strength of schedule, applied to the win-loss
  ranking) are all built. What stays on the research agenda
  ([RESEARCH.md](RESEARCH.md)) is the Nash-equilibrium *behaviors* the "Nash Eq"
  lines below predict — the engine records what emerges; it does not force agents
  to play equilibrium.

Parliamentary is protocol #1, not a privileged mode. `scaffold --protocol <name>`
scaffolds a Charter for any of the eleven, inheriting its mechanics. **Compose
your own** for any governance shape not here — the framework is the product, and
a new protocol is a Charter away.

---

## The eleven protocols

### Political archetypes

**Protocol: Parliamentary Democracy (reference — ships first)**
| CANON | Term |
|---|---|
| AUTHORITY | Speaker |
| DELEGATE | Deputy Speaker |
| OPERATOR | Minister |
| MEMBER | Backbencher |
| OBSERVER | Gallery |
| SESSION | Parliament |
| CHARTER | Standing Orders |
| RECORD | Hansard |
| MOTION | Tabled Motion |
| DIVISION | Division |
| ASSENT | Royal Assent |
| ESCALATION | Point of Order |
| SUSPENSION | Adjournment |
| DISSOLVE | Prorogation |
| EXIT | Resigned from the House |
| CONFLICT | Competing Amendments |
| DEADLOCK | Hung Parliament |
| PROMOTE | Appointed to Cabinet |
| DEMOTE | Returned to Backbench |
Mode: Constitutional

**Protocol: Republic (US-style)**
| CANON | Term |
|---|---|
| AUTHORITY | President |
| DELEGATE | Vice President |
| OPERATOR | Secretary / Senator |
| MEMBER | Representative |
| OBSERVER | Constituent |
| SESSION | Congress |
| CHARTER | Constitution |
| RECORD | Congressional Record |
| MOTION | Bill |
| DIVISION | Vote |
| ESCALATION | Filibuster |
| SUSPENSION | Recess |
| EXIT | Impeached / Resigned |
| DEADLOCK | Government Shutdown |
| VETO | Presidential Veto |
Mode: Constitutional (AUTHORITY holds strong VETO)

**Protocol: Monarchy**
| CANON | Term |
|---|---|
| AUTHORITY | The Crown |
| DELEGATE | Lord Chancellor |
| OPERATOR | Noble / Lord |
| MEMBER | Knight / Subject |
| OBSERVER | Commoner |
| SESSION | Royal Court |
| CHARTER | Royal Decree |
| RECORD | Royal Chronicle |
| MOTION | Petition |
| DIVISION | Royal Assent |
| ESCALATION | Appeal to the Crown |
| EXIT | Banished / Executed |
Mode: Authoritarian with Constitutional elements

**Protocol: Socialism / Collective**
| CANON | Term |
|---|---|
| AUTHORITY | Party Chair |
| OPERATOR | Comrade Commissar |
| MEMBER | Worker Delegate |
| OBSERVER | Civilian |
| SESSION | Collective |
| RECORD | Party Record |
| MOTION | Party Directive |
| ESCALATION | Party Challenge |
| EXIT | Sent to Re-education / Purged |
| DEADLOCK | Party Purge |
Mode: Authoritarian (collective in theory, party in practice)

---

### Deliberative & scientific

**Protocol: Jury Deliberation**
| CANON | Term |
|---|---|
| AUTHORITY | Foreperson |
| MEMBER | Juror |
| SESSION | Deliberation |
| CHARTER | Jury Instructions |
| RECORD | None — deliberations sealed |
| MOTION | Argument |
| DIVISION | Verdict Vote |
| ESCALATION | Note to Judge |
| SUSPENSION | Recess |
| EXIT | Dismissed / Replaced |
| DEADLOCK | Hung Jury |
Mode: Constitutional + Ephemeral (record sealed) · resolution: unanimity · termination: verdict

**Protocol: Peer Review**
| CANON | Term |
|---|---|
| AUTHORITY | Editor / Programme Chair |
| DELEGATE | Associate Editor |
| OPERATOR | Reviewer |
| MEMBER | Author |
| OBSERVER | Scientific Community |
| SESSION | Review Cycle |
| CHARTER | Review Criteria / Journal Standards |
| RECORD | Review History / Decision Log |
| MOTION | Submission |
| DIVISION | Accept / Reject / Major Revision |
| ESCALATION | Appeal to Editor-in-Chief |
| SUSPENSION | Decision Issued |
| EXIT | Withdrawn / Desk Rejected |
| DEADLOCK | Split Decision — additional reviewer assigned |
| DOMAIN_VETO | Statistical Reviewer (can reject on methodology alone) |
Mode: Constitutional · termination: verdict. `operator_identity: anonymous` — reviewer identities sealed by Charter.

**Protocol: Adversarial Collaboration**
| CANON | Term |
|---|---|
| AUTHORITY | Independent Arbitrator |
| OPERATOR | Proponent Agent |
| OPERATOR | Opponent Agent |
| OBSERVER | Scientific Community |
| SESSION | Collaboration |
| CHARTER | Pre-registered Agreement (immutable — both parties commit before data collection) |
| RECORD | Joint Report |
| MOTION | Experimental Run |
| DIVISION | Result Interpretation |
| ESCALATION | Arbitrator Ruling |
| SUSPENSION | Joint Publication |
| EXIT | Protocol Violation — arbitrator intervenes |
| DEADLOCK | Genuinely ambiguous result — documented as such |
Mode: Constitutional + Immutable Charter. Both OPERATOR agents commit to accepting the result before the session begins; the Charter cannot be amended after the experiment starts — a formal solution to confirmation bias.

---

### Operational

**Protocol: Emergency Response / ICS**
| CANON | Term |
|---|---|
| AUTHORITY | Incident Commander |
| DELEGATE | Operations Section Chief |
| OPERATOR | Division Supervisor |
| MEMBER | Unit Leader |
| OBSERVER | Agency Liaison |
| SESSION | Incident |
| CHARTER | ICS Protocol |
| RECORD | Incident Action Plan / ICS-214 |
| MOTION | Tactical Assignment |
| DIVISION | None — IC decides |
| ESCALATION | Safety Officer Override |
| SUSPENSION | Demobilization |
| EXIT | Relieved / Reassigned |
| DOMAIN_VETO | Safety Officer (can override IC on safety) |
Mode: Authoritarian with DOMAIN_VETO safety carve-out

**Protocol: Corporate / Board**
| CANON | Term |
|---|---|
| AUTHORITY | CEO / Chair |
| DELEGATE | COO |
| OPERATOR | VP / Director |
| MEMBER | Manager |
| OBSERVER | Shareholder |
| SESSION | Board Meeting / Quarter |
| CHARTER | Corporate Policy |
| RECORD | Minutes |
| MOTION | Proposal / Initiative |
| DIVISION | Board Vote |
| ESCALATION | Escalation to Legal / Board |
| SUSPENSION | End of Quarter |
| EXIT | Resigned / Terminated |
| DEADLOCK | Board Deadlock |
| PROMOTE | Promoted to VP |
| DOMAIN_VETO | Shareholder (special resolution veto) |
Mode: Constitutional

---

### Competitive

**Protocol: Elimination Tournament**
| CANON | Term |
|---|---|
| AUTHORITY | Tournament Director |
| SESSION | Tournament |
| CHARTER | Tournament Rules |
| RECORD | Bracket |
| MOTION | Match |
| DIVISION | Match Result |
| ESCALATION | Protest / Appeal |
| SUSPENSION | Bye Round |
| EXIT | Eliminated — bracket closes |
| DEADLOCK | Tiebreaker Round |
| QUORUM | Minimum entrants |
Mode: Darwinist — losers exit permanently · exit: elimination · termination: last-standing. Pairs via the MATCH primitive (`politik pair`/`match`); standings via `politik standings`.

---

### Solo

**Protocol: Solo (single-lead)**
| CANON | Term |
|---|---|
| AUTHORITY | Lead |
| DELEGATE | Co-lead |
| OPERATOR | Maintainer |
| MEMBER | Contributor |
| OBSERVER | Watcher |
| SESSION | Session |
| CHARTER | Working Agreement |
| RECORD | Log |
| MOTION | Proposal |
| DIVISION | Vote |
| ESCALATION | Flag |
| SUSPENSION | Paused |
| EXIT | Left |
| DEADLOCK | Stuck |
Mode: Constitutional — a permissive single-lead default for a solo dev or small team

---

### Game Theory Analysis

Each protocol instantiates a formal game structure. The engine records what
emerges; the analytical layer (RESEARCH.md) describes the equilibria — it does
not force agents to play them.

| Protocol | Game Structure | Nash Eq Prediction |
|---|---|---|
| Parliamentary | Cooperative with veto players | Stable coalition at the quorum threshold |
| Emergency Response / ICS | Stackelberg leader-follower | Full compliance, zero deviation |
| Jury Deliberation | Unanimity / holdout game | Convergence to consensus, or a hung jury |
| Elimination Tournament | All-pay elimination | Aggressive early, conservative late |
| Peer Review | Multi-player review, information asymmetry | Honest assessment when anonymity is credible |
| Adversarial Collaboration | Two-player, pre-committed | Honest reporting — defection contractually costly |

---

Politik did not design around GitHub. GitHub accidentally IS a Politik session.

| Politik Primitive | GitHub Feature |
|---|---|
| Session / Politik | Repository |
| Writ Drop | Repo created from template |
| Standing Orders | CHARTER.md + Wiki |
| Hansard entry | Commit |
| Motion | Pull Request |
| Division vote | PR Review (Approve / Request Changes) |
| Motion Carried | PR Merged |
| Motion Defeated | PR Closed |
| Point of Order | Issue |
| Speaker Ruling | Issue Comment + Close |
| Debate | Discussion |
| Resolution | Discussion Answer |
| Parliamentary sitting | Milestone |
| Procedural status | Label |
| Order Paper | GitHub Projects board |
| Constituency join | Repo collaborator access |
| Actor mandate | CODEOWNERS entry |
| Quorum enforcement | Required reviewers (branch protection) |
| Standing Order enforcement | Branch protection rules |
| Speaker notification | GitHub Actions + email |
| Clerk automation | GitHub Actions workflows |
| Speaker credentials | Repository secrets |
| Sub-session / Committee | Branch |
| Committee reports back | Branch merged to main |
| Schism | Fork |
| Prorogation | Milestone closed + repo archived |

---
