/**
 * politik — command line interface.
 *
 * Thin shell over the library: every command parses arguments, calls a pure
 * function, and renders the result. No governance logic lives here. If a
 * decision is being made in this file, it is in the wrong place.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { parseCharter, validateCharter } from './charter.ts';
import { dropWrit } from './init.ts';
import { parseState, serializeState } from './state.ts';
import { parliamentaryTemplates } from './templates/parliamentary.ts';
import { generateProtocol, lintSource } from './protocol-sdk.ts';
import { diagnose } from './doctor.ts';
import { runTurn } from './runner.ts';
import { GitTransport } from './transport.ts';
import { parseEnvelope, isEligible, type Envelope } from './envelope.ts';
import { commitRecord } from './git.ts';
import {
  linkEntry, projectAssent, projectDivision, projectEscalation,
  projectionEntry, resolveProvider,
} from './projection.ts';
import { checkCostCeiling, totals } from './ledger.ts';
import { checkHeartbeat, lastSnapshot, markStale, resume, snapshot } from './heartbeat.ts';
import { commitRuling, fileEscalation, type RulingOutcome } from './escalation.ts';
import {
  demote, exitActor, hire, promote, seats, spawnChild, veto, vetoOutstanding,
  type ExitType,
} from './actors.ts';
import {
  checkCapture, externalReview, fileCrisis, suspendForCrisis,
  type CrisisRuling,
} from './crisis.ts';
import {
  callDivision, castVote, grantAssent, recordOutcome, tallyDivision,
  type Vote,
} from './division.ts';
import { PROTOCOL_MODES, type ProtocolMode } from './protocol.ts';
import { checkTermination, prorogue, type Trigger } from './prorogation.ts';
import { appendEntry, parseEntries } from './hansard.ts';
import type { FileWrite } from './scm.ts';

/**
 * Read from package.json rather than hardcoded. A duplicated version string
 * goes stale the first time someone bumps one copy and not the other — which is
 * exactly what happened at 0.3.0.
 */
const VERSION: string = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg: unknown = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  return typeof pkg === 'object' && pkg !== null && 'version' in pkg
    ? String((pkg as { version: unknown }).version)
    : 'unknown';
})();

const USAGE = `politik — governed multi-agent sessions on git

Usage
  politik version
  politik scaffold --out <dir> [--protocol parliamentary] [--quorum <n>]
  politik doctor
  politik protocol lint <manifest.yml>
  politik protocol new <name> [--mode <mode>] [--out <dir>]
  politik validate <charter.md> [--protocol <name>]
  politik init --charter <path> --speaker <handle> [--out <dir>] [--guid <id>]
  politik run --agent <id> --actor <h> --role <ROLE> (--task <text> | --claim)
  politik division call --motion <id> --actor <h> --role <ROLE> [--reviewers a,b]
  politik division vote --motion <id> --actor <h> --role <ROLE> --vote AYE|NO|ABSTAIN
  politik division tally --motion <id>
  politik assent --motion <id> --actor <h> --role AUTHORITY
  politik crisis file --actor <h> --role <ROLE> --against <speaker> --grounds <text>
  politik crisis check
  politik crisis review --reviewer <h> --accused <speaker> --ruling UPHELD|DISMISSED --reasons <text>
  politik escalate --actor <h> --role <ROLE> --title <t> --body <text> [--seq <n>]
  politik rule --seq <n> --actor <h> --outcome UPHELD|REVERSED|NOTED --body <text>
  politik actor hire|promote|demote|exit|veto|spawn ... (see below)
  politik actor list
  politik heartbeat [--dir <dir>] [--suspend]
  politik snapshot [--dir <dir>] [--completed a,b] [--in-flight a] [--pending a]
  politik resume --actor <handle> [--dir <dir>]
  politik broadcast --target <ROLE> --slots <n> --task <text> [--dir <dir>]
  politik motion link --motion <id> --pr <n> [--url <u>]
  politik ledger [--dir <dir>]
  politik status [--dir <dir>]
  politik prorogue --dir <dir> --actor <handle> --role <ROLE> --trigger <TRIGGER>

Commands
  version     Print the version.
  scaffold    Write a protocol's Charter, roles and Order Paper for editing.
  doctor      Probe this host: can it run a session, and with which agents?
  protocol    Lint a protocol manifest, or generate a new one.
  validate    Parse a CHARTER.md and run the Writ Drop rules. Writes nothing.
  init        Drop the Writ — create a session repo file set on disk.
  run         Seat an agent, give it the business, record what it did.
  division    Call a Division, cast a vote, or tally the result.
  assent      Enact a carried Motion. The Division decides; Assent enacts.
  crisis      File, check, or externally review a constitutional crisis.
  escalate    Raise a Point of Order. Suspends the sitting.
  rule        Rule on a Point of Order as AUTHORITY. Resumes the sitting.
  actor       Seat, move or remove actors; exercise a veto; refer to committee.
  heartbeat   Has the proceeding gone quiet? --suspend marks it STALE.
  snapshot    Commit a STATE_SNAPSHOT so a new agent can continue the work.
  resume      Resume a STALE proceeding.
  broadcast   Put business on the bus for peers to claim.
  motion      Bind a Motion to a pull request so Assent can enact it.
  ledger      Total the session's measured cost.
  status      Read STATE.json and summarise the proceeding.
  prorogue    Close a proceeding permanently and seal the Hansard.
`;

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line: string) => process.stderr.write(`${line}\n`);

