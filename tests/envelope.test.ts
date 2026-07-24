import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  claimSlot,
  isEligible,
  parseEnvelope,
  serializeEnvelope,
  type Envelope,
} from '../src/envelope.ts';

/** The envelope from POLITIK-ARCHITECTURE.md § BROADCAST ENVELOPE, verbatim. */
const REFERENCE = `# [SESSION-GUID]
## target-actor: OPERATOR
## slots-remaining: 3
## protocol: parliamentary
## prompt: |
  Review the authentication refactor in motion-003
  and file your assessment as a PR review.
  You have READ and VOTE verbs for this motion.
`;

const parseOk = (source: string): Envelope => {
  const result = parseEnvelope(source);
  assert.ok(result.ok, `expected parse to succeed: ${JSON.stringify(result)}`);
  return result.envelope;
};

describe('reference envelope', () => {
  const envelope = parseOk(REFERENCE);

  it('reads the GUID from the bracketed H1', () => {
    assert.equal(envelope.session_guid, 'SESSION-GUID');
  });

  it('reads the header fields', () => {
    assert.equal(envelope.target_actor, 'OPERATOR');
    assert.equal(envelope.slots_remaining, 3);
    assert.equal(envelope.protocol, 'parliamentary');
  });

  it('reads the block-scalar prompt with indentation stripped', () => {
    assert.equal(
      envelope.prompt,
      'Review the authentication refactor in motion-003\n' +
        'and file your assessment as a PR review.\n' +
        'You have READ and VOTE verbs for this motion.',
    );
  });

  it('carries no extensions', () => {
    assert.deepEqual(envelope.extensions, {});
  });
});

describe('GUID forms', () => {
  it('accepts an unbracketed GUID', () => {
    const envelope = parseOk(REFERENCE.replace('# [SESSION-GUID]', '# 0f9c1b3e-0000'));
    assert.equal(envelope.session_guid, '0f9c1b3e-0000');
  });

  it('rejects an envelope with no H1', () => {
    const result = parseEnvelope(REFERENCE.replace('# [SESSION-GUID]\n', ''));
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.field, 'session_guid');
  });
});

describe('field validation', () => {
  it('rejects a target-actor outside CANON', () => {
    const result = parseEnvelope(REFERENCE.replace('OPERATOR', 'MINISTER'));
    assert.ok(!result.ok);
    assert.match(result.issues[0]?.message ?? '', /not a CANON role/);
  });

  it('rejects non-integer slots', () => {
    const result = parseEnvelope(REFERENCE.replace('slots-remaining: 3', 'slots-remaining: many'));
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.field, 'slots_remaining');
  });

  it('rejects negative slots', () => {
    const result = parseEnvelope(REFERENCE.replace('slots-remaining: 3', 'slots-remaining: -1'));
    assert.ok(!result.ok);
  });

  it('accepts zero slots — a valid exhausted broadcast', () => {
    assert.equal(parseOk(REFERENCE.replace('slots-remaining: 3', 'slots-remaining: 0')).slots_remaining, 0);
  });

  it('rejects an empty prompt', () => {
    const result = parseEnvelope('# [G]\n## target-actor: MEMBER\n## slots-remaining: 1\n## protocol: p\n');
    assert.ok(!result.ok);
    assert.ok(result.issues.some((i) => i.field === 'prompt'));
  });

  it('reports every missing field at once', () => {
    const result = parseEnvelope('# [G]\n');
    assert.ok(!result.ok);
    assert.equal(result.issues.length, 4);
  });
});

describe('extensions', () => {
  it('preserves unknown fields verbatim', () => {
    const envelope = parseOk(
      REFERENCE.replace('## protocol:', '## motion-ref: motion-003\n## protocol:'),
    );
    assert.equal(envelope.extensions['motion_ref'], 'motion-003');
  });
});

describe('round trip', () => {
  it('serializes back to a parseable envelope', () => {
    const original = parseOk(REFERENCE);
    const reparsed = parseOk(serializeEnvelope(original));
    assert.deepEqual(reparsed, original);
  });

  it('round-trips extensions', () => {
    const original = parseOk(
      REFERENCE.replace('## protocol:', '## motion-ref: motion-003\n## protocol:'),
    );
    assert.deepEqual(parseOk(serializeEnvelope(original)), original);
  });

  it('round-trips a single-line prompt', () => {
    const original = parseOk('# [G]\n## target-actor: MEMBER\n## slots-remaining: 1\n## protocol: p\n## prompt: |\n  Do the thing.\n');
    assert.equal(original.prompt, 'Do the thing.');
    assert.deepEqual(parseOk(serializeEnvelope(original)), original);
  });
});

describe('self-organization — steps 2 and 3', () => {
  const envelope = parseOk(REFERENCE);

  it('matches an agent in the target constituency', () => {
    assert.ok(isEligible(envelope, 'OPERATOR'));
  });

  it('stands down an agent of another constituency', () => {
    assert.ok(!isEligible(envelope, 'MEMBER'));
    assert.ok(!isEligible(envelope, 'OBSERVER'));
  });

  it('stands down every agent when slots are exhausted', () => {
    const exhausted = { ...envelope, slots_remaining: 0 };
    assert.ok(!isEligible(exhausted, 'OPERATOR'));
  });
});

describe('slot claim', () => {
  it('decrements without mutating the original', () => {
    const envelope = parseOk(REFERENCE);
    const claimed = claimSlot(envelope);
    assert.equal(claimed.slots_remaining, 2);
    assert.equal(envelope.slots_remaining, 3, 'original mutated');
  });

  it('never goes below zero', () => {
    const envelope = { ...parseOk(REFERENCE), slots_remaining: 0 };
    assert.equal(claimSlot(envelope).slots_remaining, 0);
  });
});
