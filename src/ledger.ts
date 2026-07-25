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
 * never edited` (POLITIK-ARCHITECTURE.md § FILE OWNERSHIP).
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
  if (!trimmed.startsWith('{')) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const doc = raw as Record<string, unknown>;

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

/** The agent's actual answer, pulled out of structured output. */
export const parseResultText = (agentId: string, stdout: string): string | null => {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const doc = JSON.parse(trimmed) as Record<string, unknown>;
    if (agentId === 'claude-code' && typeof doc['result'] === 'string') {
      return doc['result'];
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
