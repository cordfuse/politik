import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLES,
  PRIMITIVES,
  VERBS,
  STATES,
  SUSPENSION_CAUSES,
  MERGE_STRATEGIES,
  compareRoles,
  isHumanOnlyRole,
  isMergeStrategy,
  isRole,
  isState,
  isSuspensionCause,
  isVerb,
} from '../src/canon.ts';

describe('CANON shape', () => {
  it('declares five roles', () => {
    assert.equal(ROLES.length, 5);
  });

  it('declares eleven session primitives', () => {
    assert.equal(PRIMITIVES.length, 11);
  });

  it('declares fifteen verbs including ASSENT', () => {
    assert.equal(VERBS.length, 15);
    assert.ok(VERBS.includes('ASSENT'));
  });

  it('declares exactly five states', () => {
    assert.equal(STATES.length, 5);
  });
});

describe('ADR conformance', () => {
  it('CONSTITUTIONAL_CRISIS is a suspension cause, not a state (ADR-0003)', () => {
    assert.ok(!(STATES as readonly string[]).includes('CONSTITUTIONAL_CRISIS'));
    assert.ok(isSuspensionCause('CONSTITUTIONAL_CRISIS'));
  });

  it('DEADLOCK is a suspension cause (ADR-0004)', () => {
    assert.ok(isSuspensionCause('DEADLOCK'));
  });

  it('CONFLICT is mechanical — never a suspension cause', () => {
    assert.ok(!(SUSPENSION_CAUSES as readonly string[]).includes('CONFLICT'));
    assert.ok((PRIMITIVES as readonly string[]).includes('CONFLICT'));
  });

  it('carries exactly the ADR-0003 suspension causes', () => {
    assert.deepEqual([...SUSPENSION_CAUSES], [
      'POINT_OF_ORDER',
      'SPEAKER_ORDER',
      'DISPUTED_EXIT',
      'CONSTITUTIONAL_CRISIS',
      'DEADLOCK',
    ]);
  });

  it('heartbeat expiry is a state, not a suspension cause', () => {
    assert.ok((STATES as readonly string[]).includes('STATE_STALE'));
    assert.ok(!(SUSPENSION_CAUSES as readonly string[]).includes('STALE_HEARTBEAT'));
  });

  it('carries the three merge strategies (ADR-0002)', () => {
    assert.deepEqual([...MERGE_STRATEGIES], [
      'merge_commit',
      'squash',
      'fast_forward',
    ]);
    assert.ok(isMergeStrategy('squash'));
    assert.ok(!isMergeStrategy('rebase'));
  });
});

describe('constitutional rule', () => {
  it('AUTHORITY is human-only', () => {
    assert.ok(isHumanOnlyRole('AUTHORITY'));
  });

  it('every other role may be machine-held', () => {
    for (const role of ROLES) {
      if (role === 'AUTHORITY') continue;
      assert.ok(!isHumanOnlyRole(role), `${role} must not be human-only`);
    }
  });
});

describe('role precedence', () => {
  it('AUTHORITY outranks every other role', () => {
    for (const role of ROLES) {
      if (role === 'AUTHORITY') continue;
      assert.ok(compareRoles('AUTHORITY', role) < 0);
    }
  });

  it('OBSERVER is outranked by every other role', () => {
    for (const role of ROLES) {
      if (role === 'OBSERVER') continue;
      assert.ok(compareRoles('OBSERVER', role) > 0);
    }
  });

  it('a role ties with itself', () => {
    assert.equal(compareRoles('MEMBER', 'MEMBER'), 0);
  });
});

describe('guards reject non-CANON input', () => {
  it('rejects unknown values', () => {
    assert.ok(!isRole('SPEAKER'));
    assert.ok(!isVerb('MERGE'));
    assert.ok(!isState('CONVENED'));
    assert.ok(!isSuspensionCause('CONFLICT'));
  });

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.ok(!isRole(bad));
      assert.ok(!isState(bad));
    }
  });

  it('accepts canonical values', () => {
    assert.ok(isRole('OPERATOR'));
    assert.ok(isVerb('ASSENT'));
    assert.ok(isState('STATE_CONVENED'));
  });
});