/** Exit codes: 0 success, 1 refusal (invalid input), 2 usage error. */
const EXIT = { OK: 0, REFUSED: 1, USAGE: 2 } as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const writeFiles = async (dir: string, files: readonly FileWrite[]): Promise<void> => {
  for (const file of files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
};

const readIfPresent = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Scaffold a protocol's editable documents.
 *
 * Deliberately separate from `init`: scaffolding produces prose for a Speaker to
 * edit, while `init` drops the Writ and opens the session. Conflating them would
 * mean a session convened on an unread template.
 */
const cmdScaffold = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: 'string' },
      protocol: { type: 'string' },
      quorum: { type: 'string' },
    },
  });

  const protocol = values.protocol ?? 'parliamentary';
  if (protocol !== 'parliamentary') {
    err(`scaffold: unknown protocol "${protocol}" — only parliamentary ships today`);
    return EXIT.USAGE;
  }

  const quorum = values.quorum === undefined ? undefined : Number(values.quorum);
  if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1)) {
    err('scaffold: --quorum must be an integer >= 1');
    return EXIT.USAGE;
  }

  const dir = values.out ?? '.';
  const files = parliamentaryTemplates(quorum === undefined ? {} : { quorum });
  await writeFiles(dir, files);

  out(`SCAFFOLDED ${protocol}`);
  for (const file of files) out(`  ${file.path}`);
  out('');
  out(`Edit the Standing Orders, then: politik init --charter ${join(dir, 'CHARTER.md')} --speaker <handle>`);
  return EXIT.OK;
};

/** Probe the host and report whether a session can run here. */
const cmdDoctor = async (): Promise<number> => {
  const diagnosis = await diagnose();
  out(`platform  ${diagnosis.platform}`);
  out('');
  for (const check of diagnosis.checks) {
    const badge =
      check.status === 'ok' ? '[ OK ]' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
    out(`${badge} ${check.name.padEnd(10)} ${check.detail}`);
  }
  out('');
  out(diagnosis.ready ? 'READY — this host can run a Politik session' : 'NOT READY');
  return diagnosis.ready ? EXIT.OK : EXIT.REFUSED;
};

/** `politik protocol lint <file>` / `politik protocol new <name>`. */
const cmdProtocol = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;

  if (verb === 'lint') {
    const path = rest[0];
    if (path === undefined) {
      err('protocol lint: a manifest path is required');
      return EXIT.USAGE;
    }
    const source = await readIfPresent(path);
    if (source === null) {
      err(`protocol lint: cannot read ${path}`);
      return EXIT.USAGE;
    }

    const result = lintSource(source);
    for (const finding of result.findings) {
      const line = `  ${finding.severity === 'error' ? '[ERROR]' : '[WARN] '} ${finding.field}: ${finding.message}`;
      if (finding.severity === 'error') err(line);
      else out(line);
    }

    if (!result.ok) {
      err('PROTOCOL INVALID');
      return EXIT.REFUSED;
    }
    out(`PROTOCOL VALID${result.findings.length > 0 ? ` (${result.findings.length} warning(s))` : ''}`);
    return EXIT.OK;
  }

  if (verb === 'new') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { mode: { type: 'string' }, out: { type: 'string' } },
      allowPositionals: true,
    });
    const name = positionals[0];
    if (name === undefined) {
      err('protocol new: a protocol name is required');
      return EXIT.USAGE;
    }
    const mode = (values.mode ?? 'constitutional') as ProtocolMode;
    if (!(PROTOCOL_MODES as readonly string[]).includes(mode)) {
      err(`protocol new: --mode must be one of ${PROTOCOL_MODES.join(' | ')}`);
      return EXIT.USAGE;
    }

    const manifest = generateProtocol({ name, mode });
    if (values.out === undefined) {
      out(manifest);
    } else {
      await writeFiles(values.out, [{ path: `${name}.yml`, content: manifest }]);
      out(`GENERATED ${join(values.out, `${name}.yml`)}`);
      out(`  politik protocol lint ${join(values.out, `${name}.yml`)}`);
    }
    return EXIT.OK;
  }

  err(`protocol: unknown verb "${verb ?? ''}" — expected lint | new`);
  return EXIT.USAGE;
};

const cmdValidate = async (argv: readonly string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: { protocol: { type: 'string' } },
    allowPositionals: true,
  });

  const path = positionals[0];
  if (path === undefined) {
    err('validate: a CHARTER.md path is required');
    return EXIT.USAGE;
  }

  const source = await readIfPresent(path);
  if (source === null) {
    err(`validate: cannot read ${path}`);
    return EXIT.USAGE;
  }

  const parsed = parseCharter(source);
  if (!parsed.ok) {
    err('CHARTER INVALID — the session would never open');
    for (const issue of parsed.issues) err(`  ${issue.field}: ${issue.message}`);
    return EXIT.REFUSED;
  }

  const result = validateCharter(
    parsed.charter,
    values.protocol === undefined ? undefined : { name: values.protocol },
  );

  if (!result.valid) {
    err('CHARTER INVALID — the session would never open');
    for (const issue of result.issues) {
      const rule = issue.rule === undefined ? '' : ` (rule ${issue.rule})`;
      err(`  ${issue.field}: ${issue.message}${rule}`);
    }
    return EXIT.REFUSED;
  }

  out('CHARTER VALID');
  out(`  protocol       ${parsed.charter.protocol}`);
  out(`  quorum         ${parsed.charter.session.quorum}`);
  out(`  merge strategy ${parsed.charter.session.merge_strategy}`);
  out(`  assent         ${parsed.charter.session.assent}`);
  out(`  constituencies ${parsed.charter.constituencies.length}`);
  return EXIT.OK;
};

