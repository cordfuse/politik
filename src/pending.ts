/**
 * Pending acts — the Speaker's confirmation (ADR-0010 §2).
 *
 * Under `speaker_confirmation: required`, a constitutional act (assent, rule,
 * prorogue) requested by an AI harness or a script is not executed. It is staged
 * here, and only `politik confirm <id>`, run by the Speaker at a terminal,
 * executes it. Nothing staged ever reaches the record: these files live under
 * `.politik/pending/`, which no governance commit stages, and are deleted once
 * confirmed or rejected.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deletePendingRef, readPendingRefs, syncConfig, writePendingRef } from './remote.ts';

/** The acts that exercise the Speaker's constitutional authority. */
export const CONSTITUTIONAL_ACTS = ['assent', 'rule', 'prorogue'] as const;
export type ConstitutionalAct = (typeof CONSTITUTIONAL_ACTS)[number];

export const isConstitutionalAct = (name: string): name is ConstitutionalAct =>
  (CONSTITUTIONAL_ACTS as readonly string[]).includes(name);

export interface PendingAct {
  /** Short id the Speaker types to confirm, e.g. `assent-3f9a2c`. */
  readonly id: string;
  readonly act: ConstitutionalAct;
  /** The exact arguments, replayed verbatim by `politik confirm`. */
  readonly argv: readonly string[];
  /** One plain-language line describing the effect. */
  readonly summary: string;
  /** Who asked: a harness name, or `script`. Recorded as the provenance trailer. */
  readonly requested_via: string;
  readonly requested_at: string;
}

/** Where a session's staged acts live. Never committed. */
export const pendingDir = (sessionDir: string): string => join(sessionDir, '.politik', 'pending');

/** The session's GUID, which namespaces its shared pending refs (ADR-0011 §4). */
const sessionGuid = async (sessionDir: string): Promise<string | null> => {
  try {
    const raw = JSON.parse(await readFile(join(sessionDir, 'STATE.json'), 'utf8')) as { session_guid?: unknown };
    return typeof raw.session_guid === 'string' && /^[A-Za-z0-9._-]+$/.test(raw.session_guid) ? raw.session_guid : null;
  } catch {
    return null;
  }
};

const ID_PATTERN = /^[a-z]+-[0-9a-f]{6}$/;

/** True for a well-formed pending id — guards against path traversal on confirm/reject. */
export const isPendingId = (id: string): boolean => ID_PATTERN.test(id);

const newId = (act: ConstitutionalAct): string => `${act}-${randomBytes(3).toString('hex')}`;

/**
 * Stage an act. In a shared session (ADR-0011) it is pushed as a pending ref so
 * the Speaker sees it from any machine; throws if it cannot be shared, so an act
 * is never staged where the Speaker cannot reach it. Otherwise it is written
 * atomically to `.politik/pending/`.
 */
export const stagePending = async (
  sessionDir: string,
  input: Omit<PendingAct, 'id'>,
): Promise<PendingAct> => {
  const cfg = await syncConfig(sessionDir);
  if (cfg !== null) {
    const guid = await sessionGuid(sessionDir);
    if (guid === null) throw new Error('cannot share a pending act: STATE.json has no session GUID');
    const pending: PendingAct = { id: newId(input.act), ...input };
    const shared = await writePendingRef(sessionDir, cfg, guid, pending.id, `${JSON.stringify(pending, null, 2)}\n`);
    if (!shared.ok) throw new Error(`could not share the pending act with ${cfg.remote}: ${shared.reason}`);
    return pending;
  }
  const dir = pendingDir(sessionDir);
  await mkdir(dir, { recursive: true });
  // Ignore the folder's own contents, including this file, so a staged act never
  // shows as untracked work or gets swept into a commit by a broad `git add`.
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) await writeFile(ignore, '*\n', 'utf8');
  const pending: PendingAct = { id: newId(input.act), ...input };
  const path = join(dir, `${pending.id}.json`);
  await writeFile(`${path}.tmp`, `${JSON.stringify(pending, null, 2)}\n`, 'utf8');
  await rename(`${path}.tmp`, path);
  return pending;
};

const parsePending = (raw: string): PendingAct | null => {
  try {
    const v = JSON.parse(raw) as Partial<PendingAct>;
    if (typeof v.id !== 'string' || !isPendingId(v.id)) return null;
    if (typeof v.act !== 'string' || !isConstitutionalAct(v.act)) return null;
    if (!Array.isArray(v.argv) || !v.argv.every((a) => typeof a === 'string')) return null;
    return {
      id: v.id,
      act: v.act,
      argv: v.argv,
      summary: typeof v.summary === 'string' ? v.summary : '',
      requested_via: typeof v.requested_via === 'string' ? v.requested_via : 'unknown',
      requested_at: typeof v.requested_at === 'string' ? v.requested_at : '',
    };
  } catch {
    return null;
  }
};

/** Every well-formed staged act, oldest first. Shared sessions read the pending refs. */
export const listPending = async (sessionDir: string): Promise<readonly PendingAct[]> => {
  if ((await syncConfig(sessionDir)) !== null) {
    const guid = await sessionGuid(sessionDir);
    if (guid === null) return [];
    return (await readPendingRefs(sessionDir, guid))
      .map(parsePending)
      .filter((a): a is PendingAct => a !== null)
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  }
  const dir = pendingDir(sessionDir);
  if (!existsSync(dir)) return [];
  const acts: PendingAct[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    const act = parsePending(await readFile(join(dir, file), 'utf8'));
    if (act !== null) acts.push(act);
  }
  return acts.sort((a, b) => a.requested_at.localeCompare(b.requested_at));
};

export const readPending = async (sessionDir: string, id: string): Promise<PendingAct | null> => {
  if (!isPendingId(id)) return null;
  if ((await syncConfig(sessionDir)) !== null) {
    return (await listPending(sessionDir)).find((a) => a.id === id) ?? null;
  }
  const path = join(pendingDir(sessionDir), `${id}.json`);
  if (!existsSync(path)) return null;
  return parsePending(await readFile(path, 'utf8'));
};

export const removePending = async (sessionDir: string, id: string): Promise<void> => {
  if (!isPendingId(id)) return;
  const cfg = await syncConfig(sessionDir);
  if (cfg !== null) {
    const guid = await sessionGuid(sessionDir);
    if (guid !== null) await deletePendingRef(sessionDir, cfg, guid, id);
    return;
  }
  await rm(join(pendingDir(sessionDir), `${id}.json`), { force: true });
};

/**
 * The argv with any `--dir` value replaced, so a staged act replays against the
 * session it was staged in even when `confirm` runs from another working
 * directory.
 */
export const withDir = (argv: readonly string[], dir: string): readonly string[] => {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a === '--dir') { i += 1; continue; }
    if (a.startsWith('--dir=')) continue;
    out.push(a);
  }
  return ['--dir', dir, ...out];
};
