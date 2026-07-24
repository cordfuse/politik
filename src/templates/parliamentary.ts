/**
 * Parliamentary protocol templates.
 *
 * Charter, role definitions, Standing Orders and the GitHub label taxonomy for
 * protocol #1. These are what a Speaker starts from — editable prose, not
 * engine configuration.
 *
 * Role files describe a *constituency* in Parliamentary vocabulary while naming
 * the CANON role they map to. The engine reads the CANON role; the human reads
 * the title. That separation is the whole point of the protocol layer.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from '../canon.ts';
import type { FileWrite } from '../scm.ts';

/* -------------------------------------------------------------------------- */
/* Charter                                                                     */
/* -------------------------------------------------------------------------- */

export interface CharterTemplateOptions {
  readonly quorum?: number;
  readonly inherits_from?: string | null;
  readonly speaker?: string;
}

/**
 * A Parliamentary CHARTER.md a Speaker can edit and drop.
 *
 * `merge_strategy` is deliberately `merge_commit`: Parliamentary declares
 * `record_mode: distributed`, and ADR-0002 rule 5 rejects squash under a
 * distributed record mode because squash destroys the per-commit attribution
 * that record mode guarantees.
 */
export const charterTemplate = (options: CharterTemplateOptions = {}): string => {
  const quorum = options.quorum ?? 2;
  const inherits = options.inherits_from ?? null;

  return `---
charter_version: 1.0.0
protocol: parliamentary
inherits_from: ${inherits === null ? 'null' : inherits}

session:
  quorum: ${quorum}                      # minimum actors for a valid Division
  escalation: enabled            # Points of Order may be raised
  heartbeat_timeout_hours: 4     # no Hansard commit in this window => STALE
  deadline: null                 # ISO-8601 wall-clock ceiling, or null
  merge_strategy: merge_commit   # squash is invalid under record_mode: distributed
  assent: AUTHORITY              # only the Speaker enacts a carried Motion

  endurance:
    max_motions: null
    max_cost_usd: null

ledger:
  enabled: true
  visibility: public
  path: LEDGER.md

minimum_cast:                    # enforced at Writ Drop; hard fail
  AUTHORITY: 1
  OPERATOR: 1

domain_veto: []

constituencies:
  - role: AUTHORITY              # Speaker — human, always
    slots: 1
    auto_demotion: false

  - role: OPERATOR               # Ministers
    slots: 2
    auto_demotion: false
    hard_skills:
      required: []
      excluded: []
    model:
      required: null
      preferred: null
      knowledge_cutoff_minimum: null
    mandate_alignment: null

  - role: MEMBER                 # Backbenchers
    slots: 2
    auto_demotion: false
---

# Standing Orders

The prose below is read by actors, not parsed by the engine. Everything the
engine enforces is in the frontmatter above.

## 1. The House

This Parliament sits to deliver the business set out in the Order Paper. The
Speaker is constitutionally present, not operationally present: they drop the
Writ, rule on Points of Order, and prorogue. They do not do the work.

## 2. Motions

Any Minister may table a Motion. A Motion is a pull request; its body states
what is proposed and why. A Motion that changes the Charter must say so in its
first line.

## 3. Divisions

A Motion carries when it satisfies quorum and no Veto stands. A Division is a
review. Abstention is not a vote and does not count toward quorum.

## 4. Points of Order

Any actor may raise a Point of Order when the correct action requires a
judgement the Charter does not settle. The sitting suspends. The Speaker rules;
the ruling is committed and permanent.

Do not proceed on a question you cannot resolve. Raising a Point of Order is
always in order; guessing is not.

## 5. The Hansard

The Hansard is append-only. No actor edits an entry once committed, including
their own. Work that is not committed did not happen.

## 6. Conduct

Debate the Motion, not the Member. Bad-faith escalation — a Point of Order
citing a violation that does not appear in the record — is itself a Standing
Orders violation.
`;
};

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

interface RoleTemplate {
  readonly file: string;
  readonly canon: Role;
  readonly title: string;
  readonly body: string;
}

