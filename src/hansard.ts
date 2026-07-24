/**
 * Hansard commit writer.
 *
 * HANSARD.md is the append-only attributed record of a proceeding
 * (POLITIK-ARCHITECTURE.md § FILE OWNERSHIP: "Append only, never edited").
 * The RECORD agent writes it; no actor edits an entry once committed.
 *
 * ## On the format
 *
 * The format is fixed by ADR-0005. Entries are H2 under the document's H1 title
 * (ruling 1), headed `## <ISO-8601 UTC> — <RECORD_TYPE>` (ruling 2). Record
 * types are an open string set, always written in CANON and never translated
 * into protocol vocabulary (ruling 3). Attribution is mandatory (ruling 4).
 * Fields are single-line; prose goes in the body (ruling 5). Append-only is
 * mechanical: a new document must contain the old one verbatim as a prefix
 * (ruling 6). Reading back is best-effort and never authoritative — git history
 * is (ruling 7).
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Record types                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Record types named in the source documents. Not exhaustive and not a closed
 * enum — `HansardEntry.type` accepts any string so a protocol may record events
 * these documents never anticipated.
 */
export const RECORD_TYPES = {
  WRIT_DROP: 'WRIT_DROP',
  SESSION_INVALID: 'SESSION_INVALID',
  SESSION_FAULT: 'SESSION_FAULT',
  SESSION_FAULT_CRITICAL: 'SESSION_FAULT_CRITICAL',
  FAULT_RESOLVED: 'FAULT_RESOLVED',
  FAULT_RESOLVED_AUTO: 'FAULT_RESOLVED_AUTO',
  ACTOR_STATE: 'ACTOR_STATE',
} as const;

export type RecordType = string;

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

export interface HansardEntry {
  /** Record type, e.g. WRIT_DROP. Rendered as the entry heading. */
  readonly type: RecordType;
  /** ISO-8601 UTC. Supplied by the caller — this module reads no clock. */
  readonly at: string;
  /** Acting actor's handle. Attribution is not optional in a Hansard. */
  readonly actor: string;
  /** The actor's CANON role at the time of the act. */
  readonly role: Role;
  /** Bold-label fields, rendered in insertion order. */
  readonly fields?: Readonly<Record<string, string>>;
  /** Free prose appended after the fields. */
  readonly body?: string;
}

/** Thrown when an entry cannot be attributed. An unattributed record is not a Hansard record. */
export class HansardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HansardError';
  }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

const escapeField = (value: string): string => value.replace(/\r?\n/g, ' ').trim();

/**
 * Render one entry.
 *
 * Multi-line field values are collapsed to a single line: a field that spans
 * lines would be indistinguishable from the prose body when the file is read
 * back, and the Hansard's value depends on being unambiguously parseable.
 * Long-form content belongs in `body`.
 */
export const renderEntry = (entry: HansardEntry): string => {
  if (entry.actor.trim() === '') {
    throw new HansardError('Hansard entry requires an actor — records are attributed');
  }
  if (entry.type.trim() === '') {
    throw new HansardError('Hansard entry requires a record type');
  }
  if (entry.at.trim() === '') {
    throw new HansardError('Hansard entry requires a timestamp');
  }

  const lines = [
    `## ${entry.at} — ${entry.type}`,
    '',
    `**Actor:** ${entry.actor} (${entry.role})`,
  ];

  for (const [key, value] of Object.entries(entry.fields ?? {})) {
    lines.push(`**${key}:** ${escapeField(value)}`);
  }

  if (entry.body !== undefined && entry.body.trim() !== '') {
    lines.push('', entry.body.trim());
  }

  lines.push('');
  return lines.join('\n');
};

/* -------------------------------------------------------------------------- */
/* Append                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Append an entry to a Hansard document.
 *
 * Pure: takes the current document, returns the new one. The caller commits it
 * through an ScmProvider. Existing content is never rewritten — the returned
 * document always starts with the input verbatim, which is the append-only
 * guarantee made mechanical.
 */
export const appendEntry = (document: string, entry: HansardEntry): string => {
  const base = document.endsWith('\n') || document === '' ? document : `${document}\n`;
  return `${base}\n${renderEntry(entry)}`;
};

/** Append several entries in order. */
export const appendEntries = (
  document: string,
  entries: readonly HansardEntry[],
): string => entries.reduce(appendEntry, document);

/* -------------------------------------------------------------------------- */
/* Reading back                                                                */
/* -------------------------------------------------------------------------- */

export interface ParsedEntry {
  readonly type: string;
  readonly at: string;
  readonly actor: string;
  readonly role: string;
  readonly fields: Readonly<Record<string, string>>;
}

const ENTRY_HEADING = /^##\s+(\S+)\s+—\s+(.+?)\s*$/;
const FIELD_LINE = /^\*\*(.+?):\*\*\s*(.*)$/;
const ACTOR_VALUE = /^(.*?)\s*\(([A-Z]+)\)\s*$/;

/**
 * Read entries back out of a Hansard document.
 *
 * Provided so the record can be audited and so tests can assert what was
 * written. Best-effort: a document that predates this writer, or that a future
 * Phase 4 spec reshapes, may parse partially. Reading is never authoritative —
 * git history is.
 */
export const parseEntries = (document: string): readonly ParsedEntry[] => {
  const entries: ParsedEntry[] = [];
  const lines = document.replace(/\r\n/g, '\n').split('\n');

  let current: { at: string; type: string; fields: Record<string, string> } | null = null;

  const flush = () => {
    if (current === null) return;
    const actorRaw = current.fields['Actor'] ?? '';
    const match = ACTOR_VALUE.exec(actorRaw);
    const { Actor: _actor, ...rest } = current.fields;
    entries.push({
      type: current.type,
      at: current.at,
      actor: (match?.[1] ?? actorRaw).trim(),
      role: match?.[2] ?? '',
      fields: rest,
    });
    current = null;
  };

  for (const line of lines) {
    const heading = ENTRY_HEADING.exec(line);
    if (heading) {
      flush();
      current = { at: heading[1] ?? '', type: heading[2] ?? '', fields: {} };
      continue;
    }
    if (current === null) continue;
    const field = FIELD_LINE.exec(line);
    if (field) current.fields[field[1] ?? ''] = (field[2] ?? '').trim();
  }
  flush();

  return entries;
};

/** The most recent entry, or null for an empty Hansard. */
export const lastEntry = (document: string): ParsedEntry | null =>
  parseEntries(document).at(-1) ?? null;
