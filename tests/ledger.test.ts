import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_HEADER,
  appendLedgerRow,
  checkCostCeiling,
  parseResultText,
  parseUsage,
  renderRow,
  totals,
  type LedgerEntry,
} from '../src/ledger.ts';

/** Shape of a real `claude -p --output-format json` response. */
const CLAUDE_JSON = JSON.stringify({
  is_error: false,
  result: 'Motion tabled and committed.',
  total_cost_usd: 0.091668,
  usage: {
    input_tokens: 2,
    output_tokens: 40,
    cache_read_input_tokens: 15152,
    cache_creation_input_tokens: 6386,
  },
  modelUsage: { 'claude-haiku-4-5-20251001': { costUSD: 0.091668 } },
});

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  at: '2026-04-08T14:00:00Z',
  actor: 'minister-alpha',
  role: 'OPERATOR',
  item: 'motion-001',
  elapsed_ms: 8400,
  usage: null,
  ...over,
});

describe('parsing agent usage', () => {
  it('extracts exact tokens, cost and model from claude-code', () => {
    const usage = parseUsage('claude-code', CLAUDE_JSON);
    assert.ok(usage);
    assert.equal(usage.output_tokens, 40);
    assert.equal(usage.cache_read_tokens, 15152);
    assert.equal(usage.cost_usd, 0.091668);
    assert.equal(usage.model, 'claude-haiku-4-5-20251001');
  });

  it('extracts the answer text from the JSON envelope', () => {
    assert.equal(parseResultText('claude-code', CLAUDE_JSON), 'Motion tabled and committed.');
  });

  it('returns null for plain text rather than a zero-filled reading', () => {
    // "no data" must stay distinguishable from "measured zero".
    assert.equal(parseUsage('claude-code', 'just some output'), null);
  });

  it('returns null for an agent with no known shape', () => {
    assert.equal(parseUsage('goose', CLAUDE_JSON), null);
  });

  it('returns null on malformed JSON rather than throwing', () => {
    assert.equal(parseUsage('claude-code', '{ not json'), null);
  });
});

/** Real shapes captured from each CLI, trimmed. */
const GEMINI_JSON = JSON.stringify({
  session_id: 's',
  response: 'Records matter.',
  stats: {
    models: {
      'gemini-3.1-flash-lite': {
        tokens: { input: 2759, candidates: 30, total: 2929, cached: 12 },
      },
    },
  },
});

const OPENCODE_JSONL = [
  '{"type":"step_start","part":{"type":"step-start"}}',
  '{"type":"text","part":{"text":"Records matter."}}',
  '{"type":"step_finish","part":{"tokens":{"input":3,"output":4,"cache":{"read":8860,"write":2}},"cost":0.002727,"modelID":"claude-sonnet-5"}}',
].join('\n');

const CODEX_JSONL = [
  '{"type":"item.completed","item":{"text":"Records matter."}}',
  '{"type":"turn.completed","usage":{"input_tokens":12360,"cached_input_tokens":3456,"output_tokens":5}}',
].join('\n');

describe('parsing other agents', () => {
  it('reads gemini tokens and model, with cost honestly unmeasured', () => {
    const usage = parseUsage('gemini-cli', GEMINI_JSON);
    assert.ok(usage);
    assert.equal(usage.input_tokens, 2759);
    assert.equal(usage.output_tokens, 30);
    assert.equal(usage.cache_read_tokens, 12);
    assert.equal(usage.model, 'gemini-3.1-flash-lite');
    // The vendor reports no spend. Deriving a price from a rate card would be
    // an estimate dressed as a measurement.
    assert.equal(usage.cost_usd, null);
  });

  it('reads qwen with the same shape', () => {
    assert.equal(parseUsage('qwen-code', GEMINI_JSON)?.input_tokens, 2759);
  });

  it('reads opencode tokens and cost from JSONL events', () => {
    const usage = parseUsage('opencode', OPENCODE_JSONL);
    assert.ok(usage);
    assert.equal(usage.cache_read_tokens, 8860);
    assert.equal(usage.cost_usd, 0.002727);
    assert.equal(usage.model, 'claude-sonnet-5');
  });

  it('reads codex usage from the turn.completed event', () => {
    const usage = parseUsage('codex-cli', CODEX_JSONL);
    assert.ok(usage);
    assert.equal(usage.input_tokens, 12360);
    assert.equal(usage.cache_read_tokens, 3456);
    assert.equal(usage.cost_usd, null);
  });

  it('extracts the answer, not the envelope', () => {
    assert.equal(parseResultText('gemini-cli', GEMINI_JSON), 'Records matter.');
    assert.equal(parseResultText('opencode', OPENCODE_JSONL), 'Records matter.');
    assert.equal(parseResultText('codex-cli', CODEX_JSONL), 'Records matter.');
  });

  it('still returns null for an agent with no known shape', () => {
    assert.equal(parseUsage('goose', OPENCODE_JSONL), null);
    assert.equal(parseUsage('aider', GEMINI_JSON), null);
  });

  it('returns null rather than a zero reading when events carry no usage', () => {
    assert.equal(parseUsage('opencode', '{"type":"text","part":{"text":"hi"}}'), null);
    assert.equal(parseUsage('codex-cli', '{"type":"item.started"}'), null);
  });
});

