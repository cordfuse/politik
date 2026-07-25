/**
 * LEDGER — the secretarial cost record.
 *
 * The Hansard says what was decided. The LEDGER says what it cost. Together
 * they are the claim that Politik replaces a ticket system: exact measured
 * elapsed time, tokens and dollars per governance act, as a side effect of
 * running the session rather than as something anyone maintains.
 *
 * That claim only holds if the numbers are real. This module therefore records
 * **measured** usage where an agent reports it and says `unmeasured` where it
 * does not — never an estimate dressed as a measurement. A ledger with invented
 * numbers is worse than no ledger, because it is trusted.
 *
 * Append-only, like the Hansard: `LEDGER.md → Clerk appends after every motion,
 * never edited` (POLITIK-ARCHITECTURE.md § File Sovereignty Rules).
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import type { Role } from './canon.ts';

/* -------------------------------------------------------------------------- */
/* Usage                                                                       */
/* -------------------------------------------------------------------------- */

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  /** Exact cost as reported by the agent. Null when the agent does not report. */
  readonly cost_usd: number | null;
  /** Model that did the work, when reported. */
  readonly model: string | null;
}

export const ZERO_USAGE: Usage = Object.freeze({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cost_usd: null,
  model: null,
});

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Extract usage from an agent's structured output.
 *
 * Shapes are per-agent and deliberately narrow. An agent whose output does not
 * match returns null rather than a zero-filled Usage, so "no data" stays
 * distinguishable from "measured zero" — a distinction the whole point of this
 * module depends on.
 */
export const parseUsage = (agentId: string, stdout: string): Usage | null => {
  const trimmed = stdout.trim();
  if (trimmed === '') return null;

  // JSONL agents emit a stream of events; the usage arrives in one of them.
  if (agentId === 'opencode') return parseOpencode(trimmed);
  if (agentId === 'codex-cli') return parseCodex(trimmed);

  if (!trimmed.startsWith('{')) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const doc = raw as Record<string, unknown>;

  // Gemini and Qwen share a CLI lineage and a stats shape: per-model token
  // counts, no cost. Recording tokens with `cost_usd: null` is the honest
  // result — the vendor does not report spend, and inventing a price from a
  // rate card would be an estimate dressed as a measurement.
  if (agentId === 'gemini-cli' || agentId === 'qwen-code') {
    const stats = (doc['stats'] ?? {}) as Record<string, unknown>;
    const models = (stats['models'] ?? {}) as Record<string, unknown>;
    const name = Object.keys(models)[0];
    if (name === undefined) return null;
    const t = ((models[name] as Record<string, unknown>)['tokens'] ?? {}) as Record<string, unknown>;
    return {
      input_tokens: num(t['input']),
      output_tokens: num(t['candidates']),
      cache_read_tokens: num(t['cached']),
      cache_creation_tokens: 0,
      cost_usd: null,
      model: name,
    };
  }

  if (agentId === 'claude-code') {
    const usage = (doc['usage'] ?? {}) as Record<string, unknown>;
    const models = Object.keys((doc['modelUsage'] ?? {}) as Record<string, unknown>);
    return {
      input_tokens: num(usage['input_tokens']),
      output_tokens: num(usage['output_tokens']),
      cache_read_tokens: num(usage['cache_read_input_tokens']),
      cache_creation_tokens: num(usage['cache_creation_input_tokens']),
      cost_usd: typeof doc['total_cost_usd'] === 'number' ? doc['total_cost_usd'] : null,
      model: models[0] ?? null,
    };
  }

  return null;
};

/**
 * OpenCode emits JSONL events; usage rides on the ones carrying `tokens`.
 * Later events win — the last report of a turn is its total.
 */
const parseOpencode = (stdout: string): Usage | null => {
  let tokens: Record<string, unknown> | null = null;
  let cost: number | null = null;
  let model: string | null = null;

  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const scope of [doc, (doc['part'] ?? {}) as Record<string, unknown>]) {
      if (typeof scope['tokens'] === 'object' && scope['tokens'] !== null) {
        tokens = scope['tokens'] as Record<string, unknown>;
      }
      if (typeof scope['cost'] === 'number') cost = scope['cost'];
      if (typeof scope['modelID'] === 'string') model = scope['modelID'];
    }
  }

  if (tokens === null) return null;
  const cache = (tokens['cache'] ?? {}) as Record<string, unknown>;
  return {
    input_tokens: num(tokens['input']),
    output_tokens: num(tokens['output']),
    cache_read_tokens: num(cache['read']),
    cache_creation_tokens: num(cache['write']),
    cost_usd: cost,
    model,
  };
};

/** Codex emits JSONL; `turn.completed` carries the usage. */
const parseCodex = (stdout: string): Usage | null => {
  for (const line of stdout.split('\n').reverse()) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    const usage = doc['usage'];
    if (typeof usage !== 'object' || usage === null) continue;
    const u = usage as Record<string, unknown>;
    return {
      input_tokens: num(u['input_tokens']),
      output_tokens: num(u['output_tokens']),
      cache_read_tokens: num(u['cached_input_tokens']),
      cache_creation_tokens: 0,
      cost_usd: null,
      model: null,
    };
  }
  return null;
};

