/**
 * Regression: an immutable-charter protocol refuses acts under an edited Charter.
 *
 * A protocol whose mechanics forbid mid-session amendment (ADR-0007
 * `immutable_charter` — adversarial-collaboration, elimination-tournament) fixes
 * its Standing Orders at Writ Drop. The engine records the Charter's fingerprint
 * on the WRIT_DROP entry; if CHARTER.md is edited afterwards, a governance act
 * must be refused, because the whole point of this protocol class is that the
 * constitution cannot change once the session opens. A mutable protocol
 * (parliamentary) must be unaffected — amendment is legitimate there — and
 * prorogue stays available so a tampered session can still be ended.
 *
 * This drives the real binary end to end.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/politik.js', import.meta.url));

const run = (args: readonly string[]): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(-1));
  });

const convene = async (dir: string, protocol: string): Promise<void> => {
  await run(['scaffold', '--dir', dir, '--protocol', protocol, '--quorum', '2']);
  await run(['init', '--charter', join(dir, 'CHARTER.md'), '--speaker', 'steve', '--dir', dir]);
};

describe('immutable Charter enforcement', () => {
  it('refuses a governance act once an immutable Charter is edited', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-immutable-'));
    try {
      await convene(dir, 'elimination-tournament');

      // Intact Charter — the act proceeds.
      assert.equal(
        await run(['division', 'call', '--dir', dir, '--motion', 'm1', '--actor', 'steve', '--role', 'AUTHORITY']),
        0,
        'an intact immutable Charter must permit acts',
      );

      // Amend CHARTER.md after Writ Drop — forbidden for this protocol class.
      await appendFile(join(dir, 'CHARTER.md'), '\n# sneaky mid-session edit\n');

      assert.equal(
        await run(['division', 'call', '--dir', dir, '--motion', 'm2', '--actor', 'steve', '--role', 'AUTHORITY']),
        1,
        'a tampered immutable Charter must refuse the act (EXIT.REFUSED)',
      );

      // Prorogue remains available — a compromised session can still be closed.
      assert.equal(
        await run(['prorogue', '--dir', dir, '--actor', 'steve', '--role', 'AUTHORITY',
          '--trigger', 'objective_met', '--summary', 'closing a tampered session']),
        0,
        'prorogue must stay available even when the immutable Charter was edited',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('leaves a mutable protocol unaffected by a Charter edit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'politik-mutable-'));
    try {
      await convene(dir, 'parliamentary');
      await appendFile(join(dir, 'CHARTER.md'), '\n# a legitimate amendment\n');

      assert.equal(
        await run(['division', 'call', '--dir', dir, '--motion', 'm1', '--actor', 'steve', '--role', 'AUTHORITY']),
        0,
        'parliamentary permits amendment — an edited Charter must not block acts',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
