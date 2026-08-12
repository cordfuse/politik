/**
 * Session repo initializer — the Writ Drop.
 *
 * The Speaker drops the Writ; this module produces the initial file set that
 * makes a git repository a Politik session. It is pure: it returns files to be
 * written, and performs no I/O itself. The caller commits them through an
 * ScmProvider, so the same initializer serves GitHub, a local scratch repo, or
 * a test.
 *
 * Layout follows POLITIK-ARCHITECTURE.md § SESSION REPO STRUCTURE. Validation
 * is ADR-0002's Writ Drop rules, delegated to the charter module: a Charter
 * that fails opens nothing, and yields an INVALID state file recording why.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import {
  validateCharter,
  parseCharter,
  charterFingerprint,
  type Charter,
  type CharterIssue,
  type ProtocolContext,
} from './charter.ts';
import { RECORD_TYPES, appendEntry } from './hansard.ts';
import { LEDGER_HEADER } from './ledger.ts';
import type { FileWrite } from './scm.ts';
import { createState, serializeState, type SessionStateFile } from './state.ts';

/* -------------------------------------------------------------------------- */
/* Inputs and results                                                          */
/* -------------------------------------------------------------------------- */

export interface WritDropInput {
  /** Raw CHARTER.md source, as authored by the Speaker. */
  readonly charter_source: string;
  /** Stable session identifier. Supplied by the caller — this module is pure. */
  readonly session_guid: string;
  /** ISO-8601 UTC timestamp for the Writ. Supplied by the caller. */
  readonly now: string;
  /** Human handle of the AUTHORITY dropping the Writ. */
  readonly speaker: string;
  /** Resolved protocol, when available. Enables ADR-0002 rules 2 and 5. */
  readonly protocol?: ProtocolContext;
}

export type WritDropResult =
  | {
      readonly ok: true;
      readonly charter: Charter;
      readonly state: SessionStateFile;
      readonly files: readonly FileWrite[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly CharterIssue[];
      /** INVALID state file — committed so the failure is on the record. */
      readonly state: SessionStateFile;
      readonly files: readonly FileWrite[];
    };

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

const writ = (input: WritDropInput, charter: Charter | null, guid: string): string => {
  const lines = [
    '# WRIT',
    '',
    'Session identity and Writ Drop record.',
    '',
    `- **Session GUID:** ${guid}`,
    `- **Protocol:** ${charter?.protocol ?? 'unresolved'}`,
    `- **Dropped by:** ${input.speaker} (AUTHORITY)`,
    `- **Dropped at:** ${input.now}`,
    `- **Inherits from:** ${charter?.inherits_from ?? 'none (root node)'}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
};

const HANSARD_PREAMBLE = [
  '# HANSARD',
  '',
  'Append-only attributed record of this proceeding. The RECORD agent writes;',
  'no actor edits an entry once committed.',
  '',
  '---',
  '',
].join('\n');

const hansard = (input: WritDropInput, guid: string): string =>
  appendEntry(HANSARD_PREAMBLE, {
    type: RECORD_TYPES.WRIT_DROP,
    at: input.now,
    actor: input.speaker,
    role: 'AUTHORITY',
    fields: { 'Charter SHA256': charterFingerprint(input.charter_source) },
    body: `Writ dropped. Session ${guid} convened under the attached Charter.`,
  });

const invalidHansard = (
  input: WritDropInput,
  guid: string,
  issues: readonly CharterIssue[],
): string =>
  appendEntry(HANSARD_PREAMBLE, {
    type: RECORD_TYPES.SESSION_INVALID,
    at: input.now,
    actor: input.speaker,
    role: 'AUTHORITY',
    body: [
      `Writ Drop failed validation. Session ${guid} never opened.`,
      '',
      ...issues.map(
        (i) =>
          `- \`${i.field}\` — ${i.message}${i.rule === undefined ? '' : ` (ADR-0002 rule ${i.rule})`}`,
      ),
    ].join('\n'),
  });

const ledger = (charter: Charter): string =>
  [
    '# LEDGER',
    '',
    'Secretarial cost and token ledger for this proceeding.',
    '',
    `- **Visibility:** ${charter.ledger.visibility}`,
    `- **Cost ceiling:** ${charter.session.endurance.max_cost_usd ?? 'none declared'}`,
    `- **Motion ceiling:** ${charter.session.endurance.max_motions ?? 'none declared'}`,
    '',
    LEDGER_HEADER,
    '',
  ].join('\n') + '\n';