const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    file: 'speaker.md',
    canon: 'AUTHORITY',
    title: 'Speaker',
    body: `The constitutional authority of this Parliament. **Always human — the
Charter cannot declare a machine as Speaker, and a Charter that does fails Writ
Drop validation.**

The Speaker is present, not operational. They do not table Motions or write
code.

**Duties**

- Drop the Writ and define the Standing Orders
- Rule on Points of Order; the ruling is committed and permanent
- Grant Assent to carried Motions
- Prorogue the Parliament

**Verbs:** all, including ASSENT, VETO, PROMOTE, DEMOTE, HIRE, FIRE, EXPEL,
SUSPEND, DISSOLVE.

**Why human.** The failure mode of a corrupt authority requires accountability
that only a person can bear. A machine that captures a session cannot be held
responsible for it.`,
  },
  {
    file: 'deputy-speaker.md',
    canon: 'DELEGATE',
    title: 'Deputy Speaker',
    body: `Pre-delegated proxy for the Speaker. May be human or machine.

Acts with the Speaker's authority where the Charter grants it, and only there. A
Deputy Speaker may formally dispute an action of the Speaker before it takes
effect: the challenged action is logged and paused. The Speaker still prevails
after the window — but the challenge is on the permanent record, which is what
makes bad-faith authority visible.

**Verbs:** as granted by the Charter; typically all but DISSOLVE.`,
  },
  {
    file: 'minister.md',
    canon: 'OPERATOR',
    title: 'Minister',
    body: `Elevated trust, broad portfolio. Human or machine.

Ministers do the substantive work of the Parliament: they table Motions, carry
out the business on the Order Paper, and vote in Divisions.

**Duties**

- Table Motions and see them through Division
- Review Motions tabled by others in good faith
- Raise a Point of Order rather than act beyond your verbs

**Verbs:** READ, WRITE, VOTE, ESCALATE, SPAWN. Not ASSENT — the Division
decides, the Speaker enacts.`,
  },
  {
    file: 'backbencher.md',
    canon: 'MEMBER',
    title: 'Backbencher',
    body: `Standard trust, scoped verbs. Human or machine.

Backbenchers contribute to the business and vote in Divisions, but hold a
narrower mandate than Ministers. A Backbencher whose work consistently exceeds
their mandate is a candidate for promotion — recorded, with the Hansard as the
evidence.

**Verbs:** READ, VOTE, ESCALATE. WRITE where the Charter grants it.`,
  },
  {
    file: 'gallery.md',
    canon: 'OBSERVER',
    title: 'Gallery',
    body: `Read-only. No floor rights. Human or machine.

The Gallery sees everything and changes nothing. Useful for auditors, for
humans following a session they do not participate in, and for agents gathering
context for a later sitting.

A Charter may grant a specific Gallery member the right to file a
CONSTITUTIONAL_CRISIS escalation. That is the one exception to "no floor
rights", and it exists so that capture of the House can be reported by someone
outside it.

**Verbs:** READ.`,
  },
];

/** Role definition files for a Parliamentary session repo. */
export const roleTemplates = (): readonly FileWrite[] =>
  ROLE_TEMPLATES.map((role) => ({
    path: `roles/${role.file}`,
    content: `# ${role.title}

**CANON role:** \`${role.canon}\`
**Protocol:** parliamentary

${role.body}
`,
  }));

/* -------------------------------------------------------------------------- */
/* Label taxonomy                                                              */
/* -------------------------------------------------------------------------- */

export interface LabelSpec {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

/**
 * GitHub label taxonomy for a Parliamentary session.
 *
 * Labels are protocol vocabulary — a human scanning the issue list should read
 * Parliamentary terms. The CANON primitive each maps to is stated in the
 * description so the mapping is never guesswork.
 */
export const LABEL_TAXONOMY: readonly LabelSpec[] = Object.freeze([
  { name: 'motion', color: '0E8A16', description: 'MOTION — tabled business' },
  { name: 'division', color: '1D76DB', description: 'DIVISION — a vote is called' },
  { name: 'point-of-order', color: 'B60205', description: 'ESCALATION — awaiting a Speaker ruling' },
  { name: 'ruling', color: '5319E7', description: 'A Speaker ruling on a Point of Order' },
  { name: 'constitutional-crisis', color: '000000', description: 'SUSPENSION — cause CONSTITUTIONAL_CRISIS; external review required' },
  { name: 'fault', color: 'D93F0B', description: 'SESSION_FAULT — an action failed' },
  { name: 'fault-critical', color: '990000', description: 'SESSION_FAULT_CRITICAL — irrecoverable' },
  { name: 'committee', color: 'FBCA04', description: 'SPAWN — referred to a sub-session' },
  { name: 'politik:notification', color: 'C5DEF5', description: 'Speaker notification — not business of the House' },
]);

/* -------------------------------------------------------------------------- */
/* Order Paper                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Order Paper — the business before the House, as a GitHub Projects board.
 *
 * A Milestone is a sitting: the business intended for one continuous stretch of
 * the proceeding. Closing the Milestone is part of prorogation.
 */
export const orderPaperTemplate = (): string => `# ORDER PAPER

The business before this Parliament, in the order it is to be taken.

Mirrored as a GitHub Project board. Columns map to Motion state:

| Column | Meaning | CANON |
|---|---|---|
| Notice Paper | Proposed, not yet tabled | — |
| Tabled | Motion open | MOTION |
| In Division | Review requested | DIVISION |
| Awaiting Assent | Carried, not yet enacted | ASSENT pending |
| Enacted | Merged | ASSENT |
| Withdrawn | Closed without enactment | — |
| Point of Order | Suspended pending a ruling | ESCALATION |

A **Milestone** is a sitting. Its closure is part of prorogation, and the
prorogation workflow surfaces the milestone id for the caller to close.

## Business

1. _Add the first item of business here._
`;

/* -------------------------------------------------------------------------- */
/* Bundle                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The full Parliamentary template set, ready to commit into a session repo
 * alongside the files the initializer already writes.
 */
export const parliamentaryTemplates = (
  options: CharterTemplateOptions = {},
): readonly FileWrite[] => [
  { path: 'CHARTER.md', content: charterTemplate(options) },
  { path: 'ORDER-PAPER.md', content: orderPaperTemplate() },
  ...roleTemplates(),
];
