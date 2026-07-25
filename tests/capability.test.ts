import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHETYPES,
  SOFT_SKILLS,
  checkCapability,
  composition,
  parseProfile,
  skillMismatch,
  type ActorProfile,
} from '../src/capability.ts';
import type { Constituency } from '../src/charter.ts';

const seat = (over: Partial<Constituency> = {}): Constituency => ({
  role: 'OPERATOR',
  agent: null,
  slots: 1,
  auto_demotion: false,
  hard_skills: { required: [], excluded: [] },
  model: { required: null, preferred: null, knowledge_cutoff_minimum: null },
  mandate_alignment: null,
  ...over,
});

const profile = (over: Partial<ActorProfile> = {}): ActorProfile => ({
  actor: 'alpha',
  role: 'OPERATOR',
  archetype: 'ANALYST',
  hard_skills: [],
  model: null,
  knowledge_cutoff: null,
  mandate_alignment: null,
  ...over,
});

describe('dimensions', () => {
  it('declares seven archetypes and five soft skills', () => {
    assert.equal(ARCHETYPES.length, 7);
    assert.equal(SOFT_SKILLS.length, 5);
  });
});

describe('hard skills', () => {
  it('admits an actor holding every required skill', () => {
    const check = checkCapability(
      profile({ hard_skills: ['a', 'b'] }),
      seat({ hard_skills: { required: ['a'], excluded: [] } }),
    );
    assert.ok(check.ok);
  });

  it('refuses a missing required skill', () => {
    const check = checkCapability(
      profile({ hard_skills: [] }),
      seat({ hard_skills: { required: ['governance_design'], excluded: [] } }),
    );
    assert.ok(!check.ok);
    assert.match(check.issues[0]?.message ?? '', /missing required/);
  });

  it('refuses an excluded skill — confident wrong output is worse than none', () => {
    const check = checkCapability(
      profile({ hard_skills: ['raw_SQL'] }),
      seat({ hard_skills: { required: [], excluded: ['raw_SQL'] } }),
    );
    assert.ok(!check.ok, 'an excluded skill must be a hard failure, not a warning');
  });

  it('names every failing dimension rather than stopping at the first', () => {
    const check = checkCapability(
      profile({ hard_skills: ['raw_SQL'], model: 'haiku', knowledge_cutoff: '2024-01' }),
      seat({
        hard_skills: { required: ['gov'], excluded: ['raw_SQL'] },
        model: { required: 'opus', preferred: null, knowledge_cutoff_minimum: '2025-01' },
      }),
    );
    assert.equal(check.issues.filter((i) => i.severity === 'fail').length, 4);
  });
});

describe('model grade', () => {
  it('admits an exact model match', () => {
    assert.ok(
      checkCapability(
        profile({ model: 'claude-opus-4-8' }),
        seat({ model: { required: 'claude-opus-4-8', preferred: null, knowledge_cutoff_minimum: null } }),
      ).ok,
    );
  });

  it('tolerates a vendor suffix', () => {
    // `claude-opus-4-8[1m]` is the same model with a context variant.
    assert.ok(
      checkCapability(
        profile({ model: 'claude-opus-4-8[1m]' }),
        seat({ model: { required: 'claude-opus-4-8', preferred: null, knowledge_cutoff_minimum: null } }),
      ).ok,
    );
  });

  it('refuses a model that does not satisfy the requirement', () => {
    assert.ok(
      !checkCapability(
        profile({ model: 'claude-haiku-4-5' }),
        seat({ model: { required: 'claude-opus-4-8', preferred: null, knowledge_cutoff_minimum: null } }),
      ).ok,
    );
  });

  it('treats a non-preferred model as a warning, not a failure', () => {
    const check = checkCapability(
      profile({ model: 'claude-sonnet-5' }),
      seat({ model: { required: null, preferred: 'claude-opus-4-8', knowledge_cutoff_minimum: null } }),
    );
    assert.ok(check.ok);
    assert.equal(check.issues[0]?.severity, 'warn');
  });

  it('refuses a knowledge cutoff earlier than required', () => {
    assert.ok(
      !checkCapability(
        profile({ knowledge_cutoff: '2024-06' }),
        seat({ model: { required: null, preferred: null, knowledge_cutoff_minimum: '2025-01' } }),
      ).ok,
    );
  });

  it('admits a later cutoff', () => {
    assert.ok(
      checkCapability(
        profile({ knowledge_cutoff: '2026-01' }),
        seat({ model: { required: null, preferred: null, knowledge_cutoff_minimum: '2025-01' } }),
      ).ok,
    );
  });
});

