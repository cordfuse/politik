/**
 * Broadcast envelope — parser and serializer.
 *
 * The self-describing motion packet that travels the transport
 * (POLITIK-ARCHITECTURE.md § BROADCAST ENVELOPE):
 *
 *     # [SESSION-GUID]
 *     ## target-actor: OPERATOR
 *     ## slots-remaining: 3
 *     ## protocol: parliamentary
 *     ## prompt: |
 *       Review the authentication refactor in motion-003
 *       and file your assessment as a PR review.
 *
 * The format is markdown with heading-keys, not YAML — an H1 carrying the
 * session GUID, then `## key: value` lines, with `|` introducing an indented
 * block scalar. This module implements that shape and nothing more.
 *
 * The envelope is an *ephemeral nudge*. Transport may drop it with no loss:
 * the Hansard in the session repo is the durable, ordered truth, and peers
 * fall back to reading the repo. Nothing here is authoritative.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { isRole, type Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface Envelope {
  /** Session GUID from the H1. Identifies which proceeding this belongs to. */
  readonly session_guid: string;
  /** Constituency the broadcast addresses. */
  readonly target_actor: Role;
  /** Remaining slots. An agent stands down at zero. */
  readonly slots_remaining: number;
  /** Protocol name, for the agent's vocabulary translation. */
  readonly protocol: string;
  /** The instruction the spawned agent executes. */
  readonly prompt: string;
  /**
   * Any `## key: value` the spec does not name, preserved verbatim.
   * The architecture shows four fields but does not declare the set closed, so
   * unknown keys are carried rather than dropped or rejected.
   */
  readonly extensions: Readonly<Record<string, string>>;
}

export interface EnvelopeIssue {
  readonly field: string;
  readonly message: string;
}

export type EnvelopeParseResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly issues: readonly EnvelopeIssue[] };

/* -------------------------------------------------------------------------- */
/* Parse                                                                       */
/* -------------------------------------------------------------------------- */

const H1 = /^#\s+(?:\[(.+?)\]|(\S.*?))\s*$/;
const FIELD = /^##\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/;

/** Canonical field keys, normalised from the hyphenated wire form. */
const normalise = (key: string): string => key.toLowerCase().replace(/-/g, '_');

/**
 * Parse a broadcast envelope.
 *
 * Block scalars (`key: |`) consume every subsequent line more indented than the
 * `##` marker, stopping at the next field or heading. Common indentation is
 * stripped so the prompt reads as written.
 */
export const parseEnvelope = (source: string): EnvelopeParseResult => {
  const issues: EnvelopeIssue[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  let guid = '';
  const fields = new Map<string, string>();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (guid === '' && H1.test(line)) {
      const match = H1.exec(line);
      guid = (match?.[1] ?? match?.[2] ?? '').trim();
      continue;
    }

    const field = FIELD.exec(line);
    if (!field) continue;

    const key = normalise(field[1] ?? '');
    const inline = (field[2] ?? '').trim();

    if (inline !== '|') {
      fields.set(key, inline);
      continue;
    }

    // Block scalar: gather following lines until the next field or heading.
    const block: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const next = lines[j] ?? '';
      if (FIELD.test(next) || H1.test(next)) break;
      if (next.trim() === '' && block.length === 0) continue;
      block.push(next);
    }
    while (block.length > 0 && (block.at(-1) ?? '').trim() === '') block.pop();

    const indents = block
      .filter((l) => l.trim() !== '')
      .map((l) => (/^(\s*)/.exec(l)?.[1] ?? '').length);
    const strip = indents.length > 0 ? Math.min(...indents) : 0;

    fields.set(key, block.map((l) => l.slice(strip)).join('\n'));
    i = j - 1;
  }

  if (guid === '') {
    issues.push({
      field: 'session_guid',
      message: 'envelope must open with an H1 carrying the session GUID',
    });
  }

  const target = fields.get('target_actor') ?? '';
  if (target === '') {
    issues.push({ field: 'target_actor', message: 'required' });
  } else if (!isRole(target)) {
    issues.push({
      field: 'target_actor',
      message: `not a CANON role: ${target}`,
    });
  }

  const slotsRaw = fields.get('slots_remaining') ?? '';
  const slots = Number(slotsRaw);
  if (slotsRaw === '') {
    issues.push({ field: 'slots_remaining', message: 'required' });
  } else if (!Number.isInteger(slots) || slots < 0) {
    issues.push({
      field: 'slots_remaining',
      message: `must be a non-negative integer, got "${slotsRaw}"`,
    });
  }

  const protocol = fields.get('protocol') ?? '';
  if (protocol === '') issues.push({ field: 'protocol', message: 'required' });

  const prompt = fields.get('prompt') ?? '';
  if (prompt.trim() === '') issues.push({ field: 'prompt', message: 'required' });

  if (issues.length > 0) return { ok: false, issues };

  const known = new Set(['target_actor', 'slots_remaining', 'protocol', 'prompt']);
  const extensions: Record<string, string> = {};
  for (const [key, value] of fields) {
    if (!known.has(key)) extensions[key] = value;
  }

  return {
    ok: true,
    envelope: {
      session_guid: guid,
      target_actor: target as Role,
      slots_remaining: slots,
      protocol,
      prompt,
      extensions,
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Serialize                                                                   */
/* -------------------------------------------------------------------------- */

/** Render an envelope in the wire format. Round-trips with `parseEnvelope`. */
export const serializeEnvelope = (envelope: Envelope): string => {
  const lines = [
    `# [${envelope.session_guid}]`,
    `## target-actor: ${envelope.target_actor}`,
    `## slots-remaining: ${envelope.slots_remaining}`,
    `## protocol: ${envelope.protocol}`,
  ];

  for (const [key, value] of Object.entries(envelope.extensions)) {
    lines.push(`## ${key.replace(/_/g, '-')}: ${value}`);
  }

  lines.push('## prompt: |');
  for (const line of envelope.prompt.split('\n')) {
    lines.push(line === '' ? '' : `  ${line}`);
  }

  return `${lines.join('\n')}\n`;
};

/* -------------------------------------------------------------------------- */
/* Self-organization                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Steps 2 and 3 of the Self-Organization Protocol: does this agent match the
 * target constituency, and are slots available?
 *
 * A true result only makes the agent *eligible*. The slot is not held until it
 * is claimed atomically via a Hansard commit (step 5) — this function performs
 * no claim and grants no exclusivity.
 */
export const isEligible = (envelope: Envelope, actorRole: Role): boolean =>
  envelope.target_actor === actorRole && envelope.slots_remaining > 0;

/** Decrement the slot count after a claim is committed (step 7). */
export const claimSlot = (envelope: Envelope): Envelope => ({
  ...envelope,
  slots_remaining: Math.max(0, envelope.slots_remaining - 1),
});
