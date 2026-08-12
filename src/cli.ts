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
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { isRole, type Role } from './canon.ts';
import { charterFingerprint, parseCharter, validateCharter } from './charter.ts';
import { dropWrit } from './init.ts';
import { initSessionRepo } from './git.ts';
import { parseState, serializeState, type SessionStateFile } from './state.ts';
import { scaffoldTemplates } from './templates/parliamentary.ts';
import { generateProtocol, lintSource } from './protocol-sdk.ts';
import { diagnose } from './doctor.ts';
import { runTurn } from './runner.ts';
import { GitTransport } from './transport.ts';
import { conflictEntry, detectRecordConflicts, openConflicts, resolveConflict } from './conflict.ts';
import { parseEnvelope, isEligible, type Envelope } from './envelope.ts';
import { commitRecord, type CommitResult } from './git.ts';
import { discoverTree, rollUp, detectCascades, type FederationNode } from './federation.ts';
import { standings, type RankBy } from './standings.ts';
import {
  isPairingFormat, matchCreatedEntry, matchDecidedEntry, matches, pairRound, reportMatch,
} from './tournament.ts';
import { cascadeAlerts, cascadeEntry, recordOnNode } from './tree.ts';
import {
  linkEntry, projectAssent, projectDivision, projectEscalation,
  projectionEntry, resolveProvider,
} from './projection.ts';
import { appendLedgerRow, checkCostCeiling, totals } from './ledger.ts';
import { checkHeartbeat, lastSnapshot, markStale, resume, snapshot } from './heartbeat.ts';
import { commitRuling, fileEscalation, type RulingOutcome } from './escalation.ts';
import {
  challengeAction, demote, disputeExit, exitActor, hire, promote, resolveDispute, seats,
  spawnChild, veto, vetoOutstanding, type ExitType,
} from './actors.ts';
import {
  checkCapture, externalReview, fileCrisis, suspendForCrisis,
  type CrisisRuling,
} from './crisis.ts';
import {
  breakDeadlock, callDivision, castVote, cull, divisionCalled, divisionDecided, grantAssent,
  isExitPolicy, isResolution, recordOutcome, suspendForDeadlock, tallyDivision, type Vote,
} from './division.ts';
import {
  PROTOCOL_MODES, allowsCharterAmendment, parseProtocol, roleTerm, term,
  type Protocol, type ProtocolMode,
} from './protocol.ts';
import { reviewIntegrity } from './integrity.ts';
import { checkTermination, isTerminationPolicy, lastStanding, prorogue, type Trigger } from './prorogation.ts';
import { RECORD_TYPES, appendEntry, parseEntries } from './hansard.ts';
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
  politik scaffold --dir <dir> [--protocol parliamentary] [--quorum <n>] [--parent <dir>]
  politik doctor
  politik protocol lint <manifest.yml>
  politik protocol new <name> [--mode <mode>] [--out <dir>]
  politik validate <charter.md> [--protocol <name>]
  politik init --charter <path> --speaker <handle> [--dir <dir>] [--guid <id>] [--standalone]
  politik run --agent <id> --actor <h> --role <ROLE> (--task <text> | --claim)
  politik division call --motion <id> --actor <h> --role <ROLE> [--reviewers a,b]
  politik division vote --motion <id> --actor <h> --role <ROLE> --vote AYE|NO|ABSTAIN
  politik division tally --motion <id>
  politik division break --motion <id> --actor <handle> --decide carry|reject   # break a DEADLOCK
  politik assent --motion <id> --actor <h> --role AUTHORITY
  politik crisis file --actor <h> --role <ROLE> --against <speaker> --grounds <text>
  politik crisis check
  politik crisis review --reviewer <h> --accused <speaker> --ruling UPHELD|DISMISSED --reasons <text>
  politik escalate --actor <h> --role <ROLE> --title <t> --body <text> [--seq <n>]
  politik rule --seq <n> --actor <h> --outcome UPHELD|REVERSED|NOTED --body <text>
  politik challenge --actor <delegate> --against <action> --grounds <text> [--window <min>]
  politik actor hire|promote|demote|exit|veto|spawn ... (see below)
  politik actor dispute --actor <removed> --grounds <text>          # challenge one's own removal
  politik actor reinstate --subject <h> --actor <speaker> --ruling UPHELD|REVERSED
  politik actor list
  politik heartbeat [--dir <dir>] [--suspend]
  politik snapshot [--dir <dir>] [--completed a,b] [--in-flight a] [--pending a]
  politik resume --actor <handle> [--dir <dir>]
  politik conflict check [--dir <dir>]
  politik conflict resolve --motions a,b --actor <h> --role <ROLE> --resolution <t>
  politik broadcast --target <ROLE> --slots <n> --task <text> [--dir <dir>]
  politik motion link --motion <id> --pr <n> [--url <u>]
  politik ledger [--dir <dir>]
  politik status [--dir <dir>]
  politik hansard [--dir <dir>]           # the record, in the protocol's vocabulary
  politik integrity [--dir <dir>]         # scan the record for bad-faith patterns
  politik prorogue --dir <dir> --actor <handle> --role <ROLE> --trigger <TRIGGER>
  politik standings [--dir <dir>] [--by win-loss|survival]   # score a competitive protocol
  politik pair --format swiss|round-robin|single-elim [--dir <dir>]   # pair the next round of MATCHes
  politik match report --match <id> --winner <contestant> [--actor <referee>]
  politik match list [--dir <dir>]
  politik registry [--dir <root>] [--state <STATE>]   # the whole tree, at a glance
  politik cascade [--dir <root>]                       # warn where a fault repeats across siblings

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
  challenge   A DELEGATE disputes an AUTHORITY action — recorded, attributable, non-binding.
  actor       Seat, move or remove actors; exercise a veto; refer to committee.
  heartbeat   Has the proceeding gone quiet? --suspend marks it STALE.
  snapshot    Commit a STATE_SNAPSHOT so a new agent can continue the work.
  resume      Resume a STALE proceeding.
  conflict    Find or resolve Motions touching the same files. Routine, not a fault.
  broadcast   Put business on the bus for peers to claim.
  motion      Bind a Motion to a pull request so Assent can enact it.
  ledger      Total the session's measured cost.
  status      Read STATE.json and summarise the proceeding.
  prorogue    Close a proceeding permanently and seal the Hansard.
  standings   Score a competitive protocol from the record (win-loss or survival).
  pair        Pair the next round of MATCHes by format (swiss, round-robin, single-elim).
  match       Report a MATCH result, or list the bracket.
  registry    Walk the tree: every session, its state and cost, with a roll-up.
  cascade     Warn where a fault repeats across sibling sessions.