/** Placeholder so the directory exists in git, which tracks files not dirs. */
const keep = (purpose: string): string => `${purpose}\n`;

/**
 * Speaker notification workflow, per RUNTIME.md § Point of Order Workflow.
 *
 * Written into the session repo — this is the Clerk automation the escalation
 * flow depends on: a push under `escalations/` emails the Speaker and tells
 * them where to commit their ruling.
 *
 * The path filter deliberately excludes rulings. A ruling is the Speaker's
 * answer; notifying them of their own reply would loop.
 *
 * Requires three repository secrets. Absent them the workflow fails loudly
 * rather than silently dropping the notification — an escalation nobody hears
 * is the failure mode this whole flow exists to prevent.
 */
const pointOfOrderWorkflow = (): string =>
  `name: Point of Order — Speaker Notification

# Requires repository secrets: MAIL_USERNAME, MAIL_PASSWORD, SPEAKER_EMAIL
# See RUNTIME.md § POINT OF ORDER — ESCALATION FLOW

on:
  push:
    paths:
      - 'escalations/[0-9]*.md'

jobs:
  notify-speaker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Read escalation
        id: esc
        run: |
          FILE=$(ls escalations/[0-9]*.md | grep -v ruling | tail -1)
          echo "path=\${FILE}" >> "$GITHUB_OUTPUT"
          {
            echo "content<<POLITIK_EOF"
            cat "\${FILE}"
            echo "POLITIK_EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Email Speaker
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: \${{ secrets.MAIL_USERNAME }}
          password: \${{ secrets.MAIL_PASSWORD }}
          to: \${{ secrets.SPEAKER_EMAIL }}
          from: Politik Clerk
          subject: "Point of Order — \${{ github.repository }}"
          body: |
            A Point of Order has been raised.

            \${{ steps.esc.outputs.content }}

            Escalation: \${{ steps.esc.outputs.path }}
            Session:    \${{ github.server_url }}/\${{ github.repository }}

            Commit your ruling to: escalations/ruling-[n].md
            Session is suspended pending your response.
`;


/**
 * Heartbeat workflow — scheduled staleness detection.
 *
 * RUNTIME.md § Session Heartbeat: an hourly job checks the last Hansard commit
 * and suspends the proceeding if nothing has happened within
 * `heartbeat_timeout_hours`.
 *
 * Runs `politik` via npx rather than assuming an install: a GitHub runner is a
 * fresh machine, and a session repo carries no toolchain of its own.
 *
 * Writes back to the repo when it suspends, which is why it needs
 * `contents: write` — a heartbeat that could detect staleness but not record it
 * would be a monitor, not a mechanism.
 */
const heartbeatWorkflow = (): string =>
  `name: Heartbeat — staleness detection

# NOTE — these jobs run \`npx --yes @cordfuse/politik\`, which requires the
# package to be published to npm. Until it is, they will fail on the runner.
# The governance they automate all works from the CLI in the meantime:
#   staleness -> politik heartbeat --suspend
#   rulings   -> politik rule

# A proceeding that goes quiet is not the same as one that was paused. This job
# marks it STALE, which is resumable and loses nothing (\`politik resume\`).

on:
  schedule:
    - cron: '0 * * * *'      # hourly, per RUNTIME.md § Session Heartbeat
  workflow_dispatch:

permissions:
  contents: write

jobs:
  heartbeat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # the heartbeat is the last Hansard commit

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Check the heartbeat
        id: beat
        run: npx --yes @cordfuse/politik heartbeat --dir . --suspend || true

      - name: Commit a suspension, if one was recorded
        run: |
          if [ -n "$(git status --porcelain HANSARD.md STATE.json)" ]; then
            git config user.name  'Politik Clerk'
            git config user.email 'clerk@politik.local'
            git add HANSARD.md STATE.json
            git commit -m 'SESSION_STALE — heartbeat window elapsed'
            git push
          else
            echo 'still beating; nothing to record'
          fi
`;

/**
 * Ruling workflow — resume on a committed ruling.
 *
 * RUNTIME.md § Point of Order: "GitHub Actions detects ruling commit → session
 * resumes". A Speaker who commits \`escalations/ruling-NNN.md\` directly, rather
 * than through the CLI, should not also have to remember to resume the sitting.
 *
 * The path filter matches only rulings. Matching the whole \`escalations/\`
 * directory would fire on the escalation that caused the suspension and resume
 * a session nobody had ruled on.
 */
