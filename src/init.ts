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
  ];

  if (charter.ledger.enabled) {
    files.push({ path: charter.ledger.path, content: ledger(charter) });
  }

  return { ok: true, charter, state, files };
};
