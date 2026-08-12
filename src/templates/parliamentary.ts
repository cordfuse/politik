/**
 * Scaffold templates.
 *
 * Charter, role definitions, Order Paper and the GitHub label taxonomy a Speaker
 * starts from — editable prose, not engine configuration. Parliamentary (protocol
 * #1) keeps its hand-written constituency prose; every other protocol renders its
 * role docs and Order Paper in its *own* vocabulary via `roleTemplates(protocol)`
 * and `orderPaperTemplate(protocol)`, so `scaffold --protocol monarchy` produces a
 * monarchy session, not a parliamentary one wearing a monarchy Charter.
 *
 * Role files name the CANON role they map to: the engine reads the CANON role;
 * the human reads the title. That separation is the whole point of the protocol
 * layer.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { ROLE_PRECEDENCE, type Role } from '../canon.ts';
import { roleTerm, term, type Protocol } from '../protocol.ts';
import type { FileWrite } from '../scm.ts';

/* -------------------------------------------------------------------------- */
/* Charter                                                                     */
/* -------------------------------------------------------------------------- */

export interface CharterTemplateOptions {
  readonly quorum?: number;
  readonly inherits_from?: string | null;
  readonly speaker?: string;
  /** Protocol override points (ADR-0007). Defaults reproduce Parliament. */
  readonly resolution?: string;
  readonly exit?: string;
  readonly termination?: string;
  readonly escalation?: string;
  /** Protocol name for the frontmatter. Defaults to parliamentary. */
  readonly protocol?: string;
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
  const resolution = options.resolution ?? 'majority';
  const exit = options.exit ?? 'division';
  const termination = options.termination ?? 'objective';
  const escalation = options.escalation ?? 'enabled';
  const protocol = options.protocol ?? 'parliamentary';

  return `---
charter_version: 1.0.0
protocol: ${protocol}
inherits_from: ${inherits === null ? 'null' : inherits}

session:
  quorum: ${quorum}                      # minimum actors for a valid Division
  escalation: ${escalation}            # 'disabled' = no Point of Order (ADR-0006)
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

mechanics:                       # protocol override points (ADR-0007)
  resolution: ${resolution}          # majority | supermajority | unanimity
  exit: ${exit}                # division | elimination | none
  termination: ${termination}         # objective | last-standing | verdict

fault_handling:
  # PATH_A auto-recovery. A rate limit or a brief outage retries without waking
  # the Speaker; anything a human must fix escalates immediately.
  auto_retry_max: 3
  auto_retry_delay_minutes: 5

governance:
  # Constitutional-capture mitigations. A supermajority of OPERATOR actors can
  # suspend the session against AUTHORITY; a designated witness can do it alone,
  # which is what covers the case where the bench itself has been captured.
  consensus_suspension:
    enabled: true
    threshold: 0.75           # fraction of OPERATOR actors who must concur
  witness_council:
    enabled: false            # set true and name roles to seat constitutional witnesses
    roles: []

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
const parliamentaryRoleTemplates = (): readonly FileWrite[] =>
  ROLE_TEMPLATES.map((role) => ({
    path: `roles/${role.file}`,
    content: `# ${role.title}

**CANON role:** \`${role.canon}\`
**Protocol:** parliamentary

${role.body}
`,
  }));

/**
 * Generic CANON-role descriptions — the protocol-independent truth of what each
 * role *is*. A protocol supplies only the vocabulary (the title); the powers of
 * an AUTHORITY or an OPERATOR hold across every protocol, so these are written
 * once and rendered under each protocol's term.
 */
const CANON_ROLE_BODY: Readonly<Record<Role, string>> = {
  AUTHORITY: `The constitutional authority of this session — **always human**. The Charter cannot declare a machine here, and one that does fails Writ Drop validation. Present, not operational: defines the Standing Orders, rules on escalations, grants Assent to carried Motions, and prorogues the session. Does not do the substantive work.

**Verbs:** all, including ASSENT, VETO, PROMOTE, DEMOTE, HIRE, FIRE, EXPEL, SUSPEND, DISSOLVE.

**Why human.** A corrupt authority requires accountability only a person can bear; a machine that captures a session cannot be held responsible for it.`,
  DELEGATE: `A pre-delegated proxy for the authority — human or machine. Acts with the authority the Charter grants, and only there. May formally challenge an AUTHORITY action (\`politik challenge\`): the dissent is recorded and attributable, though the authority still prevails — which is what makes bad faith visible.

**Verbs:** as granted by the Charter; typically all but DISSOLVE.`,
  OPERATOR: `Elevated trust, broad portfolio — human or machine. Does the substantive work of the session: tables business, carries out the Order Paper, and votes in Divisions. Raise a Point of Order rather than act beyond your verbs.

**Verbs:** READ, WRITE, VOTE, ESCALATE, SPAWN. Not ASSENT — the Division decides, the authority enacts.`,
  MEMBER: `The base participant — human or machine. Votes and speaks; does not table business unless the Charter grants it. Raise a Point of Order rather than act beyond your verbs.

**Verbs:** READ, VOTE, ESCALATE.`,
  OBSERVER: `Present but non-voting — human or machine. Reads the record and follows the proceeding; does not vote or table business.

**Verbs:** READ.`,
};

/** A filesystem-safe slug from a protocol's role term (e.g. "The Crown" -> "the-crown"). */
const slug = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';