const cmdInit = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      charter: { type: 'string' },
      speaker: { type: 'string' },
      out: { type: 'string' },
      guid: { type: 'string' },
      protocol: { type: 'string' },
    },
  });

  if (values.charter === undefined || values.speaker === undefined) {
    err('init: --charter and --speaker are required');
    return EXIT.USAGE;
  }

  const source = await readIfPresent(values.charter);
  if (source === null) {
    err(`init: cannot read ${values.charter}`);
    return EXIT.USAGE;
  }

  const result = dropWrit({
    charter_source: source,
    session_guid: values.guid ?? crypto.randomUUID(),
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    speaker: values.speaker,
    protocol: values.protocol === undefined ? undefined : { name: values.protocol },
  });

  const dir = values.out ?? '.';
  await writeFiles(dir, result.files);

  if (!result.ok) {
    err('WRIT DROP REFUSED — session did not open');
    for (const issue of result.issues) {
      const rule = issue.rule === undefined ? '' : ` (rule ${issue.rule})`;
      err(`  ${issue.field}: ${issue.message}${rule}`);
    }
    err('');
    err(`The refusal is on the record in ${join(dir, 'HANSARD.md')}`);
    return EXIT.REFUSED;
  }

  out('WRIT DROPPED');
  out(`  session  ${result.state.session_guid}`);
  out(`  protocol ${result.charter.protocol}`);
  out(`  state    ${result.state.state}`);
  out(`  files    ${result.files.length} written to ${dir}`);
  return EXIT.OK;
};


/* -------------------------------------------------------------------------- */
/* Division helpers                                                            */
/* -------------------------------------------------------------------------- */

const loadSession = async (dir: string) => {
  const stateRaw = await readIfPresent(join(dir, 'STATE.json'));
  const state = stateRaw === null ? null : parseState(stateRaw);
  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const charterRaw = await readIfPresent(join(dir, 'CHARTER.md'));
  const charter = charterRaw === null ? null : parseCharter(charterRaw);
  return { state, hansard, charter: charter?.ok === true ? charter.charter : null };
};

const writeHansard = (dir: string, hansard: string) =>
  writeFile(join(dir, 'HANSARD.md'), hansard, 'utf8');

/**
 * Persist a governance act to the record.
 *
 * Writing the file is not enough: the Standing Orders this framework ships say
 * uncommitted work does not exist, and that binds the engine as much as an
 * actor. Reports what happened rather than failing silently — a session run
 * outside git is legitimate, but the operator should know the record is not
 * durable.
 */
const recordAndCommit = async (dir: string, message: string): Promise<void> => {
  const result = await commitRecord(dir, message, [
    'HANSARD.md',
    'STATE.json',
    'LEDGER.md',
    '.politik/LEDGER.md',
  ]);
  if (result.committed) out(`  recorded ${result.sha?.slice(0, 8) ?? ''}`);
  else if (result.reason === 'not a git repository') {
    out('  [WARN] not a git repository — the record is not durable');
  }
};

const nowStamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Provider flags shared by every command that can project. */
const PROVIDER_OPTS = {
  repo: { type: 'string' },
  token: { type: 'string' },
} as const;

/**
 * Report a projection and put it on the record.
 *
 * Both outcomes are recorded. A reader must be able to see that a Motion
 * carried and its merge did not land — the gap between decision and effect is
 * exactly what a governance record exists to expose.
 */
const reportProjection = async (
  dir: string,
  act: string,
  result: { projected: boolean; detail: string; ref: string | null },
  hansard: string,
): Promise<void> => {
  out(`  ${result.projected ? 'projected' : 'not projected'} — ${result.detail}`);
  await writeHansard(dir, appendEntry(hansard, projectionEntry(act, result, nowStamp())));
};

/** `politik division call|vote|tally`. */
const cmdDivision = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, motion: { type: 'string' }, actor: { type: 'string' },
      role: { type: 'string' }, vote: { type: 'string' }, reviewers: { type: 'string' },
      ...PROVIDER_OPTS,
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`division: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }
  if (values.motion === undefined) {
    err('division: --motion is required');
    return EXIT.USAGE;
  }

  try {
    if (verb === 'call') {
      if (values.actor === undefined) { err('division call: --actor is required'); return EXIT.USAGE; }
      const result = callDivision({
        motion: values.motion, at: nowStamp(), actor: values.actor,
        role: (values.role ?? 'OPERATOR') as never,
        reviewers: (values.reviewers ?? '').split(',').filter((r) => r.length > 0),
        state,
      }, hansard);
      await writeHansard(dir, result.hansard);
      out(`DIVISION CALLED on ${values.motion}`);

      const { provider } = resolveProvider({ repo: values.repo, token: values.token });
      const reviewers = (values.reviewers ?? '').split(',').filter((r) => r.length > 0);
      const projected = await projectDivision(provider, result.hansard, values.motion, reviewers);
      await reportProjection(dir, `DIVISION_CALLED ${values.motion}`, projected, result.hansard);

      await recordAndCommit(dir, `DIVISION_CALLED — ${values.motion}`);
      return EXIT.OK;
    }

    if (verb === 'vote') {
      if (values.actor === undefined || values.vote === undefined) {
        err('division vote: --actor and --vote are required'); return EXIT.USAGE;
      }
      const result = castVote({
        motion: values.motion, at: nowStamp(), actor: values.actor,
        role: (values.role ?? 'OPERATOR') as never,
        vote: values.vote.toUpperCase() as Vote, state,
      }, hansard);
      await writeHansard(dir, result.hansard);
      out(`VOTE RECORDED — ${values.actor}: ${values.vote.toUpperCase()}`);
      await recordAndCommit(dir, `VOTE_CAST — ${values.actor} on ${values.motion}`);
      return EXIT.OK;
    }

    if (verb === 'tally') {
      const outcome = tallyDivision(hansard, values.motion, charter.session.quorum);
      const result = recordOutcome(outcome, nowStamp(), values.actor ?? 'RECORD',
        (values.role ?? 'OPERATOR') as never, hansard);
      await writeHansard(dir, result.hansard);
      out(outcome.carried ? 'MOTION CARRIED' : 'MOTION NOT CARRIED');
      out(`  ayes ${outcome.ayes}  noes ${outcome.noes}  abstentions ${outcome.abstentions}`);
      out(`  quorum ${outcome.quorum_met ? 'met' : 'NOT MET'}`);
      out(`  ${outcome.reason}`);
      await recordAndCommit(dir, `${outcome.carried ? 'MOTION_CARRIED' : 'MOTION_REJECTED'} — ${values.motion}`);
      return outcome.carried ? EXIT.OK : EXIT.REFUSED;
    }

    err(`division: unknown verb "${verb ?? ''}" — expected call | vote | tally`);
    return EXIT.USAGE;
  } catch (error) {
    err(`division refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/** `politik assent` — enact a carried Motion. */
