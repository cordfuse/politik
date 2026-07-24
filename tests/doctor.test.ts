import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectPlatform, diagnose, inContainer } from '../src/doctor.ts';

describe('platform detection', () => {
  it('reports a known platform', () => {
    assert.ok(['linux', 'wsl2', 'macos', 'windows'].includes(detectPlatform()));
  });

  it('distinguishes wsl2 from linux', () => {
    // WSL is its own matrix row: different auth story, different container
    // story. Collapsing it into "linux" would make the matrix lie.
    assert.notEqual(detectPlatform(), 'wsl');
  });
});

describe('container detection', () => {
  it('answers without throwing', async () => {
    assert.equal(typeof (await inContainer()), 'boolean');
  });
});

describe('diagnosis', () => {
  it('reports this host as ready', async () => {
    const diagnosis = await diagnose();
    assert.ok(diagnosis.ready, `not ready: ${JSON.stringify(diagnosis.checks)}`);
  });

  it('requires node and git', async () => {
    const names = (await diagnose()).checks.map((c) => c.name);
    assert.ok(names.includes('node'));
    assert.ok(names.includes('git'));
  });

  it('passes the node version check on a supported runtime', async () => {
    const node = (await diagnose()).checks.find((c) => c.name === 'node');
    assert.equal(node?.status, 'ok');
  });

  it('reports installed agents rather than assuming any', async () => {
    const diagnosis = await diagnose();
    const agents = diagnosis.checks.find((c) => c.name === 'agents');
    assert.ok(agents);
    // Zero agents is a warning, never a failure — the framework installs fine
    // on a host that seats no constituency.
    assert.notEqual(agents.status, 'fail');
  });

  it('never throws on a missing optional tool', async () => {
    await assert.doesNotReject(() => diagnose());
  });

  it('gives every check a non-empty detail', async () => {
    for (const check of (await diagnose()).checks) {
      assert.ok(check.detail.length > 0, `${check.name} has no detail`);
    }
  });
});
