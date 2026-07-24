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
import {
  callDivision, castVote, grantAssent, recordOutcome, tallyDivision,
  type Vote,
} from './division.ts';
import { PROTOCOL_MODES, type ProtocolMode } from './protocol.ts';
import { checkTermination, prorogue, type Trigger } from './prorogation.ts';
import { parseEntries } from './hansard.ts';
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
  politik run --dir <dir> --agent <id> --actor <handle> --role <ROLE> --task <text>
  politik division call --motion <id> --actor <h> --role <ROLE> [--reviewers a,b]
  politik division vote --motion <id> --actor <h> --role <ROLE> --vote AYE|NO|ABSTAIN
  politik division tally --motion <id>
  politik assent --motion <id> --actor <h> --role AUTHORITY
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

const nowStamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** `politik division call|vote|tally`. */
const cmdDivision = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, motion: { type: 'string' }, actor: { type: 'string' },
      role: { type: 'string' }, vote: { type: 'string' }, reviewers: { type: 'string' },
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
    }, hansard);
    await writeHansard(dir, result.hansard);
    await writeFile(join(dir, 'STATE.json'), serializeState(result.state), 'utf8');
    out(`ASSENT GRANTED — ${values.motion} is enacted`);
    return EXIT.OK;
  } catch (error) {
    err(`assent refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
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
    },
  });

  if (values.agent === undefined || values.actor === undefined || values.task === undefined) {
    err('run: --agent, --actor and --task are required');
    return EXIT.USAGE;
  }

  const outcome = await runTurn({
    dir: values.dir ?? '.',
    agent_id: values.agent,
    actor: values.actor,
    role: (values.role ?? 'OPERATOR') as never,
    task: values.task,
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
    case 'division':
      return cmdDivision(rest);
    case 'assent':
      return cmdAssent(rest);
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