const rulingWorkflow = (): string =>
  `name: Ruling — resume the sitting

# NOTE — these jobs run \`npx --yes @cordfuse/politik\`, which requires the
# package to be published to npm. Until it is, they will fail on the runner.
# The governance they automate all works from the CLI in the meantime:
#   staleness -> politik heartbeat --suspend
#   rulings   -> politik rule

on:
  push:
    paths:
      - 'escalations/ruling-*.md'

permissions:
  contents: write

jobs:
  resume:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Resume, if the session is suspended for a Point of Order
        run: |
          STATE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('STATE.json','utf8')).state)")
          CAUSE=$(node -e "const s=JSON.parse(require('fs').readFileSync('STATE.json','utf8'));console.log(s.suspension?.cause ?? '')")

          # Only a Point of Order resumes this way. A constitutional crisis
          # requires external review, and a Speaker order is the Speaker's to
          # lift — resuming around either would route past the governance that
          # stopped the session.
          if [ "$STATE" = "SUSPENDED" ] && [ "$CAUSE" = "POINT_OF_ORDER" ]; then
            npx --yes @cordfuse/politik rule \\
              --dir . --actor "$GITHUB_ACTOR" --role AUTHORITY \\
              --outcome NOTED \\
              --body "Ruling committed to the repository. Recorded by the Clerk workflow."

            git config user.name  'Politik Clerk'
            git config user.email 'clerk@politik.local'
            git add HANSARD.md STATE.json escalations/
            git commit -m 'RULING — sitting resumes' || true
            git push
          else
            echo "state=$STATE cause=$CAUSE — nothing to resume"
          fi
`;

/* -------------------------------------------------------------------------- */
/* Writ Drop                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Execute the Writ Drop.
 *
 * On pass: the full session file set with `STATE.json.state = CONVENED`
 * (ADR-0002 rule 8). On failure: an INVALID state file plus a Hansard entry
 * naming every violated rule, so the refusal is itself on the record.
 */
export const dropWrit = (input: WritDropInput): WritDropResult => {
  const parsed = parseCharter(input.charter_source);

  const invalid = (issues: readonly CharterIssue[], charter: Charter | null): WritDropResult => {
    const state = createState({
      session_guid: input.session_guid,
      protocol: charter?.protocol ?? '',
      state: 'INVALID',
      quorum: { required: charter?.session.quorum ?? 0, present: 0 },
      updated_at: input.now,
    });
    return {
      ok: false,
      issues,
      state,
      files: [
        { path: 'CHARTER.md', content: input.charter_source },
        { path: 'STATE.json', content: serializeState(state) },
        { path: 'HANSARD.md', content: invalidHansard(input, input.session_guid, issues) },
        { path: 'WRIT.md', content: writ(input, charter, input.session_guid) },
      ],
    };
  };

  if (!parsed.ok) return invalid(parsed.issues, null);

  const charter = parsed.charter;
  const validation = validateCharter(charter, input.protocol);
  if (!validation.valid) return invalid(validation.issues, charter);

  const state = createState({
    session_guid: input.session_guid,
    protocol: charter.protocol,
    state: 'CONVENED',
    quorum: { required: charter.session.quorum, present: 0 },
    updated_at: input.now,
  });

  const files: FileWrite[] = [
    { path: 'CHARTER.md', content: input.charter_source },
    { path: 'STATE.json', content: serializeState(state) },
    { path: 'HANSARD.md', content: hansard(input, input.session_guid) },
    { path: 'WRIT.md', content: writ(input, charter, input.session_guid) },
    { path: 'roles/.gitkeep', content: keep('Role capability definitions.') },
    { path: 'actors/.gitkeep', content: keep('Actor profiles — who plays each role.') },
    { path: 'motions/.gitkeep', content: keep('Tabled business.') },
    { path: 'escalations/.gitkeep', content: keep('Points of Order and rulings.') },
    { path: '.github/workflows/point-of-order.yml', content: pointOfOrderWorkflow() },
    { path: '.github/workflows/heartbeat.yml', content: heartbeatWorkflow() },
    { path: '.github/workflows/ruling.yml', content: rulingWorkflow() },
  ];

  if (charter.ledger.enabled) {
    files.push({ path: charter.ledger.path, content: ledger(charter) });
  }

  return { ok: true, charter, state, files };
};