describe('rendering rows', () => {
  it('records measured cost', () => {
    const row = renderRow(
      entry({ usage: parseUsage('claude-code', CLAUDE_JSON) }),
    );
    assert.match(row, /\$0\.091668/);
    assert.match(row, /claude-haiku-4-5/);
  });

  it('marks unreported cost as unmeasured, never as zero', () => {
    const row = renderRow(entry());
    assert.match(row, /unmeasured \|/);
    assert.ok(!row.includes('$0.00'), 'an unmeasured row must not read as free');
  });

  it('escapes pipes so a value cannot break the table', () => {
    assert.match(renderRow(entry({ item: 'a|b' })), /a\\\|b/);
  });
});

describe('appending', () => {
  it('inserts the header once, then appends rows', () => {
    let doc = appendLedgerRow('# LEDGER\n', entry());
    assert.ok(doc.includes(LEDGER_HEADER));
    doc = appendLedgerRow(doc, entry({ actor: 'minister-bravo' }));
    assert.equal(doc.split('| Timestamp | Actor |').length - 1, 1, 'header duplicated');
  });

  it('preserves the prior document verbatim as a prefix', () => {
    const before = '# LEDGER\n\nPreamble.\n';
    assert.ok(appendLedgerRow(before, entry()).startsWith(before));
  });

  it('lands the first row flush under the header — no blank line splits the table', () => {
    // The LEDGER template ends its header with a trailing blank line. A blank
    // line inside a markdown table breaks it into two on the platform that
    // renders it, so the row must sit directly under the separator.
    const templated = `${LEDGER_HEADER}\n\n`;
    const doc = appendLedgerRow(templated, entry());
    assert.ok(!/\|\n\s*\n\|/.test(doc), 'a blank line separates two table rows');
    assert.match(doc, /\|---\|[^\n]*\n\| /, 'the first row must follow the separator directly');
  });
});

describe('totals', () => {
  const doc = [
    appendLedgerRow('# LEDGER\n', entry({ usage: parseUsage('claude-code', CLAUDE_JSON) })),
  ].reduce((d, x) => x, '');

  it('sums measured rows', () => {
    const t = totals(doc);
    assert.equal(t.rows, 1);
    assert.equal(t.elapsed_ms, 8400);
    assert.ok(Math.abs(t.cost_usd - 0.091668) < 1e-9);
  });

  it('counts unmeasured rows separately from the cost', () => {
    const mixed = appendLedgerRow(doc, entry({ actor: 'bravo' }));
    const t = totals(mixed);
    assert.equal(t.rows, 2);
    assert.equal(t.unmeasured, 1);
    // The measured cost must not silently absorb the unmeasured row.
    assert.ok(Math.abs(t.cost_usd - 0.091668) < 1e-9);
  });

  it('reads an empty ledger as zero rows', () => {
    assert.equal(totals('# LEDGER\n').rows, 0);
  });
});

describe('cost ceiling', () => {
  const doc = appendLedgerRow('# LEDGER\n', entry({ usage: parseUsage('claude-code', CLAUDE_JSON) }));

  it('does not fire below the ceiling', () => {
    assert.ok(!checkCostCeiling(doc, 5, null).exceeded);
  });

  it('fires at the ceiling', () => {
    assert.ok(checkCostCeiling(doc, 0.05, null).exceeded);
  });

  it('warns between the warning line and the ceiling', () => {
    const check = checkCostCeiling(doc, 5, 0.05);
    assert.ok(check.warning);
    assert.ok(!check.exceeded);
  });

  it('never fires when no ceiling is declared', () => {
    assert.ok(!checkCostCeiling(doc, null, null).exceeded);
  });
});
