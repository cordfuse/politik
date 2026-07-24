import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENTS,
  buildInvocation,
  canRunHeadless,
  composePrompt,
  findAgent,
} from '../src/agents.ts';
import { parseEnvelope, type Envelope } from '../src/envelope.ts';

const ENVELOPE: Envelope = (() => {
  const result = parseEnvelope(
    '# [session-1]\n## target-actor: OPERATOR\n## slots-remaining: 2\n## protocol: parliamentary\n## prompt: |\n  Review motion-003 and file your assessment.\n',
  );
  assert.ok(result.ok);
  return result.envelope;
})();

describe('registry', () => {
  it('carries every agent named in RUNTIME.md § Politik Compatible', () => {
    for (const id of [
      'claude-code',
      'gemini-cli',
      'opencode',
      'qwen-code',
      'codex-cli',
      'antigravity',
      'aider',
      'goose',
    ]) {
      assert.ok(findAgent(id), `${id} missing from registry`);
    }
  });

  it('excludes IDE-primary tools — they expose no headless prompt', () => {
    for (const id of ['cursor', 'windsurf', 'copilot', 'continue', 'roo']) {
      assert.equal(findAgent(id), null, `${id} must not be a constituency`);
    }
  });

  it('returns null for an unknown agent', () => {
    assert.equal(findAgent('not-an-agent'), null);
  });

  it('gives every agent a distinct id and a command', () => {
    const ids = new Set(AGENTS.map((a) => a.id));
    assert.equal(ids.size, AGENTS.length, 'duplicate agent id');
    for (const agent of AGENTS) {
      assert.ok(agent.command.length > 0, `${agent.id} has no command`);
    }
  });

  it('reports every agent as headless-capable via API key', () => {
    for (const agent of AGENTS) {
      assert.ok(canRunHeadless(agent), `${agent.id} cannot run headless`);
    }
  });
});

describe('invocation shapes', () => {
  const expected: Record<string, string[]> = {
    'claude-code': ['-p', 'PROMPT'],

    'qwen-code': ['-p', 'PROMPT'],
    'opencode': ['run', 'PROMPT'],
    'goose': ['run', 'PROMPT'],
    'codex-cli': ['exec', 'PROMPT'],
    'gemini-cli': ['--skip-trust', '-p', 'PROMPT'],
    'aider': ['--message', 'PROMPT'],
  };

  for (const [id, args] of Object.entries(expected)) {
    it(`builds ${id} correctly`, () => {
      const agent = findAgent(id);
      assert.ok(agent);
      const invocation = buildInvocation(agent, 'PROMPT');
      assert.equal(invocation.command, agent.command);
      assert.deepEqual([...invocation.args], args);
    });
  }

  it('never returns a shell string — args stay separate', () => {
    const agent = findAgent('claude-code');
    assert.ok(agent);
    const nasty = 'review this; rm -rf / #';
    const invocation = buildInvocation(agent, nasty);
    assert.ok(invocation.args.includes(nasty), 'prompt must survive intact as one arg');
    assert.ok(!invocation.command.includes(';'), 'command must not carry shell syntax');
  });

  it('places extra args before the prompt for flag-style agents', () => {
    const agent = findAgent('claude-code');
    assert.ok(agent);
    const invocation = buildInvocation(agent, 'P', ['--model', 'x']);
    assert.deepEqual([...invocation.args], ['--model', 'x', '-p', 'P']);
  });

  it('places extra args after the subcommand for subcommand-style agents', () => {
    const agent = findAgent('opencode');
    assert.ok(agent);
    const invocation = buildInvocation(agent, 'P', ['--model', 'x']);
    assert.deepEqual([...invocation.args], ['run', '--model', 'x', 'P']);
  });
});

describe('prompt injection format', () => {
  const prompt = composePrompt({
    envelope: ENVELOPE,
    role: 'OPERATOR',
    verbs: ['READ', 'WRITE', 'VOTE'],
    protocol: 'parliamentary',
    standing_orders: 'Destructive migrations require a Division.',
    hansard_excerpt: '## 2026-04-08T14:00:00Z — WRIT_DROP\n\n**Actor:** speaker (AUTHORITY)',
  });

  it('names the role, protocol and session', () => {
    assert.match(prompt, /You are a \*\*OPERATOR\*\*/);
    assert.match(prompt, /\*\*parliamentary\*\* protocol/);
    assert.match(prompt, /session-1/);
  });

  it('states the granted verbs', () => {
    assert.match(prompt, /Verbs granted to your role: READ, WRITE, VOTE/);
  });

  it('routes an ungranted action to a Point of Order rather than to refusal', () => {
    assert.match(prompt, /file a Point of Order/);
  });

  it('carries the Standing Orders', () => {
    assert.match(prompt, /Destructive migrations require a Division/);
  });

  it('supplies the Hansard as context, since the agent is stateless', () => {
    assert.match(prompt, /The Hansard is the session/);
    assert.match(prompt, /WRIT_DROP/);
  });

  it('carries the envelope business', () => {
    assert.match(prompt, /Review motion-003/);
  });

  it('states the containment and append-only rules', () => {
    assert.match(prompt, /Do not traverse above the working directory/);
    assert.match(prompt, /append-only/);
  });

  it('omits the record section when there is no Hansard yet', () => {
    const fresh = composePrompt({
      envelope: ENVELOPE,
      role: 'MEMBER',
      verbs: ['READ'],
      protocol: 'parliamentary',
    });
    assert.ok(!fresh.includes('## Record so far'));
  });

  it('is identical across agents — per-agent tuning would void comparisons', () => {
    const context = {
      envelope: ENVELOPE,
      role: 'OPERATOR',
      verbs: ['READ'],
      protocol: 'parliamentary',
    } as const;
    assert.equal(composePrompt(context), composePrompt(context));
  });

  it('handles a role with no verbs', () => {
    const observer = composePrompt({
      envelope: ENVELOPE,
      role: 'OBSERVER',
      verbs: [],
      protocol: 'parliamentary',
    });
    assert.match(observer, /Verbs granted to your role: none/);
  });
});