`;

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line: string) => process.stderr.write(`${line}\n`);

/**
 * A supplied --role/--target must name a CANON role; an absent one falls back to
 * a default downstream. Governance-critical commands (Division, actors) already
 * reject a bad role in their pure layer; this guards the record-writing commands
 * that only carry the role as attribution, so a garbage string never reaches the
 * immutable Hansard.
 */
const badRole = (value: string | undefined): boolean => value !== undefined && !isRole(value);

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
      dir: { type: 'string' },
      out: { type: 'string' },
      protocol: { type: 'string' },
      quorum: { type: 'string' },
      resolution: { type: 'string' },
      exit: { type: 'string' },
      termination: { type: 'string' },
      escalation: { type: 'string' },
      parent: { type: 'string' },
    },
  });

  // Resolve the named protocol's manifest so its declared mechanics (ADR-0007)
  // and escalation flag are inherited into the Charter. Explicit flags below
  // still override. This is what makes `scaffold --protocol battle-royale`
  // produce a Charter that actually behaves like one.
  const protocol = values.protocol ?? 'parliamentary';
  const manifestPath = join(
    dirname(fileURLToPath(import.meta.url)), '..', 'protocols', `${protocol}.yml`,
  );
  const manifestSrc = await readIfPresent(manifestPath);
  if (manifestSrc === null) {
    err(`scaffold: unknown protocol "${protocol}" — no manifest at protocols/${protocol}.yml`);
    return EXIT.USAGE;
  }
  const manifest = parseProtocol(manifestSrc);
  if (!manifest.ok) {
    err(`scaffold: protocols/${protocol}.yml is not a valid manifest`);
    return EXIT.USAGE;
  }

  const quorum = values.quorum === undefined ? undefined : Number(values.quorum);
  if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1)) {
    err('scaffold: --quorum must be an integer >= 1');
    return EXIT.USAGE;
  }

  // Mechanics flags (ADR-0007) — validate up front so a typo does not silently
  // default to Parliament.
  if (values.resolution !== undefined && !isResolution(values.resolution)) {
    err(`scaffold: --resolution must be majority | supermajority | unanimity`);
    return EXIT.USAGE;
  }
  if (values.exit !== undefined && !isExitPolicy(values.exit)) {
    err(`scaffold: --exit must be division | elimination | none`);
    return EXIT.USAGE;
  }
  if (values.termination !== undefined && !isTerminationPolicy(values.termination)) {
    err(`scaffold: --termination must be objective | last-standing | verdict`);
    return EXIT.USAGE;
  }
  if (values.escalation !== undefined && values.escalation !== 'enabled' && values.escalation !== 'disabled') {
    err(`scaffold: --escalation must be enabled | disabled`);
    return EXIT.USAGE;
  }

  // Session directory: `--dir` is the standard across every other command;
  // `--out` is kept as an alias so a scaffold script written against the old
  // flag still works.
  const dir = values.dir ?? values.out ?? '.';
  // Explicit flag > manifest default > template default.
  const m = manifest.protocol.mechanics;
  // Monorepo placement (ADR-0008): --parent nests this session under a parent
  // node in the same tree. inherits_from is the child->parent relative path, so
  // the lineage resolves from within the session's own directory. init detects
  // the enclosing repo and commits the writ drop there rather than nesting a repo.
  const inherits_from = values.parent === undefined ? null : (relative(dir, values.parent) || '.');
  const files = scaffoldTemplates(manifest.protocol, {
    protocol,
    ...(inherits_from === null ? {} : { inherits_from }),
    ...(quorum === undefined ? {} : { quorum }),
    resolution: values.resolution ?? m.resolution,
    exit: values.exit ?? m.exit,
    termination: values.termination ?? m.termination,
    escalation: values.escalation ?? (manifest.protocol.no_escalation ? 'disabled' : 'enabled'),
  });
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
      dir: { type: 'string' },
      out: { type: 'string' },
      guid: { type: 'string' },
      protocol: { type: 'string' },
      standalone: { type: 'boolean' },
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

  // `--dir` is the standard flag; `--out` stays an accepted alias here.
  const dir = values.dir ?? values.out ?? '.';
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

  // Writ Drop creates the session repo. On a local session that means making
  // `dir` a git repo, or the record silently never commits. Idempotent — an
  // existing (e.g. cloned GitHub) repo is left alone.
  const repo = await initSessionRepo(dir, values.speaker, result.state.session_guid, undefined, {
    standalone: values.standalone === true,
  });

  out('WRIT DROPPED');
  out(`  session  ${result.state.session_guid}`);
  out(`  protocol ${result.charter.protocol}`);
  out(`  state    ${result.state.state}`);
  out(`  files    ${result.files.length} written to ${dir}`);
  out(`  git      ${repo.reason}${repo.sha ? ` (${repo.sha.slice(0, 7)})` : ''}`);
  return EXIT.OK;
};


/* -------------------------------------------------------------------------- */
/* Division helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The protocol a session runs, resolved from its manifest for vocabulary
 * translation (ADR-0007 / protocol.ts). The stored record stays CANON — the
 * engine reads it — so translation is presentation only, applied to what the
 * user sees. Null for a protocol with no shipped manifest; callers fall back to
 * the CANON term, which is exactly what roleTerm/term do.
 */
const sessionProtocol = async (protocolName: string): Promise<Protocol | null> => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'protocols', `${protocolName}.yml`);
  const src = await readIfPresent(path);
  if (src === null) return null;
  const parsed = parseProtocol(src);
  return parsed.ok ? parsed.protocol : null;
};

/** Render a CANON role in the session protocol's vocabulary, or CANON if none. */
const asRoleTerm = (protocol: Protocol | null, role: string): string =>
  protocol === null ? role : roleTerm(protocol, role as never);

/** Render a CANON primitive/verb in the session protocol's vocabulary. */
const asTerm = (protocol: Protocol | null, canon: string): string =>
  protocol === null ? canon : term(protocol, canon);

const loadSession = async (dir: string) => {
  const stateRaw = await readIfPresent(join(dir, 'STATE.json'));
  const state = stateRaw === null ? null : parseState(stateRaw);
  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const charterRaw = await readIfPresent(join(dir, 'CHARTER.md'));
  const charter = charterRaw === null ? null : parseCharter(charterRaw);
  return { state, hansard, charter: charter?.ok === true ? charter.charter : null };
};

/** The Charter fingerprint recorded on the WRIT_DROP entry, or null if none. */
const writDropFingerprint = (hansard: string): string | null => {
  for (const entry of parseEntries(hansard)) {
    if (entry.type === RECORD_TYPES.WRIT_DROP) {
      return entry.fields['Charter SHA256'] ?? null;
    }
  }
  return null;
};

/**
 * Refuse a governance act when an immutable-charter protocol's Charter has been
 * edited since Writ Drop.
 *
 * A protocol whose mechanics forbid mid-session amendment (ADR-0007
 * `immutable_charter` — adversarial-collaboration, elimination-tournament)
 * commits its Charter at Writ Drop and records that text's fingerprint on the
 * WRIT_DROP entry. If CHARTER.md no longer matches, the constitution was
 * amended after the session opened, which this class of protocol exists to
 * forbid. Returns an operator-facing refusal, or null when the act may proceed:
 * a mutable protocol, a legacy session with no recorded fingerprint (cannot be
 * enforced retroactively), or an intact Charter.
 */
const immutableCharterViolation = async (
  dir: string,
  protocolName: string,
): Promise<string | null> => {
  const protocol = await sessionProtocol(protocolName);
  if (protocol === null || allowsCharterAmendment(protocol)) return null;
  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';
  const recorded = writDropFingerprint(hansard);
  if (recorded === null) return null;
  const current = await readIfPresent(join(dir, 'CHARTER.md'));
  if (current === null) return null;
  const now = charterFingerprint(current);
  if (now === recorded) return null;
  return [
    `Refused: the ${protocol.name} protocol runs an immutable Charter — the`,
    'Standing Orders are fixed at Writ Drop and cannot be amended mid-session,',
    'yet CHARTER.md has changed since',
    `(${recorded.slice(0, 12)} → ${now.slice(0, 12)}).`,
    'Revert CHARTER.md to its Writ Drop text, or prorogue this session and',
    'convene a new one under the amended Charter.',
  ].join(' ');
};

/**
 * Guard a governance write: prints the refusal and returns false if an
 * immutable Charter has been tampered with, true when the act may proceed.
 */
const charterIsIntact = async (dir: string, protocolName: string): Promise<boolean> => {
  const violation = await immutableCharterViolation(dir, protocolName);
  if (violation === null) return true;
  err(violation);
  return false;
};

/**
 * Atomic file write: land a complete temp file, then rename it over the target.
 *
 * The Hansard is the immutable record — the whole point of Politik — and a
 * half-written record is worse than none. A plain writeFile opens with O_TRUNC:
 * an interrupt between the truncate and the write (SIGPIPE from a closed `| head`,
 * Ctrl-C, SIGTERM, a crash) leaves the file at zero bytes, and the operator has
 * already been told the act succeeded. rename(2) is atomic on a POSIX filesystem,
 * so the target is only ever replaced by a fully-written file; an interrupted
 * write orphans a `.tmp` and leaves the record intact. This is the durability the
 * Standing Orders assume when they say the record is the source of truth.
 */
const atomicWrite = async (path: string, content: string): Promise<void> => {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
};

const writeHansard = (dir: string, hansard: string) =>
  atomicWrite(join(dir, 'HANSARD.md'), hansard);

const writeState = (dir: string, state: SessionStateFile) =>
  atomicWrite(join(dir, 'STATE.json'), serializeState(state));

/**
 * Persist a governance act to the record.
 *
 * Writing the file is not enough: the Standing Orders this framework ships say
 * uncommitted work does not exist, and that binds the engine as much as an
 * actor. Reports what happened rather than failing silently — a session run
 * outside git is legitimate, but the operator should know the record is not
 * durable.
 */
/**
 * Record a governance act in the LEDGER. Governance acts spawn no agent, so
 * their cost is `unmeasured` — but the act still belongs in the cost record, or
 * the LEDGER accounts for a session's agent turns and nothing else, and the
 * "replaces a ticket system" claim covers exactly these acts (AUDIT). Loads the
 * Charter itself so a caller needs only the act's who and what. Call before the
 * commit, which then includes the new row.
 */
const logAct = async (dir: string, actor: string, role: Role, item: string): Promise<void> => {
  const { charter } = await loadSession(dir);
  if (charter === null || !charter.ledger.enabled) return;
  const path = join(dir, charter.ledger.path);
  const doc = (await readIfPresent(path)) ?? '';
  await atomicWrite(
    path,
    appendLedgerRow(doc, { at: nowStamp(), actor, role, item, elapsed_ms: 0, usage: null }),
  );
};

/**
 * Commit the act and return the result WITHOUT printing — "record, then report."
 *
 * The git commit is the durable point and touches no stdout, so a closed pipe
 * (`… | head`, Ctrl-C) cannot interrupt it. Printing — which *can* fault on a
 * closed pipe — happens only after this returns, via reportCommit(). So an
 * interrupt can never land between telling the operator "success" and the record
 * actually existing: every command writes, commits, then reports.
 */
const commitAct = (
  dir: string,
  message: string,
  extra: readonly string[] = [],
): Promise<CommitResult> =>
  commitRecord(dir, message, [
    'HANSARD.md',
    'STATE.json',
    'LEDGER.md',
    '.politik/LEDGER.md',
    ...extra,
  ]);

/** Print a commit's outcome. Call only AFTER the commit, as part of the report. */
const reportCommit = (result: CommitResult): void => {
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
/**
 * Write the projection entry to the record and return the line to print later.
 *
 * Write-now, report-later: the projection entry must be on the record before the
 * commit, but its "projected / not projected" line is output and must wait until
 * after the commit (see commitAct). Callers append this to their report block.
 */
const applyProjection = async (
  dir: string,
  act: string,
  result: { projected: boolean; detail: string; ref: string | null },
  hansard: string,
): Promise<string> => {
  await writeHansard(dir, appendEntry(hansard, projectionEntry(act, result, nowStamp())));
  return `  ${result.projected ? 'projected' : 'not projected'} — ${result.detail}`;
};

/** `politik division call|vote|tally`. */
const cmdDivision = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, motion: { type: 'string' }, actor: { type: 'string' },
      role: { type: 'string' }, vote: { type: 'string' }, reviewers: { type: 'string' },
      decide: { type: 'string' },
      ...PROVIDER_OPTS,
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`division: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }
  if (!(await charterIsIntact(dir, charter.protocol))) return EXIT.REFUSED;
  if (values.motion === undefined) {
    err('division: --motion is required');
    return EXIT.USAGE;
  }
  const protocol = await sessionProtocol(charter.protocol);

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
      const { provider } = resolveProvider({ repo: values.repo, token: values.token });
      const reviewers = (values.reviewers ?? '').split(',').filter((r) => r.length > 0);
      const projected = await projectDivision(provider, result.hansard, values.motion, reviewers);
      const projMsg = await applyProjection(dir, `DIVISION_CALLED ${values.motion}`, projected, result.hansard);

      const rec = await commitAct(dir, `DIVISION_CALLED — ${values.motion}`);
      out(`${asTerm(protocol, 'DIVISION')} called on ${values.motion}`);
      out(projMsg);
      reportCommit(rec);
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
      const rec = await commitAct(dir, `VOTE_CAST — ${values.actor} on ${values.motion}`);
      out(`${asTerm(protocol, 'VOTE')} recorded — ${values.actor}: ${values.vote.toUpperCase()}`);
      reportCommit(rec);
      return EXIT.OK;
    }

    if (verb === 'tally') {
      if (!divisionCalled(hansard, values.motion)) {
        err(`division refused: no Division has been called on ${values.motion}`);
        return EXIT.REFUSED;
      }
      if (divisionDecided(hansard, values.motion)) {
        err(`division refused: the Division on ${values.motion} is already decided — its outcome is on the record`);
        return EXIT.REFUSED;
      }
      const outcome = tallyDivision(
        hansard, values.motion, charter.session.quorum, null, charter.mechanics.resolution,
      );

      // A tie with quorum is a DEADLOCK, not a rejection (ADR-0004 Proposal 4):
      // the House could not decide, so the sitting suspends for AUTHORITY to
      // break rather than silently recording a loss. Only genuine ties suspend;
      // a majority either way falls through to the ordinary outcome below.
      if (!outcome.carried && outcome.ayes === outcome.noes && outcome.quorum_met) {
        const deadlock = suspendForDeadlock(outcome, nowStamp(), state, hansard);
        await writeHansard(dir, deadlock.hansard);
        await writeState(dir, deadlock.state);
        await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'OPERATOR') as never, `DEADLOCK ${values.motion}`);
        const rec = await commitAct(dir, `DEADLOCK — ${values.motion}`);
        out(`${asTerm(protocol, 'MOTION')} DEADLOCKED — tied ${outcome.ayes} all, no majority`);
        out('  the session is SUSPENDED — AUTHORITY must break the tie:');
        out(`    politik division break --motion ${values.motion} --actor <speaker> --decide carry|reject`);
        reportCommit(rec);
        return EXIT.REFUSED;
      }

      const result = recordOutcome(outcome, nowStamp(), values.actor ?? 'RECORD',
        (values.role ?? 'OPERATOR') as never, hansard);
      // exit: elimination culls the losing side (ADR-0007). The outcome is
      // recorded first, then the cull it triggers, so the record reads in order.
      let doc = result.hansard;
      const eliminated = cull(doc, values.motion, charter.mechanics.exit, nowStamp());
      for (const entry of eliminated) doc = appendEntry(doc, entry);

      // termination override point (ADR-0007). last-standing seals the moment a
      // cull leaves one seated actor — checked only after an actual elimination,
      // so a fresh session is never mistaken for a finished one. verdict seals the
      // moment a Division carries: a decision has been reached and the body rises.
      let terminationMsg: string | null = null;
      const seal = async (trigger: Trigger, summary: string, msg: string) => {
        const end = prorogue(
          { at: nowStamp(), actor: 'RECORD', role: 'OPERATOR' as never, trigger, state, summary },
          doc,
        );
        doc = end.hansard;
        await writeState(dir, end.state);
        terminationMsg = msg;
      };
      if (charter.mechanics.termination === 'last-standing' && eliminated.length > 0) {
        const standing = lastStanding(doc);
        if (standing.terminate) {
          await seal(
            'TRIGGER_LAST_STANDING' as Trigger,
            standing.survivor ? `Last standing: ${standing.survivor}` : 'No actors remain',
            `last standing: ${standing.survivor ?? 'none'}`,
          );
        }
      } else if (charter.mechanics.termination === 'verdict' && outcome.carried) {
        await seal(
          'TRIGGER_VERDICT' as Trigger,
          `Verdict reached on ${values.motion}`,
          `verdict reached on ${values.motion}`,
        );
      }

      await writeHansard(dir, doc);
      await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'OPERATOR') as never,
        `${outcome.carried ? 'MOTION_CARRIED' : 'MOTION_REJECTED'} ${values.motion}`);
      const rec = await commitAct(dir, `${outcome.carried ? 'MOTION_CARRIED' : 'MOTION_REJECTED'} — ${values.motion}`);

      out(outcome.carried ? `${asTerm(protocol, 'MOTION')} CARRIED` : `${asTerm(protocol, 'MOTION')} NOT CARRIED`);
      out(`  ayes ${outcome.ayes}  noes ${outcome.noes}  abstentions ${outcome.abstentions}`);
      out(`  quorum ${outcome.quorum_met ? 'met' : 'NOT MET'}`);
      out(`  ${outcome.reason}`);
      if (eliminated.length > 0) {
        out(`  eliminated ${eliminated.length}: ${eliminated.map((e) => e.fields?.['Actor affected']).join(', ')}`);
      }
      if (terminationMsg !== null) {
        out(`  TERMINATED — ${terminationMsg} — the Hansard is sealed`);
      }
      reportCommit(rec);
      return outcome.carried ? EXIT.OK : EXIT.REFUSED;
    }

    if (verb === 'break') {
      if (values.actor === undefined || values.decide === undefined) {
        err('division break: --actor and --decide (carry|reject) are required'); return EXIT.USAGE;
      }
      const decision = values.decide.toLowerCase();
      if (decision !== 'carry' && decision !== 'reject') {
        err('division break: --decide must be carry or reject'); return EXIT.USAGE;
      }
      const result = breakDeadlock(values.motion, decision, nowStamp(), values.actor, state, hansard,
        charter.session.quorum, charter.mechanics.resolution);
      await writeHansard(dir, result.hansard);
      await writeState(dir, result.state);
      await logAct(dir, values.actor, 'AUTHORITY' as never, `DEADLOCK_BROKEN ${values.motion} ${decision}`);
      const rec = await commitAct(dir, `DEADLOCK_BROKEN — ${values.motion} ${decision}`);
      out(`${asTerm(protocol, 'MOTION')} ${result.outcome.carried ? 'CARRIED' : 'NOT CARRIED'} — AUTHORITY broke the deadlock`);
      out(`  casting vote ${decision === 'carry' ? 'AYE' : 'NO'} — ${result.outcome.reason}`);
      out('  the sitting resumes');
      reportCommit(rec);
      return result.outcome.carried ? EXIT.OK : EXIT.REFUSED;
    }

    err(`division: unknown verb "${verb ?? ''}" — expected call | vote | tally | break`);
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
  if (!(await charterIsIntact(dir, charter.protocol))) return EXIT.REFUSED;
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
    await writeState(dir, result.state);

    // ADR-0004 defines ASSENT as merging the Motion. This is where the decision
    // reaches the world; until it was wired, assent recorded a decision that
    // changed nothing.
    const { provider } = resolveProvider({ repo: values.repo, token: values.token });
    const merged = await projectAssent(
      provider, result.hansard, values.motion, charter.session.merge_strategy,
    );
    const projMsg = await applyProjection(dir, `ASSENT ${values.motion}`, merged, result.hansard);

    await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'AUTHORITY') as never, `ASSENT ${values.motion}`);
    const rec = await commitAct(dir, `ASSENT_GRANTED — ${values.motion} enacted`);
    out(`${asTerm(await sessionProtocol(charter.protocol), 'ASSENT')} granted — ${values.motion} is enacted`);
    out(projMsg);
    reportCommit(rec);
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
      if (badRole(values.role)) { err(`crisis file: "${values.role}" is not a CANON role`); return EXIT.USAGE; }
      const result = fileCrisis({
        at: nowStamp(), actor: values.actor, role: (values.role ?? 'OPERATOR') as never,
        grounds: values.grounds, against: values.against, state,
        witness: charter.governance.witness_council.enabled
          ? { ...charter.governance.witness_council, can_file: 'CONSTITUTIONAL_CRISIS' as const }
          : null,
      }, hansard);
      await writeHansard(dir, result.hansard);
      await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'OPERATOR') as never, `CRISIS_FILED against ${values.against}`);
      const rec = await commitAct(dir, `CONSTITUTIONAL_CRISIS_FILED — ${values.actor}`);
      out(`CRISIS FILED by ${values.actor} against ${values.against}`);
      reportCommit(rec);

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
      if (check.triggered) {
        const suspended = suspendForCrisis(check, nowStamp(), state, result.hansard);
        await writeHansard(dir, suspended.hansard);
        await writeState(dir, suspended.state);
        const sealed = await commitAct(dir, 'CONSTITUTIONAL_CRISIS — session suspended');
        out(`  ${check.reason}`);
        out('');
        out('  CONSTITUTIONAL CRISIS — the session is SUSPENDED');
        out('  Resumption requires review by a human outside this session.');
        reportCommit(sealed);
      } else {
        out(`  ${check.reason}`);
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
      await writeState(dir, result.state);
      await logAct(dir, values.reviewer ?? 'RECORD', 'OBSERVER' as never, `CRISIS_RULING ${values.ruling?.toUpperCase() ?? 'UPHELD'}`);
      const rec = await commitAct(dir, `CONSTITUTIONAL_CRISIS_RULING — ${values.ruling?.toUpperCase() ?? 'UPHELD'}`);
      out(`EXTERNAL RULING — ${values.ruling?.toUpperCase() ?? 'UPHELD'}`);
      out(`  session is now ${result.state.state}`);
      reportCommit(rec);
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
      await writeState(dir, result.state);
      const rec = await commitAct(dir, 'SESSION_STALE — heartbeat window elapsed');
      out(`  session marked STALE — resumable, nothing lost (stale_action: ${charter.session.stale_action})`);
      reportCommit(rec);
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
  // A checkpoint records live business (completed/in-flight/pending) so a STALE
  // sitting can resume from it — meaningless on a sealed or dead session, and
  // appending to a Hansard prorogation sealed would break the seal.
  if (state.state === 'PROROGUED' || state.state === 'INVALID') {
    err(`snapshot refused: the session is ${state.state} — its Hansard is sealed`);
    return EXIT.REFUSED;
  }

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
  const rec = await commitAct(dir, 'STATE_SNAPSHOT');
  out('STATE_SNAPSHOT committed');
  out(`  spent $${spent.cost_usd.toFixed(4)} over ${spent.rows} act(s)`);
  reportCommit(rec);
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
    await writeState(dir, result.state);
    const rec = await commitAct(dir, 'SESSION_RESUMED');
    out('RESUMED — the sitting continues');
    const snap = lastSnapshot(result.hansard);
    out(snap === null ? '  no snapshot; agents resume from the Hansard' : '  agents resume from the last STATE_SNAPSHOT');
    reportCommit(rec);
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
      grounds: { type: 'string' }, ruling: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null || charter === null) {
    err(`actor: ${dir} is not a session repo`);
    return EXIT.USAGE;
  }
  if (verb !== 'list' && !(await charterIsIntact(dir, charter.protocol))) {
    return EXIT.REFUSED;
  }

  if (verb === 'list') {
    const protocol = await sessionProtocol(charter.protocol);
    const held = seats(hansard);
    if (held.length === 0) out('no actors seated');
    for (const seat of held) out(`  ${asRoleTerm(protocol, seat.role).padEnd(16)} ${seat.actor}`);
    return EXIT.OK;
  }

  const by = {
    at: nowStamp(),
    actor: values.actor ?? '',
    role: (values.role ?? 'AUTHORITY') as never,
    state,
  };
  if (by.actor === '') { err('actor: --actor is required'); return EXIT.USAGE; }
  const protocol = await sessionProtocol(charter.protocol);

  try {
    // Disputed exit files and rulings change the session's state (suspend, then
    // resume), unlike the seat verbs below which only touch the record — so they
    // write STATE.json and return here rather than falling through the shared tail.
    if (verb === 'dispute') {
      if (values.grounds === undefined) { err('actor dispute: --grounds is required'); return EXIT.USAGE; }
      const disputed = disputeExit(nowStamp(), by.actor, values.grounds, state, hansard);
      await writeHansard(dir, disputed.hansard);
      await writeState(dir, disputed.state);
      await logAct(dir, by.actor, by.role, `EXIT_DISPUTED ${by.actor}`);
      const rec = await commitAct(dir, `EXIT_DISPUTED — ${by.actor}`);
      out(`EXIT DISPUTED by ${by.actor}`);
      out('  the sitting is SUSPENDED pending a Speaker ruling:');
      out(`    politik actor reinstate --subject ${by.actor} --actor <speaker> --ruling UPHELD|REVERSED`);
      reportCommit(rec);
      return EXIT.OK;
    }

    if (verb === 'reinstate') {
      if (values.subject === undefined || values.ruling === undefined) {
        err('actor reinstate: --subject and --ruling (UPHELD|REVERSED) are required'); return EXIT.USAGE;
      }
      const ruling = values.ruling.toUpperCase();
      if (ruling !== 'UPHELD' && ruling !== 'REVERSED') {
        err('actor reinstate: --ruling must be UPHELD or REVERSED'); return EXIT.USAGE;
      }
      const resolved = resolveDispute(nowStamp(), by.actor, ruling, values.subject, state, hansard);
      await writeHansard(dir, resolved.hansard);
      await writeState(dir, resolved.state);
      await logAct(dir, by.actor, by.role, `EXIT_RULING ${ruling} ${values.subject}`);
      const rec = await commitAct(dir, `EXIT_RULING — ${ruling} on ${values.subject}`);
      out(`DISPUTED EXIT ${ruling} — ${resolved.reinstated ? `${values.subject} reinstated` : 'the removal stands'}`);
      out('  the sitting resumes');
      reportCommit(rec);
      return EXIT.OK;
    }

    let result: { hansard: string } | null = null;
    let message = '';

    if (verb === 'hire') {
      if (values.subject === undefined || values.seat === undefined) {
        err('actor hire: --subject and --seat are required'); return EXIT.USAGE;
      }
      result = hire({ ...by, subject: values.subject, seat: values.seat as never, reason: values.reason ?? 'seated' }, hansard);
      message = `HIRED ${values.subject} as ${asRoleTerm(protocol, values.seat)}`;
    } else if (verb === 'promote' || verb === 'demote') {
      if (values.subject === undefined || values.to === undefined) {
        err(`actor ${verb}: --subject and --to are required`); return EXIT.USAGE;
      }
      const move = verb === 'promote' ? promote : demote;
      result = move({ ...by, subject: values.subject, to: values.to as never, reason: values.reason ?? '' }, hansard);
      message = `${verb.toUpperCase()}D ${values.subject} to ${asRoleTerm(protocol, values.to)}`;
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
      err(`actor: unknown verb "${verb ?? ''}" — expected hire | promote | demote | exit | veto | spawn | dispute | reinstate | list`);
      return EXIT.USAGE;
    }

    await writeHansard(dir, result.hansard);
    await logAct(dir, by.actor, by.role as never, message);
    const rec = await commitAct(dir, `${message} — by ${by.actor}`);
    out(message);
    reportCommit(rec);
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
  const { state, charter } = await loadSession(dir);
  if (state === null) { err(`escalate: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (charter !== null && !(await charterIsIntact(dir, charter.protocol))) return EXIT.REFUSED;
  if (values.actor === undefined || values.title === undefined || values.body === undefined) {
    err('escalate: --actor, --title and --body are required');
    return EXIT.USAGE;
  }
  if (badRole(values.role)) { err(`escalate: "${values.role}" is not a CANON role`); return EXIT.USAGE; }
  // A protocol that declares no escalation refuses a Point of Order outright
  // (ADR-0006) — there is no mechanism to resolve one.
  if (charter?.session.escalation === 'disabled') {
    err('escalate refused: this protocol declares no escalation — a Point of Order cannot be raised');
    return EXIT.REFUSED;
  }
  // A Point of Order suspends a live sitting; refuse from any other state so a
  // sealed (PROROGUED) session is never reopened and a pending ruling is never
  // clobbered. Mirrors division/assent.
  if (state.state !== 'CONVENED') {
    err(`escalate refused: cannot raise a Point of Order while the session is ${state.state}`);
    return EXIT.REFUSED;
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
    // The escalation-disabled case already returned above, so it cannot be
    // disabled here; fileEscalation's own guard covers non-CLI callers.
  }, hansard);

  await writeFiles(dir, filed.files);
  await writeHansard(dir, filed.hansard);
  await writeState(dir, filed.state);

  const { provider } = resolveProvider({ repo: values.repo, token: values.token });
  const opened = await projectEscalation(
    provider, `POINT OF ORDER — ${values.title}`, filed.notification,
  );
  const projMsg = await applyProjection(dir, `ESCALATION ${values.title}`, opened, filed.hansard);

  await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'OPERATOR') as never, `POINT_OF_ORDER ${values.title}`);
  // The Hansard cites the escalation file by path as the record; commit it, or
  // the substance of the Point of Order lives only in an untracked file.
  const rec = await commitAct(dir, `POINT_OF_ORDER — ${values.actor}: ${values.title}`, [filed.escalation_path]);
  out(`${asTerm(await sessionProtocol(charter?.protocol ?? 'parliamentary'), 'ESCALATION')} raised`);
  out(`  escalation  ${filed.escalation_path}`);
  out(`  ruling due  ${filed.ruling_path}`);
  out('  session is SUSPENDED pending a Speaker ruling');
  out(projMsg);
  reportCommit(rec);

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
  if (badRole(values.role)) { err(`rule: "${values.role}" is not a CANON role`); return EXIT.USAGE; }

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
    await writeState(dir, ruling.state);

    await logAct(dir, values.actor ?? 'RECORD', (values.role ?? 'AUTHORITY') as never,
      `RULING ${(values.outcome ?? 'UPHELD').toUpperCase()}`);
    // The Hansard cites the ruling file by path; commit it so the ruling's
    // reasoning is in the immutable record, not just an untracked file.
    const rec = await commitAct(dir, `RULING — ${(values.outcome ?? 'UPHELD').toUpperCase()}`, [ruling.ruling_path]);
    out(`RULING COMMITTED — ${(values.outcome ?? 'UPHELD').toUpperCase()}`);
    out(`  ${ruling.ruling_path}`);
    out(`  session is ${ruling.state.state} — the sitting resumes`);
    reportCommit(rec);
    return EXIT.OK;
  } catch (error) {
    err(`ruling refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};



/**
 * `politik conflict` — routine, not a governance event.
 *
 * Nothing here suspends the session or reaches for AUTHORITY: a merge conflict
 * is ordinary concurrent work, and treating it as a fault would train actors to
 * escalate things two Ministers can settle themselves.
 */
const cmdConflict = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      dir: { type: 'string' }, motions: { type: 'string' }, actor: { type: 'string' },
      role: { type: 'string' }, resolution: { type: 'string' }, verbs: { type: 'string' },
    },
  });

  const dir = values.dir ?? '.';
  const hansard = (await readIfPresent(join(dir, 'HANSARD.md'))) ?? '';

  if (verb === 'check') {
    // Motions are files under motions/; a conflict is an overlap in what the
    // Motions themselves touch, read from the record.
    const conflicts = detectRecordConflicts(hansard);

    if (conflicts.length === 0) {
      out('no conflicts');
    } else {
      // Accumulate every conflict entry into one document before writing — a
      // per-iteration `appendEntry(hansard, …)` against the original would keep
      // only the last conflict on the record.
      let doc = hansard;
      for (const c of conflicts) doc = appendEntry(doc, conflictEntry(c, nowStamp(), 'RECORD', 'OPERATOR'));
      await writeHansard(dir, doc);
      const rec = await commitAct(dir, `CONFLICT — ${conflicts.length} detected`);
      for (const c of conflicts) {
        out(`CONFLICT ${c.motions.join(' <-> ')}`);
        out(`  files ${c.files.join(', ')}`);
      }
      reportCommit(rec);
    }

    const open = openConflicts(hansard);
    if (open.length > 0) out(`  ${open.length} unresolved`);
    // A conflict is not a failure, so this never exits non-zero.
    return EXIT.OK;
  }

  if (verb === 'resolve') {
    if (values.motions === undefined || values.actor === undefined || values.resolution === undefined) {
      err('conflict resolve: --motions, --actor and --resolution are required');
      return EXIT.USAGE;
    }
    try {
      const result = resolveConflict({
        at: nowStamp(),
        actor: values.actor,
        role: (values.role ?? 'OPERATOR') as never,
        verbs: (values.verbs ?? 'READ,WRITE').split(',').map((v) => v.trim()) as never,
        motions: values.motions.split(',').map((m) => m.trim()).filter((m) => m.length > 0),
        resolution: values.resolution,
      }, hansard);

      await writeHansard(dir, result.hansard);
      const rec = await commitAct(dir, `CONFLICT_RESOLVED — ${values.motions}`);
      out(`CONFLICT RESOLVED — ${values.motions}`);
      out('  no Speaker intervention required');
      reportCommit(rec);
      return EXIT.OK;
    } catch (error) {
      err(`conflict refused: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT.REFUSED;
    }
  }

  err(`conflict: unknown verb "${verb ?? ''}" — expected check | resolve`);
  return EXIT.USAGE;
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
  // Opening the floor dispatches work to agents; only a live sitting may do so.
  // A sealed or suspended session must not be sending out fresh business.
  if (state.state !== 'CONVENED') {
    err(`broadcast refused: cannot open the floor while the session is ${state.state}`);
    return EXIT.REFUSED;
  }

  if (badRole(values.target)) { err(`broadcast: "${values.target}" is not a CANON role`); return EXIT.USAGE; }
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
  const rec = await commitAct(dir, `MOTION_PROJECTED — ${values.motion} -> #${pr}`);
  out(`LINKED ${values.motion} -> #${pr}`);
  reportCommit(rec);
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
  if (badRole(values.role)) { err(`run: "${values.role}" is not a CANON role`); return EXIT.USAGE; }
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

  const rec = await commitAct(
    dir,
    `${outcome.entry.type} — ${values.actor} (${values.role ?? 'OPERATOR'})`,
  );
  out('TURN COMPLETE');
  out(`  agent    ${outcome.result.agent}`);
  out(`  elapsed  ${outcome.result.elapsed_ms}ms`);
  out(`  files    ${outcome.files_touched.length > 0 ? outcome.files_touched.join(', ') : 'none'}`);
  out('  recorded in HANSARD.md');
  if (outcome.suspended === true) {
    out('  POINT OF ORDER — the agent escalated; the sitting is SUSPENDED pending a Speaker ruling');
  }
  reportCommit(rec);
  return EXIT.OK;
};

/**
 * Render a CANON entry type in the protocol's vocabulary. The stored type stays
 * CANON (the engine parses it); this is only for the human-facing `hansard` view.
 * Unknown types humanise gracefully rather than showing a raw token.
 */
const translateEntryType = (protocol: Protocol | null, type: string): string => {
  const t = (canon: string) => asTerm(protocol, canon);
  const map: Record<string, string> = {
    WRIT_DROP: 'Writ dropped',
    MOTION_TABLED: `${t('MOTION')} tabled`,
    MOTION_CARRIED: `${t('MOTION')} carried`,
    MOTION_REJECTED: `${t('MOTION')} rejected`,
    VOTE_CAST: `${t('VOTE')} cast`,
    DIVISION_CALLED: `${t('DIVISION')} called`,
    POINT_OF_ORDER: `${t('ESCALATION')} raised`,
    RULING: 'Ruling',
    ASSENT_GRANTED: `${t('ASSENT')} granted`,
    ACTOR_HIRED: 'Seated',
    ACTOR_EXITED: `${t('EXIT')}`,
    ACTOR_PROMOTED: `${t('PROMOTE')}`,
    ACTOR_DEMOTED: `${t('DEMOTE')}`,
    STATE_SNAPSHOT: 'Checkpoint',
    SESSION_TIMEOUT: `${t('DISSOLVE')}`,
  };
  return map[type] ?? type.toLowerCase().replace(/_/g, ' ');
};

/** `politik integrity` — read the record for bad-faith patterns (integrity.ts). */
const cmdIntegrity = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({ args: [...argv], options: { dir: { type: 'string' } } });
  const dir = values.dir ?? '.';
  const { state, hansard } = await loadSession(dir);
  if (state === null) { err(`integrity: ${dir} is not a session repo`); return EXIT.USAGE; }

  const findings = reviewIntegrity(hansard);
  if (findings.length === 0) {
    out('no bad-faith patterns detected — the record is clean');
    return EXIT.OK;
  }
  const vices = findings.filter((f) => f.kind === 'vice');
  const virtues = findings.filter((f) => f.kind === 'virtue');
  for (const f of vices) out(`  [${f.severity.toUpperCase()}] ${f.signature} — ${f.evidence}`);
  for (const f of virtues) out(`  [praise] ${f.signature} — ${f.evidence}`);
  out('');
  out(`${vices.length} vice finding(s), ${virtues.length} virtue(s). Surfaced to the Speaker; no action taken — the Speaker rules.`);
  // A high-severity vice exits non-zero so a watching Speaker/CI is alerted.
  return vices.some((f) => f.severity === 'high') ? EXIT.REFUSED : EXIT.OK;
};

/** `politik hansard` — the record, rendered in the protocol's vocabulary. */
const cmdHansard = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({ args: [...argv], options: { dir: { type: 'string' } } });
  const dir = values.dir ?? '.';
  const { state, hansard, charter } = await loadSession(dir);
  if (state === null) { err(`hansard: ${dir} is not a session repo`); return EXIT.USAGE; }

  const protocol = charter === null ? null : await sessionProtocol(charter.protocol);
  const entries = parseEntries(hansard);
  out(`RECORD — ${charter?.protocol ?? 'session'} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`);
  out('');
  for (const entry of entries) {
    out(`${entry.at}  ${translateEntryType(protocol, entry.type)}`);
    out(`  by ${entry.actor} (${asRoleTerm(protocol, entry.role)})`);
    const body = (entry.fields['Body'] ?? '').trim();
    if (body !== '') out(`  ${body}`);
  }
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
  if (badRole(values.role)) {
    err(`prorogue: "${values.role}" is not a CANON role`);
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

    await logAct(dir, values.actor, values.role as never, `PROROGUED ${trigger}`);
    await writeState(dir, result.state);
    await writeHansard(dir, result.hansard);
    await writeFiles(dir, result.files);
    // The seal is the one act that most needs to be in the immutable record —
    // "the Hansard is sealed" must be true on git, not just in the working tree.
    // Commit the record and the rendered summary the seal produces.
    const rec = await commitAct(dir, `PROROGUED — ${trigger}`, ['SUMMARY.md']);

    out('PROROGUED');
    out(`  trigger ${trigger}`);
    out('  the Hansard is sealed');
    if (result.milestone_to_close !== null) {
      out(`  milestone ${result.milestone_to_close} must be closed on the SCM`);
    }
    reportCommit(rec);
    return EXIT.OK;
  } catch (error) {
    err(`prorogue refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/**
 * `politik challenge` — a DELEGATE formally disputes an AUTHORITY action.
 *
 * Attribution, not obstruction (RUNTIME.md § DELEGATE Challenge Verb): the
 * AUTHORITY action stands, but the dissent is on the permanent record with a
 * name against it. Records; never suspends or overturns.
 */
const cmdChallenge = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, actor: { type: 'string' }, role: { type: 'string' },
      against: { type: 'string' }, grounds: { type: 'string' }, window: { type: 'string' },
    },
  });
  const dir = values.dir ?? '.';
  const { hansard, charter } = await loadSession(dir);
  if (charter === null) { err(`challenge: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (!(await charterIsIntact(dir, charter.protocol))) return EXIT.REFUSED;
  if (values.actor === undefined || values.against === undefined || values.grounds === undefined) {
    err('challenge: --actor, --against and --grounds are required'); return EXIT.USAGE;
  }
  if (badRole(values.role)) { err(`challenge: "${values.role}" is not a CANON role`); return EXIT.USAGE; }
  const windowMinutes = values.window === undefined ? 30 : Number(values.window);

  try {
    const result = challengeAction(nowStamp(), values.actor, (values.role ?? 'DELEGATE') as never,
      values.against, values.grounds, windowMinutes, hansard);
    await writeHansard(dir, result.hansard);
    await logAct(dir, values.actor, (values.role ?? 'DELEGATE') as never, `DELEGATE_CHALLENGE against ${values.against}`);
    const rec = await commitAct(dir, `DELEGATE_CHALLENGE — ${values.actor} vs ${values.against}`);
    out(`CHALLENGE recorded — ${values.actor} disputes ${values.against}`);
    out('  the AUTHORITY action stands; the dissent is permanent and attributable');
    reportCommit(rec);
    return EXIT.OK;
  } catch (error) {
    err(`challenge refused: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.REFUSED;
  }
};

/**
 * `politik standings` — score a competitive protocol from the record.
 *
 * A read over the Hansard (like `integrity`): who won the most divisions
 * (win-loss) or who lasted longest (survival). Neutral on protocol — a
 * parliamentary session simply shows how each actor's votes fared.
 */
const cmdStandings = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: { dir: { type: 'string' }, by: { type: 'string' } },
  });
  const dir = values.dir ?? '.';
  const { hansard, charter } = await loadSession(dir);
  if (charter === null) { err(`standings: ${dir} is not a session repo`); return EXIT.USAGE; }

  const by: RankBy = values.by === 'survival' ? 'survival' : 'win-loss';
  const table = standings(hansard, by);
  if (table.length === 0) { out('no standings — no actor has taken part yet'); return EXIT.OK; }

  const protocol = await sessionProtocol(charter.protocol);
  // Buchholz only means something once matches have been played; show it when
  // any actor has a non-zero strength of schedule.
  const showBuchholz = by === 'win-loss' && table.some((r) => r.buchholz > 0);
  out(`STANDINGS — by ${by}${showBuchholz ? ' (ties broken on Buchholz)' : ''}`);
  let rankNo = 0;
  for (const row of table) {
    rankNo += 1;
    const seat = row.seat === null
      ? (row.eliminated ? 'eliminated' : 'out')
      : asRoleTerm(protocol, row.seat);
    const buch = showBuchholz ? `  ·  B ${row.buchholz}` : '';
    out(`  ${String(rankNo).padStart(2)}. ${row.actor.padEnd(14)} ${row.wins}–${row.losses}${buch}  ·  ${seat}`);
  }
  return EXIT.OK;
};

/**
 * `politik pair` — generate the next round of MATCHes (ADR-0009).
 *
 * The field is the seated actors; the format decides who faces whom (swiss by
 * score, round-robin by unplayed pair, single-elim among the undefeated). A bye
 * is created already decided. The Speaker then reports each result with
 * `politik match report`.
 */
const cmdPair = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' }, format: { type: 'string' }, actor: { type: 'string' },
      round: { type: 'string' }, seed: { type: 'string' }, 'best-of': { type: 'string' },
    },
  });
  const dir = values.dir ?? '.';
  const { hansard, charter } = await loadSession(dir);
  if (charter === null) { err(`pair: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (!(await charterIsIntact(dir, charter.protocol))) return EXIT.REFUSED;
  if (!isPairingFormat(values.format)) {
    err('pair: --format must be swiss | round-robin | single-elim'); return EXIT.USAGE;
  }
  const bestOf = values['best-of'] === undefined ? 1 : Number(values['best-of']);
  if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf % 2 === 0) {
    err('pair: --best-of must be a positive odd integer (1, 3, 5, …) — no draws'); return EXIT.USAGE;
  }
  const seed = (values.seed ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);

  const contestants = seats(hansard).map((s) => s.actor);
  if (contestants.length < 2) { err('pair: fewer than two contestants are seated'); return EXIT.REFUSED; }
  const played = matches(hansard);
  const round = values.round !== undefined
    ? Number(values.round)
    : Math.max(0, ...played.map((m) => m.round)) + 1;

  const pairings = pairRound(contestants, standings(hansard), values.format, round, played, seed);
  if (pairings.length === 0) {
    out(`no pairings for round ${round} — the ${values.format} field is decided`);
    return EXIT.OK;
  }

  let doc = hansard;
  for (const pairing of pairings) {
    const created = matchCreatedEntry(pairing, round, nowStamp(), bestOf);
    doc = appendEntry(doc, created);
    if (pairing.b === null) {
      // A bye advances unopposed — record it decided so standings count it.
      doc = appendEntry(doc, matchDecidedEntry(
        created.fields?.['Match'] ?? '', round, pairing.a, null, nowStamp(), values.actor ?? 'RECORD'));
    }
  }
  await writeHansard(dir, doc);
  await logAct(dir, values.actor ?? 'RECORD', 'OPERATOR' as never, `PAIRED round ${round} (${values.format})`);
  const rec = await commitAct(dir, `MATCH_PAIRING — round ${round} (${values.format})`);
  const suffix = bestOf > 1 ? `, best of ${bestOf}` : '';
  const seededNote = seed.length > 0 && played.length === 0 ? ', seeded' : '';
  out(`ROUND ${round} — ${values.format}${suffix}${seededNote}`);
  for (const pairing of pairings) out(`  ${pairing.a} vs ${pairing.b ?? 'BYE'}`);
  out(bestOf > 1
    ? `  report each game: politik match report --match <id> --winner <contestant> (first to ${Math.floor(bestOf / 2) + 1})`
    : '  report each result: politik match report --match <id> --winner <contestant>');
  reportCommit(rec);
  return EXIT.OK;
};

/** `politik match report|list` — resolve or view MATCHes (ADR-0009). */
const cmdMatch = async (argv: readonly string[]): Promise<number> => {
  const [verb, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: { dir: { type: 'string' }, match: { type: 'string' }, winner: { type: 'string' }, actor: { type: 'string' } },
  });
  const dir = values.dir ?? '.';
  const { hansard, charter } = await loadSession(dir);
  if (charter === null) { err(`match: ${dir} is not a session repo`); return EXIT.USAGE; }
  if (verb !== 'list' && !(await charterIsIntact(dir, charter.protocol))) {
    return EXIT.REFUSED;
  }

  if (verb === 'list') {
    const all = matches(hansard);
    if (all.length === 0) { out('no matches yet — pair a round first'); return EXIT.OK; }
    for (const m of all) {
      const status = m.winner === null ? 'open' : `${m.winner} won`;
      const tally = m.best_of > 1 ? `  (best of ${m.best_of}: ${m.games.a}–${m.games.b})` : '';
      out(`  [${status.padEnd(12)}] ${m.id}  ·  ${m.a} vs ${m.b ?? 'bye'}${tally}`);
    }
    return EXIT.OK;
  }

  if (verb === 'report') {
    if (values.match === undefined || values.winner === undefined) {
      err('match report: --match and --winner are required'); return EXIT.USAGE;
    }
    try {
      const result = reportMatch(values.match, values.winner, nowStamp(), values.actor ?? 'RECORD', hansard);
      await writeHansard(dir, result.hansard);
      const kind = result.decided ? 'MATCH_DECIDED' : 'MATCH_GAME';
      await logAct(dir, values.actor ?? 'RECORD', 'AUTHORITY' as never, `${kind} ${values.match} -> ${values.winner}`);
      const rec = await commitAct(dir, `${kind} — ${values.match}: ${values.winner}`);
      if (result.decided) {
        const score = result.games.a + result.games.b > 0
          ? ` (${result.games.a}–${result.games.b})` : '';
        out(`MATCH ${values.match} — ${values.winner} won${score}`);
      } else {
        out(`GAME to ${values.winner} — ${values.match} stands at ${result.games.a}–${result.games.b}`);
      }
      reportCommit(rec);
      return EXIT.OK;
    } catch (error) {
      err(`match refused: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT.REFUSED;
    }
  }

  err(`match: unknown verb "${verb ?? ''}" — expected report | list`);
  return EXIT.USAGE;
};

/** A one-glance mark for a node's state — colour-free, terminal-safe. */
const stateMark = (state: string): string => {
  switch (state) {
    case 'CONVENED': return '[OK]';
    case 'SUSPENDED': return '[!!]';
    case 'PROROGUED': return '[--]';
    case 'STALE': return '[~~]';
    case 'INVALID': return '[XX]';
    default: return '[??]';
  }
};

/**
 * `politik registry` — the state of everything. Walks the tree (ADR-0008
 * federation-as-traversal), prints every session with its state, protocol and
 * cost, and a roll-up. `--state <S>` answers "show all SUSPENDED under here"; the
 * roll-up always totals the whole tree so the filter never hides the context.
 */
const cmdRegistry = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({
    args: [...argv],
    options: { dir: { type: 'string' }, state: { type: 'string' } },
  });
  const root = resolve(values.dir ?? '.');
  const nodes = await discoverTree(root);
  if (nodes.length === 0) {
    err(`registry: no sessions found under ${values.dir ?? '.'}`);
    return EXIT.USAGE;
  }

  const filter = values.state?.toUpperCase();
  const shown: readonly FederationNode[] = filter === undefined
    ? nodes
    : nodes.filter((n) => n.state === filter);

  out(`REGISTRY — ${values.dir ?? '.'}`);
  for (const node of shown) {
    const indent = '  '.repeat(node.depth + 1);
    const cost = node.cost_usd > 0 ? `  $${node.cost_usd.toFixed(4)}` : '';
    const cause = node.cause === null ? '' : `  (${node.cause})`;
    out(`${indent}${stateMark(node.state)} ${node.rel}  ·  ${node.protocol}  ·  ${node.state}${cost}${cause}`);
  }
  if (filter !== undefined && shown.length === 0) out(`  (no ${filter} sessions)`);

  const summary = rollUp(nodes);
  out('');
  out('  -- roll-up (whole tree) --');
  out(`  nodes         ${summary.nodes}`);
  out(`  by state      ${Object.entries(summary.by_state).map(([s, c]) => `${s} ${c}`).join('   ')}`);
  out(`  open motions  ${summary.open_divisions}`);
  out(`  total cost    $${summary.total_cost_usd.toFixed(4)}`);
  out(`  total tokens  ${summary.total_tokens.toLocaleString()}`);
  return EXIT.OK;
};

/**
 * `politik cascade` — a fault repeating across siblings is a signal, not a
 * coincidence. Walks the tree, and where enough siblings share a suspension
 * cause within the window (tree.ts checkCascade), records a CASCADE_ALERT on
 * their parent so a Speaker chartering the same configuration is warned. Idempotent:
 * a parent already carrying the alert is left alone.
 */
const cmdCascade = async (argv: readonly string[]): Promise<number> => {
  const { values } = parseArgs({ args: [...argv], options: { dir: { type: 'string' } } });
  const root = resolve(values.dir ?? '.');
  const nodes = await discoverTree(root);
  const findings = detectCascades(nodes, nowStamp());
  if (findings.length === 0) {
    out('no cascades — no fault repeats across siblings within the window');
    return EXIT.OK;
  }

  for (const finding of findings) {
    const signature = finding.alert.signature ?? 'unknown';
    if (cascadeAlerts(finding.parent.hansard).includes(signature)) {
      out(`${finding.parent.rel}: cascade on ${signature} already recorded`);
      continue;
    }
    const updated = recordOnNode(finding.parent.hansard, cascadeEntry(finding.alert, nowStamp()));
    await writeHansard(finding.parent.dir, updated);
    const rec = await commitAct(finding.parent.dir,
      `CASCADE_ALERT — ${signature} across ${finding.alert.nodes.length} siblings`);
    out(`CASCADE — ${signature} across ${finding.alert.nodes.length} siblings`);
    out(`  recorded on ${finding.parent.rel}`);
    reportCommit(rec);
  }
  return EXIT.OK;
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
    case 'conflict':
      return cmdConflict(rest);
    case 'broadcast':
      return cmdBroadcast(rest);
    case 'motion':
      return cmdMotion(rest);
    case 'ledger':
      return cmdLedger(rest);
    case 'run':
      return cmdRun(rest);
    case 'hansard':
      return cmdHansard(rest);
    case 'integrity':
      return cmdIntegrity(rest);
    case 'status':
      return cmdStatus(rest);
    case 'prorogue':
      return cmdProrogue(rest);
    case 'registry':
      return cmdRegistry(rest);
    case 'cascade':
      return cmdCascade(rest);
    case 'challenge':
      return cmdChallenge(rest);
    case 'standings':
      return cmdStandings(rest);
    case 'pair':
      return cmdPair(rest);
    case 'match':
      return cmdMatch(rest);
    default:
      err(`unknown command: ${command}`);
      err(USAGE);
      return EXIT.USAGE;
  }
};
