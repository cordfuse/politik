/**
 * politik — command line interface.
 *
 * Thin shell over the library: every command parses arguments, calls a pure
 * function, and renders the result. No governance logic lives here. If a
 * decision is being made in this file, it is in the wrong place.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { parseCharter, validateCharter } from './charter.ts';
import { dropWrit } from './init.ts';
import { parseState, serializeState } from './state.ts';
import { checkTermination, prorogue, type Trigger } from './prorogation.ts';
import { parseEntries } from './hansard.ts';
import type { FileWrite } from './scm.ts';

const VERSION = '0.2.0';

const USAGE = `politik — governed multi-agent sessions on git

Usage
  politik version
  politik validate <charter.md> [--protocol <name>]
  politik init --charter <path> --speaker <handle> [--out <dir>] [--guid <id>]
  politik status [--dir <dir>]
  politik prorogue --dir <dir> --actor <handle> --role <ROLE> --trigger <TRIGGER>

Commands
  version     Print the version.
  validate    Parse a CHARTER.md and run the Writ Drop rules. Writes nothing.
  init        Drop the Writ — create a session repo file set on disk.
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
    case 'validate':
      return cmdValidate(rest);
    case 'init':
      return cmdInit(rest);
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