describe('a seat requiring nothing admits anyone', () => {
  it('passes an empty profile', () => {
    assert.ok(checkCapability(profile(), seat()).ok);
  });
});

describe('profile files', () => {
  const SOURCE = `---
actor: minister-alpha
role: OPERATOR
archetype: HARDLINER
hard_skills: [governance_design, markdown]
soft_skills:
  ANALYTICAL_THINKING: 4
model:
  name: claude-opus-4-8
  knowledge_cutoff: 2025-06
mandate_alignment: quality
---

# Minister Alpha
`;

  it('parses the five dimensions', () => {
    const parsed = parseProfile(SOURCE, 'fallback');
    assert.ok(parsed);
    assert.equal(parsed.actor, 'minister-alpha');
    assert.equal(parsed.archetype, 'HARDLINER');
    assert.deepEqual([...(parsed.hard_skills ?? [])], ['governance_design', 'markdown']);
    assert.equal(parsed.soft_skills?.ANALYTICAL_THINKING, 4);
    assert.equal(parsed.model, 'claude-opus-4-8');
    assert.equal(parsed.mandate_alignment, 'quality');
  });

  it('falls back to the filename actor when unstated', () => {
    assert.equal(parseProfile('---\nrole: MEMBER\n---\n', 'from-filename')?.actor, 'from-filename');
  });

  it('returns null for a file with no frontmatter', () => {
    assert.equal(parseProfile('# Just prose\n', 'x'), null);
  });

  it('drops an unknown archetype rather than carrying it', () => {
    assert.equal(parseProfile('---\narchetype: WIZARD\n---\n', 'x')?.archetype, null);
  });
});

describe('skill mismatch', () => {
  it('records a FAULT_ACTOR with the SKILL_MISMATCH subtype', () => {
    const entry = skillMismatch({
      at: '2026-04-08T14:00:00Z',
      actor: 'alpha',
      role: 'OPERATOR',
      observed: 'wrote raw SQL migrations',
      excluded_domain: 'raw_SQL',
      auto_demotion: false,
    });
    assert.equal(entry.type, 'FAULT_ACTOR');
    assert.equal(entry.fields?.['Subtype'], 'SKILL_MISMATCH');
    assert.match(entry.fields?.['Consequence'] ?? '', /escalated to the Speaker/);
  });

  it('reports auto-demotion when the Charter permits it', () => {
    const entry = skillMismatch({
      at: '2026-04-08T14:00:00Z',
      actor: 'alpha',
      role: 'OPERATOR',
      observed: 'x',
      excluded_domain: 'y',
      auto_demotion: true,
    });
    assert.match(entry.fields?.['Consequence'] ?? '', /auto-demotion/);
  });
});

describe('composition', () => {
  it('counts archetypes across a bench', () => {
    const c = composition([
      profile({ archetype: 'ANALYST' }),
      profile({ archetype: 'ANALYST' }),
      profile({ archetype: 'CREATIVE' }),
    ]);
    assert.equal(c.archetypes.ANALYST, 2);
    assert.equal(c.distinct, 2);
    assert.ok(!c.homogeneous);
  });

  it('flags a homogeneous bench without judging it', () => {
    // RESEARCH.md asks whether complementary composition outperforms
    // homogeneous — measuring it is the point; warning about it would answer
    // the question by assumption.
    const c = composition([profile({ archetype: 'HARDLINER' }), profile({ archetype: 'HARDLINER' })]);
    assert.ok(c.homogeneous);
  });

  it('ignores actors declaring no archetype', () => {
    assert.equal(composition([profile({ archetype: null })]).distinct, 0);
  });
});