const cmdAssent = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, motion: { type: 'string' },
      actor: { type: 'string' }, role: { type: 'string' },
      ...PROVIDER_OPTS,
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) { err(`assent: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (values.motion === undefined || values.actor === undefined) {
    err('assent: --motion and --actor are required'); return EXIT.USAGE;
  }

  try {
    const outcome = tallyDivision(hansard, values.motion, charter.session.quorum);
    const result = grantAssent({
      motion: values.motion, at: nowStamp(), actor: values.actor,
      role: (values.role ?? 'AUTHORITY') as never,
      assent_role: charter.session.assent, outcome, state,
      veto_outstanding: vetoOutstanding(hansard, values.motion),
    }, hansard);
    await writeHansard(dir, result.hansard);
    await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
    out(`ASSENT GRANTED — ${values.motion} is enacted`);

    // ADR-0004 defines ASSENT as merging the Motion. This is where the decision
    // reaches the world; until it was wired, assent recorded a decision that
    // changed nothing.
    const { provider } = resolveProvider({ repo: values.repo, token: values.token });
    const merged = await projectAssent(
      provider, result.hansard, values.motion, charter.session.merge_strategy,
    );
    await reportProjection(dir, `ASSENT ${values.motion}`, merged, result.hansard);

    await recordAndCommit(dir, `ASSENT_GRANTED — ${values.motion} enacted`);
    return EXIT.OK;
  } catch (error) {
    err(`assent refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};


/** `politik crisis file|check|review`. */
const cmdCrisis = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, actor: { type: 'string' }, role: { type: 'string' },
      against: { type: 'string' }, grounds: { type: 'string' },
      reviewer: { type: 'string' }, accused: { type: 'string' },
      ruling: { type: 'string' }, reasons: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`crisis: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }

  const operators = charter.constituencies
    .filter((c) => c.role === 'OPERATOR')
    .reduce((n, c) => n + c.slots, 0);

  try {
    if (verb === 'file') {
      if (values.actor === undefined || values.against === undefined || values.grounds === undefined) {
        err('crisis file: --actor, --against and --grounds are required');
        return EXIT.USAGE;
      }
      const result = fileCrisis({
        at: nowStamp(), actor: values.actor, role: (values.role ?? 'OPERATOR') as never,
        grounds: values.grounds, against: values.against, state,
        witness: charter.governance.witness_council.enabled
          ? { ...charter.governance.witness_council, can_file: 'CONSTITUTIONAL_CRISIS' as const }
          : null,
      }, hansard);
      await writeHansard(dir, result.hansard);
      out(`CRISIS FILED by ${values.actor} against ${values.against}`);
      await recordAndCommit(dir, `CONSTITUTIONAL_CRISIS_FILED — ${values.actor}`);

      // The Charter's own declaration, not a hardcoded default. Until these
      // were parsed, a Speaker could declare a Witness Council and get nothing.
      const check = checkCapture(
        result.hansard,
        operators,
        charter.governance.witness_council.enabled
          ? { ...charter.governance.witness_council, can_file: 'CONSTITUTIONAL_CRISIS' as const }
          : null,
        { ...charter.governance.consensus_suspension, resume_requires: 'external_review' as const },
      );
      out(`  ${check.reason}`);
      if (check.triggered) {
        const suspended = suspendForCrisis(check, nowStamp(), state, result.hansard);
        await writeHansard(dir, suspended.hansard);
        await writeFile(join(dir, 'STATE.json'), serializeState(suspended.state), 'utf8');
        out('');
        out('  CONSTITUTIONAL CRISIS — the session is SUSPENDED');
        out('  Resumption requires review by a human outside this session.');
        await recordAndCommit(dir, 'CONSTITUTIONAL_CRISIS — session suspended');
      }
      return EXIT.OK;
    }

    if (verb === 'check') {
      const check = checkCapture(
        hansard,
        operators,
        charter.governance.witness_council.enabled
          ? { ...charter.governance.witness_council, can_file: 'CONSTITUTIONAL_CRISIS' as const }
          : null,
        { ...charter.governance.consensus_suspension, resume_requires: 'external_review' as const },
      );
      out(check.triggered ? 'CAPTURE DECLARED' : 'no capture declared');
      out(`  filings   ${check.filed} of ${check.operators} OPERATOR actors`);
      out(`  threshold ${check.required}`);
      out(`  ${check.reason}`);
      return check.triggered ? EXIT.REFUSED : EXIT.OK;
    }

    if (verb === 'review') {
      if (values.reviewer === undefined || values.accused === undefined || values.reasons === undefined) {
        err('crisis review: --reviewer, --accused and --reasons are required');
        return EXIT.USAGE;
      }
      const result = externalReview({
        at: nowStamp(), reviewer: values.reviewer, accused: values.accused,
        ruling: ((values.ruling ?? 'UPHELD').toUpperCase()) as CrisisRuling,
        reasons: values.reasons, state,
      }, hansard);
      await writeHansard(dir, result.hansard);
      await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
      out(`EXTERNAL RULING — ${values.ruling?.toUpperCase() ?? 'UPHELD'}`);
      out(`  session is now ${result.state.state}`);
      await recordAndCommit(dir, `CONSTITUTIONAL_CRISIS_RULING — ${values.ruling?.toUpperCase() ?? 'UPHELD'}`);
      return EXIT.OK;
    }

    err(`crisis: unknown verb "${verb ?? ''}" — expected file | check | review`);
    return EXIT.USAGE;
  } catch (error) {
    err(`crisis refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};