/** The agent's actual answer, pulled out of structured output. */
export const parseResultText = (agentId: string, stdout: string): string | null => {
  const trimmed = stdout.trim();
  if (trimmed === '') return null;

  // JSONL agents: the answer is assembled from text events rather than carried
  // in one field.
  if (agentId === 'opencode' || agentId === 'codex-cli') {
    const parts: string[] = [];
    for (const line of trimmed.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('{')) continue;
      try {
        const doc = JSON.parse(t) as Record<string, unknown>;
        const part = (doc['part'] ?? {}) as Record<string, unknown>;
        if (doc['type'] === 'text' && typeof part['text'] === 'string') parts.push(part['text']);
        const item = (doc['item'] ?? {}) as Record<string, unknown>;
        if (typeof item['text'] === 'string') parts.push(item['text']);
      } catch {
        continue;
      }
    }
    return parts.length > 0 ? parts.join('').trim() : null;
  }

  if (!trimmed.startsWith('{')) return null;
  try {
    const doc = JSON.parse(trimmed) as Record<string, unknown>;
    if (agentId === 'claude-code' && typeof doc['result'] === 'string') {
      return doc['result'];
    }
    // Gemini and Qwen carry the answer in `response`.
    if ((agentId === 'gemini-cli' || agentId === 'qwen-code') && typeof doc['response'] === 'string') {
      return doc['response'];
    }
  } catch {
    return null;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Entries                                                                     */
/* -------------------------------------------------------------------------- */

export interface LedgerEntry {
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  /** What the cost was incurred doing — a Motion id, or the act's record type. */
  readonly item: string;
  readonly elapsed_ms: number;
  readonly usage: Usage | null;
}

const cell = (v: string | number): string => String(v).replace(/\|/g, '\\|');

/** Render one ledger row. */
export const renderRow = (entry: LedgerEntry): string => {
  const u = entry.usage;
  const tokens =
    u === null
      ? 'unmeasured'
      : String(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_creation_tokens);
  const cost =
    u === null || u.cost_usd === null ? 'unmeasured' : `$${u.cost_usd.toFixed(6)}`;

  return `| ${cell(entry.at)} | ${cell(entry.actor)} (${entry.role}) | ${cell(entry.item)} | ${cell(
    (entry.elapsed_ms / 1000).toFixed(1),
  )}s | ${cell(tokens)} | ${cell(cost)} | ${cell(u?.model ?? '—')} |`;
};

export const LEDGER_HEADER = [
  '| Timestamp | Actor | Item | Elapsed | Tokens | Cost (USD) | Model |',
  '|---|---|---|---|---|---|---|',
].join('\n');

/**
 * Append a row to the LEDGER.
 *
 * Returns the previous document verbatim as a prefix, same guarantee as the
 * Hansard. If the document has no table yet, the header is inserted once.
 */
export const appendLedgerRow = (document: string, entry: LedgerEntry): string => {
  const base = document.endsWith('\n') || document === '' ? document : `${document}\n`;
  const hasHeader = base.includes('| Timestamp | Actor |');
  const row = renderRow(entry);
  return hasHeader ? `${base}${row}\n` : `${base}\n${LEDGER_HEADER}\n${row}\n`;
};

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface LedgerTotals {
  readonly rows: number;
  readonly elapsed_ms: number;
  readonly tokens: number;
  readonly cost_usd: number;
  /** Rows whose cost the agent did not report. */
  readonly unmeasured: number;
}

const ROW = /^\|\s*(\S+)\s*\|([^|]*)\|([^|]*)\|\s*([\d.]+)s\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|/;

/**
 * Total the LEDGER by reading it back.
 *
 * `unmeasured` is reported separately and never folded into the cost. A total
 * that silently omitted unmeasured rows would understate spend while looking
 * authoritative — the failure mode this module exists to avoid.
 */
export const totals = (document: string): LedgerTotals => {
  let rows = 0;
  let elapsed = 0;
  let tokens = 0;
  let cost = 0;
  let unmeasured = 0;

  for (const line of document.split('\n')) {
    const match = ROW.exec(line.trim());
    if (match === null) continue;
    rows += 1;
    elapsed += Math.round(Number.parseFloat(match[4] ?? '0') * 1000);

    const tokenCell = (match[5] ?? '').trim();
    if (tokenCell !== 'unmeasured') tokens += Number.parseInt(tokenCell, 10) || 0;

    const costCell = (match[6] ?? '').trim();
    if (costCell.startsWith('$')) cost += Number.parseFloat(costCell.slice(1)) || 0;
    else unmeasured += 1;
  }

  return { rows, elapsed_ms: elapsed, tokens, cost_usd: cost, unmeasured };
};

/**
 * Has the session passed a cost ceiling or warning line?
 *
 * The cost ceiling is the guardrail that matters for API-key deployments: an
 * overnight proceeding can otherwise burn credits before anyone notices
 * (RUNTIME.md § Session Termination Conditions).
 */
export const checkCostCeiling = (
  document: string,
  maxCostUsd: number | null,
  warningUsd: number | null,
): { readonly exceeded: boolean; readonly warning: boolean; readonly spent: number } => {
  const spent = totals(document).cost_usd;
  return {
    exceeded: maxCostUsd !== null && spent >= maxCostUsd,
    warning:
      warningUsd !== null &&
      spent >= warningUsd &&
      (maxCostUsd === null || spent < maxCostUsd),
    spent,
  };
};