/**
 * Role definition files in the protocol's own vocabulary. Parliamentary keeps its
 * hand-written constituency prose; every other protocol gets one role doc per
 * CANON role it names, titled with the protocol's term and carrying the generic
 * CANON body — so `scaffold --protocol monarchy` no longer drops Speaker/Minister.
 */
export const roleTemplates = (protocol: Protocol): readonly FileWrite[] => {
  if (protocol.name === 'parliamentary') return parliamentaryRoleTemplates();
  return ROLE_PRECEDENCE
    .filter((role) => protocol.roles[role] !== undefined)
    .map((role) => {
      const title = roleTerm(protocol, role);
      return {
        path: `roles/${slug(title)}.md`,
        content: `# ${title}

**CANON role:** \`${role}\`
**Protocol:** ${protocol.name}

${CANON_ROLE_BODY[role]}
`,
      };
    });
};

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
export const orderPaperTemplate = (protocol: Protocol): string => {
  const session = term(protocol, 'SESSION');
  const motion = term(protocol, 'MOTION');
  const division = term(protocol, 'DIVISION');
  const escalation = term(protocol, 'ESCALATION');
  return `# ORDER PAPER

The business before this ${session}, in the order it is to be taken. Mirrored as
a GitHub Project board — columns map to CANON Motion state, shown in this
protocol's vocabulary.

| Column | CANON | This protocol |
|---|---|---|
| Proposed | — (not yet tabled) | — |
| Tabled | MOTION open | ${motion} |
| In Division | DIVISION requested | ${division} |
| Awaiting Assent | carried, not yet enacted | ASSENT pending |
| Enacted | ASSENT | enacted |
| Withdrawn | closed without enactment | — |
| Point of Order | ESCALATION — suspended pending a ruling | ${escalation} |

A **Milestone** is a sitting; its closure is part of prorogation, and the
prorogation flow surfaces the milestone id for the caller to close.

## Business

1. _Add the first item of business here._
`;
};

/* -------------------------------------------------------------------------- */
/* Bundle                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Onboarding for any agent that lands in the session directory.
 *
 * The workflow this exists for: `cd` into a session, launch an agent, prompt it
 * in natural language. The agent should become fluent immediately rather than
 * inferring that this is Politik and discovering the CLI. AGENTS.md is the
 * cross-agent convention; a one-line CLAUDE.md points Claude Code at it.
 */
export const agentsTemplate = (options: CharterTemplateOptions = {}): string => {
  const protocol = options.protocol ?? 'parliamentary';
  return `# Agent guide — this is a Politik session

You are inside a **Politik** governance session: a git-tracked directory that *is*
the proceeding. \`CHARTER.md\` is the constitution, \`HANSARD.md\` is the immutable
record, \`STATE.json\` is the live state — and the **git history is the Hansard**:
every governance act is one commit.

This session runs the **${protocol}** protocol. Drive it with the \`politik\` CLI
(\`npm i -g @cordfuse/politik\`, or \`npx @cordfuse/politik\`). Never hand-edit
\`HANSARD.md\` or \`STATE.json\` — the record owns them; editing outside the CLI is a
Standing Orders violation and corrupts the record.

## Read the state before acting

\`\`\`sh
politik status      # protocol, state, quorum — the live picture
politik hansard     # the record, in this protocol's own vocabulary
\`\`\`

## The core loop

\`\`\`sh
politik division call  --motion <id> --actor <you> --role AUTHORITY          # put a question
politik division vote   --motion <id> --actor <a> --role MEMBER --vote AYE|NO|ABSTAIN
politik division tally  --motion <id>                                        # decide it
politik assent          --motion <id> --actor <you> --role AUTHORITY         # enact a carried motion
\`\`\`

Seat a working agent instead of a human vote:

\`\`\`sh
politik run --agent claude-code --actor <a> --role OPERATOR --task "..."
\`\`\`

More verbs: \`actor hire|promote|demote|exit|dispute|reinstate\`, \`escalate\` /
\`rule\` (Points of Order), \`crisis\`, \`conflict\`, \`challenge\`, \`pair\` / \`match\`
(tournaments), \`prorogue\` (seal the session). \`politik --help\` lists everything,
and the CLI's own errors name the flags each command needs.

## The one rule that matters

\`AUTHORITY\` acts — \`init\`, \`assent\`, \`rule\`, \`veto\`, breaking a deadlock —
exercise the **human Speaker's** constitutional authority. **Confirm with the human
before running them.** Draft and propose freely; ratifying is theirs.
`;
};

const claudePointerTemplate = (): string =>
  `# This is a Politik session\n\nSee [AGENTS.md](AGENTS.md) — how to drive this governed session with the \`politik\` CLI.\n`;

/**
 * The full Parliamentary template set, ready to commit into a session repo
 * alongside the files the initializer already writes.
 */
export const scaffoldTemplates = (
  protocol: Protocol,
  options: CharterTemplateOptions = {},
): readonly FileWrite[] => [
  { path: 'CHARTER.md', content: charterTemplate(options) },
  { path: 'ORDER-PAPER.md', content: orderPaperTemplate(protocol) },
  { path: 'AGENTS.md', content: agentsTemplate(options) },
  { path: 'CLAUDE.md', content: claudePointerTemplate() },
  ...roleTemplates(protocol),
];