/** `politik heartbeat` — is the proceeding still beating? */
const cmdHeartbeat = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: { dir: { type: 'string' }, suspend: { type: 'boolean' } },
  });
  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) { err(`heartbeat: ${dir} is not a session repo`); return EXIT.USAGE; }

  const check = checkHeartbeat(hansard, charter.session.heartbeat_timeout_hours, nowStamp());
  out(check.stale ? 'STALE' : 'beating');
  out(`  last beat  ${check.last_beat ?? 'none'}`);
  out(`  ${check.reason}`);

  if (check.stale && values.suspend === true) {
    try {
      const result = markStale(check, nowStamp(), state, hansard);
      await writeHansard(dir, result.hansard);
      await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
      out(`  session marked STALE — resumable, nothing lost (stale_action: ${charter.session.stale_action})`);
      await recordAndCommit(dir, 'SESSION_STALE — heartbeat window elapsed');
    } catch (error) {
      err(`heartbeat: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT.REFUSED;
    }
  }
  return check.stale ? EXIT.REFUSED : EXIT.OK;
};

const list = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);

/** `politik snapshot` — checkpoint the proceeding. */
const cmdSnapshot = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, completed: { type: 'string' },
      'in-flight': { type: 'string' }, pending: { type: 'string' },
      blocked: { type: 'string' },
    },
  });
  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) { err(`snapshot: ${dir} is not a session repo`); return EXIT.USAGE; }

  const ledgerDoc = (await readIfPresent(join(dir, charter.ledger.path))) ?? '';
  const spent = totals(ledgerDoc);

  const result = snapshot({
    completed: list(values.completed),
    in_flight: list(values['in-flight']),
    pending: list(values.pending),
    blocked: list(values.blocked),
    cost_usd: spent.cost_usd,
    max_cost_usd: charter.session.endurance.max_cost_usd,
    motions: spent.rows,
    max_motions: charter.session.endurance.max_motions,
  }, nowStamp(), state, hansard);

  await writeHansard(dir, result.hansard);
  out('STATE_SNAPSHOT committed');
  out(`  spent $${spent.cost_usd.toFixed(4)} over ${spent.rows} act(s)`);
  await recordAndCommit(dir, 'STATE_SNAPSHOT');
  return EXIT.OK;
};

/** `politik resume` — bring a STALE proceeding back. */
const cmdResume = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: { dir: { type: 'string' }, actor: { type: 'string' } },
  });
  const dir = values.dir ?? '.';
  if (values.actor === undefined) { err('resume: --actor is required'); return EXIT.USAGE; }

  const { state, hansard } = await loadSession(dir);
  if (state === null) { err(`resume: ${dir} is not a session repo`); return EXIT.USAGE; }

  try {
    const result = resume(nowStamp(), values.actor, state, hansard);
    await writeHansard(dir, result.hansard);
    await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
    out('RESUMED — the sitting continues');
    const snap = lastSnapshot(result.hansard);
    out(snap === null ? '  no snapshot; agents resume from the Hansard' : '  agents resume from the last STATE_SNAPSHOT');
    await recordAndCommit(dir, 'SESSION_RESUMED');
    return EXIT.OK;
  } catch (error) {
    err(`resume refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/** `politik actor <verb>` — the actor lifecycle verbs. */
const cmdActor = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, actor: { type: 'string' }, role: { type: 'string' },
      subject: { type: 'string' }, seat: { type: 'string' }, to: { type: 'string' },
      reason: { type: 'string' }, type: { type: 'string' }, motion: { type: 'string' },
      child: { type: 'string' }, mandate: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`actor: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }

  if (verb === 'list') {
    const held = seats(hansard);
    if (held.length === 0) out('no actors seated');
    for (const seat of held) out(`  ${seat.role.padEnd(10)} ${seat.actor}`);
    return EXIT.OK;
  }

  const by = {
    at: nowStamp(),
    actor: values.actor ?? '',
    role: (values.role ?? 'AUTHORITY') as never,
    state,
  };
  if (by.actor === '') { err('actor: --actor is required'); return EXIT.USAGE; }

  try {
    let result: { hansard: string } | null = null;
    let message = '';

    if (verb === 'hire') {
      if (values.subject === undefined || values.seat === undefined) {
        err('actor hire: --subject and --seat are required'); return EXIT.USAGE;
      }
      result = hire({ ...by, subject: values.subject, seat: values.seat as never, reason: values.reason ?? 'seated' }, hansard);
      message = `HIRED ${values.subject} as ${values.seat}`;
    } else if (verb === 'promote' || verb === 'demote') {
      if (values.subject === undefined || values.to === undefined) {
        err(`actor ${verb}: --subject and --to are required`); return EXIT.USAGE;
      }
      const move = verb === 'promote' ? promote : demote;
      result = move({ ...by, subject: values.subject, to: values.to as never, reason: values.reason ?? '' }, hansard);
      message = `${verb.toUpperCase()}D ${values.subject} to ${values.to}`;
    } else if (verb === 'exit') {
      if (values.subject === undefined || values.type === undefined) {
        err('actor exit: --subject and --type are required'); return EXIT.USAGE;
      }
      result = exitActor({
        ...by, subject: values.subject, exit_type: values.type as ExitType,
        reason: values.reason ?? '',
      }, hansard);
      message = `EXITED ${values.subject} — ${values.type}`;
    } else if (verb === 'veto') {
      if (values.motion === undefined) { err('actor veto: --motion is required'); return EXIT.USAGE; }
      result = veto({
        ...by, motion: values.motion, reason: values.reason ?? '',
        domain_veto: charter.domain_veto,
      }, hansard);
      message = `VETO EXERCISED against ${values.motion}`;
    } else if (verb === 'spawn') {
      if (values.child === undefined) { err('actor spawn: --child is required'); return EXIT.USAGE; }
      result = spawnChild({ ...by, child: values.child, mandate: values.mandate ?? '' }, hansard);
      message = `REFERRED to committee ${values.child}`;
    } else {
      err(`actor: unknown verb "${verb ?? ''}" — expected hire | promote | demote | exit | veto | spawn | list`);
      return EXIT.USAGE;
    }

    await writeHansard(dir, result.hansard);
    out(message);
    await recordAndCommit(dir, `${message} — by ${by.actor}`);
    return EXIT.OK;
  } catch (error) {
    err(`actor refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/** `politik escalate` — raise a Point of Order. */
const cmdEscalate = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, actor: { type: 'string' }, role: { type: 'string' },
      title: { type: 'string' }, body: { type: 'string' }, seq: { type: 'string' },
      ...PROVIDER_OPTS,
    },
  });

  const dir = values.dir ?? '.';
  const { state } = await loadSession(dir);
  if (state === null) { err(`escalate: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (values.actor === undefined || values.title === undefined || values.body === undefined) {
    err('escalate: --actor, --title and --body are required');
    return EXIT.USAGE;
  }

  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const filed = fileEscalation({
    sequence: values.seq === undefined ? 1 : Number(values.seq),
    at: nowStamp(),
    actor: values.actor,
    role: (values.role ?? 'OPERATOR') as never,
    title: values.title,
    body: values.body,
    state,
  }, hansard);

  await writeFiles(dir, filed.files);
  await writeHansard(dir, filed.hansard);
  await writeFile(join(dir, 'STATE.json'), serializeState(filed.state), 'utf8');

  out('POINT OF ORDER RAISED');
  out(`  escalation  ${filed.escalation_path}`);
  out(`  ruling due  ${filed.ruling_path}`);
  out('  session is SUSPENDED pending a Speaker ruling');
  const { provider } = resolveProvider({ repo: values.repo, token: values.token });
  const opened = await projectEscalation(
    provider, `POINT OF ORDER — ${values.title}`, filed.notification,
  );
  await reportProjection(dir, `ESCALATION ${values.title}`, opened, filed.hansard);

  await recordAndCommit(dir, `POINT_OF_ORDER — ${values.actor}: ${values.title}`);

  // The notification body is built here; delivery is the provider's job.
  out('');
  out('  --- Speaker notification ---');
  for (const line of filed.notification.split('\n')) out(`  ${line}`);
  return EXIT.OK;
};

/** `politik rule` — the Speaker rules, and the sitting resumes. */
const cmdRule = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, seq: { type: 'string' }, actor: { type: 'string' },
      role: { type: 'string' }, outcome: { type: 'string' }, body: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const { state } = await loadSession(dir);
  if (state === null) { err(`rule: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (values.actor === undefined || values.body === undefined) {
    err('rule: --actor and --body are required');
    return EXIT.USAGE;
  }

  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';

  try {
    const ruling = commitRuling({
      sequence: values.seq === undefined ? 1 : Number(values.seq),
      at: nowStamp(),
      actor: values.actor,
      role: (values.role ?? 'AUTHORITY') as never,
      outcome: ((values.outcome ?? 'UPHELD').toUpperCase()) as RulingOutcome,
      body: values.body,
      escalation_path: state.suspension?.escalation_ref ?? 'escalations/',
      state,
    }, hansard);

    await writeFiles(dir, ruling.files);
    await writeHansard(dir, ruling.hansard);
    await writeFile(join(dir, 'STATE.json'), serializeState(ruling.state), 'utf8');

    out(`RULING COMMITTED — ${(values.outcome ?? 'UPHELD').toUpperCase()}`);
    out(`  ${ruling.ruling_path}`);
    out(`  session is ${ruling.state.state} — the sitting resumes`);
    await recordAndCommit(dir, `RULING — ${(values.outcome ?? 'UPHELD').toUpperCase()}`);
    return EXIT.OK;
  } catch (error) {
    err(`ruling refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};


/**
 * `politik broadcast` — put business on the bus.
 *
 * The chamber transport carries the ephemeral nudge; the Hansard remains the
 * record. A broadcast nobody hears loses nothing, because a peer that hears
 * nothing falls back to reading the repo.
 */
const cmdBroadcast = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, target: { type: 'string' },
      slots: { type: 'string' }, task: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const { state, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`broadcast: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }
  if (values.task === undefined) {
    err('broadcast: --task is required');
    return EXIT.USAGE;
  }

  const target = values.target ?? 'OPERATOR';
  const declared = charter.constituencies
    .filter((c) => c.role === target)
    .reduce((n, c) => n + c.slots, 0);
  const slots = values.slots === undefined ? declared : Number(values.slots);

  if (!Number.isInteger(slots) || slots < 0) {
    err('broadcast: --slots must be a non-negative integer');
    return EXIT.USAGE;
  }
  if (declared === 0) {
    err(`broadcast: the Charter seats no ${target} constituency`);
    return EXIT.REFUSED;
  }

  const source = [
    `# [${state.session_guid}]`,
    `## target-actor: ${target}`,
    `## slots-remaining: ${slots}`,
    `## protocol: ${charter.protocol}`,
    '## prompt: |',
    ...values.task.split('\n').map((l) => `  ${l}`),
    '',
  ].join('\n');

  const parsed = parseEnvelope(source);
  if (!parsed.ok) {
    err(`broadcast: ${parsed.issues.map((i) => i.message).join('; ')}`);
    return EXIT.REFUSED;
  }

  const bus = new GitTransport({ dir });
  const result = await bus.publish(parsed.envelope);
  out('BROADCAST PUBLISHED');
  out(`  target ${target}, ${slots} slot(s)`);
  out(`  ${result.ref}`);
  return EXIT.OK;
};

/**
 * `politik motion link` — bind a Motion to its platform object.
 *
 * Without a link, Assent has no pull request to merge and degrades to a
 * local-only record. Kept explicit rather than inferred: guessing which PR a
 * Motion means would risk merging the wrong branch on the strength of a
 * filename match.
 */
const cmdMotion = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  if (verb !== 'link') {
    err(`motion: unknown verb "${verb ?? ''}" — expected link`);
    return EXIT.USAGE;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, motion: { type: 'string' },
      pr: { type: 'string' }, url: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  if (values.motion === undefined || values.pr === undefined) {
    err('motion link: --motion and --pr are required');
    return EXIT.USAGE;
  }
  const pr = Number.parseInt(values.pr.replace(/^#/, ''), 10);
  if (!Number.isInteger(pr) || pr < 1) {
    err('motion link: --pr must be a positive integer');
    return EXIT.USAGE;
  }

  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const updated = appendEntry(hansard, linkEntry(values.motion, pr, values.url ?? '', nowStamp()));
  await writeHansard(dir, updated);

  out(`LINKED ${values.motion} -> #${pr}`);
  await recordAndCommit(dir, `MOTION_PROJECTED — ${values.motion} -> #${pr}`);
  return EXIT.OK;
};

/** `politik ledger` — total the cost record. */
const cmdLedger = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({ args: [...argv], options: { dir: { type: 'string' } } });
  const dir = values.dir ?? '.';
  const { charter } = await loadSession(dir);
  const path = charter?.ledger.path ?? 'LEDGER.md';
  const document = await readIfPresent(join(dir, path));
  if (document === null) {
    err(`ledger: no ${path} in ${dir}`);
    return EXIT.USAGE;
  }

  const t = totals(document);
  out(`rows       ${t.rows}`);
  out(`elapsed    ${(t.elapsed_ms / 1000).toFixed(1)}s`);
  out(`tokens     ${t.tokens.toLocaleString('en-US')}`);
  out(`cost       $${t.cost_usd.toFixed(6)}`);
  if (t.unmeasured > 0) {
    // Never fold unmeasured rows into the total — that would understate spend
    // while looking authoritative.
    out(`unmeasured ${t.unmeasured} row(s) — cost not reported by the agent`);
  }

  const ceiling = checkCostCeiling(
    document,
    charter?.session.endurance.max_cost_usd ?? null,
    charter?.session.endurance.cost_warning_usd ?? null,
  );
  if (ceiling.warning) {
    out(`WARNING — $${ceiling.spent.toFixed(4)} spent, warning line $${(charter?.session.endurance.cost_warning_usd ?? 0).toFixed(2)}`);
  }
  if (ceiling.exceeded) {
    err('COST CEILING EXCEEDED — the session should suspend');
    return EXIT.REFUSED;
  }
  return EXIT.OK;
};

/** Run one turn of a session. */
const cmdRun = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' },
      agent: { type: 'string' },
      actor: { type: 'string' },
      role: { type: 'string' },
      task: { type: 'string' },
      timeout: { type: 'string' },
      claim: { type: 'boolean' },
    },
  });

  const dir = values.dir ?? '.';
  const role = (values.role ?? 'OPERATOR') as never;

  // Claim mode: take business off the bus rather than inventing it. This is the
  // path the Self-Organization Protocol describes — a peer acts because it
  // heard a broadcast it is eligible for, not because someone typed a task.
  let received: Envelope | undefined;
  if (values.claim === true) {
    const { state } = await loadSession(dir);
    if (state === null) { err(`run: ${dir} is not a session repo`); return EXIT.USAGE; }

    const bus = new GitTransport({ dir });
    const waiting = await bus.poll(state.session_guid);
    received = waiting.find((e) => isEligible(e, role));

    if (received === undefined) {
      out(waiting.length === 0
        ? 'no broadcasts on the bus'
        : `no broadcast this agent is eligible for (${waiting.length} waiting)`);
      return EXIT.OK;
    }
    out(`CLAIMED a broadcast — ${received.target_actor}, ${received.slots_remaining} slot(s)`);
  }

  if (values.agent === undefined || values.actor === undefined) {
    err('run: --agent and --actor are required');
    return EXIT.USAGE;
  }
  if (received === undefined && values.task === undefined) {
    err('run: --task is required (or use --claim to take one off the bus)');
    return EXIT.USAGE;
  }

  const outcome = await runTurn({
    dir,
    agent_id: values.agent,
    actor: values.actor,
    role,
    task: received?.prompt ?? values.task ?? '',
    ...(received === undefined ? {} : { envelope: received }),
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    timeout_ms: values.timeout === undefined ? undefined : Number(values.timeout),
  });

  if (!outcome.ok) {
    err(`TURN REFUSED — ${outcome.reason}`);
    if (outcome.entry !== undefined) err('The failure is on the record.');
    return EXIT.REFUSED;
  }

  out('TURN COMPLETE');
  out(`  agent    ${outcome.result.agent}`);
  out(`  elapsed  ${outcome.result.elapsed_ms}ms`);
  out(`  files    ${outcome.files_touched.length > 0 ? outcome.files_touched.join(', ') : 'none'}`);
  out('  recorded in HANSARD.md');
  await recordAndCommit(
    dir,
    `${outcome.entry.type} — ${values.actor} (${values.role ?? 'OPERATOR'})`,
  );
  return EXIT.OK;
};

const cmdStatus = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({ args: [...argv], options: { dir: { type: 'string' } } });
  const dir = values.dir ?? '.';

  const raw = await readIfPresent(join(dir, 'STATE.json'));
  if (raw === null) {
    err(`status: no STATE.json in ${dir} — not a session repo`);
    return EXIT.USAGE;
  }

  const state = parseState(raw);
  if (state === null) {
    err('status: STATE.json is unreadable');
    return EXIT.REFUSED;
  }

  out(`session   ${state.session_guid}`);
  out(`protocol  ${state.protocol}`);
  out(`state     ${state.state}`);
  if (state.suspension !== null) {
    out(`cause     ${state.suspension.cause} since ${state.suspension.since}`);
  }
  out(`quorum    ${state.quorum.present} of ${state.quorum.required}`);
  out(`updated   ${state.updated_at} by ${state.updated_by}`);

  const hansard = await readIfPresent(join(dir, 'HANSARD.md'));
  if (hansard !== null) {
    const entries = parseEntries(hansard);
    out(`record    ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
    const last = entries.at(-1);
    if (last !== undefined) out(`last      ${last.type} by ${last.actor} at ${last.at}`);
  }
  return EXIT.OK;
};

const cmdProrogue = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' },
      actor: { type: 'string' },
      role: { type: 'string' },
      trigger: { type: 'string' },
      summary: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  if (values.actor === undefined || values.role === undefined) {
    err('prorogue: --actor and --role are required');
    return EXIT.USAGE;
  }

  const rawState = await readIfPresent(join(dir, 'STATE.json'));
  const state = rawState === null ? null : parseState(rawState);
  if (state === null) {
    err(`prorogue: no readable STATE.json in ${dir}`);
    return EXIT.USAGE;
  }

  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const trigger = (values.trigger ?? 'TRIGGER_SPEAKER') as Trigger;

  try {
    const result = prorogue(
      {
        at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        actor: values.actor,
        role: values.role as never,
        trigger,
        state,
        check: checkTermination(
          { max_motions: null, deadline: null, max_cost_usd: null },
          { motions: 0, total_cost_usd: 0, now: new Date().toISOString() },
          trigger === 'TRIGGER_SPEAKER',
        ),
        summary: values.summary,
      },
      hansard,
    );

    await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
    await writeFile(join(dir, 'HANSARD.md'), result.hansard, 'utf8');
    await writeFiles(dir, result.files);

    out('PROROGUED');
    out(`  trigger ${trigger}`);
    out('  the Hansard is sealed');
    if (result.milestone_to_close !== null) {
      out(`  milestone ${result.milestone_to_close} must be closed on the SCM`);
    }
    return EXIT.OK;
  } catch (error) {
    err(`prorogue refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

export const run = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      out(USAGE);
      return EXIT.OK;
    case 'version':
    case '--version':
      out(VERSION);
      return EXIT.OK;
    case 'scaffold':
      return cmdScaffold(rest);
    case 'doctor':
      return cmdDoctor();
    case 'protocol':
      return cmdProtocol(rest);
    case 'validate':
      return cmdValidate(rest);
    case 'init':
      return cmdInit(rest);
    case 'crisis':
      return cmdCrisis(rest);
    case 'division':
      return cmdDivision(rest);
    case 'assent':
      return cmdAssent(rest);
    case 'heartbeat':
      return cmdHeartbeat(rest);
    case 'snapshot':
      return cmdSnapshot(rest);
    case 'resume':
      return cmdResume(rest);
    case 'actor':
      return cmdActor(rest);
    case 'escalate':
      return cmdEscalate(rest);
    case 'rule':
      return cmdRule(rest);
    case 'broadcast':
      return cmdBroadcast(rest);
    case 'motion':
      return cmdMotion(rest);
    case 'ledger':
      return cmdLedger(rest);
    case 'run':
      return cmdRun(rest);
    case 'status':
      return cmdStatus(rest);
    case 'prorogue':
      return cmdProrogue(rest);
    default:
      err(`unknown command: ${command}`);
      err(USAGE);
      return EXIT.USAGE;
  }
};
