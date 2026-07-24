#!/usr/bin/env node
// politik — governed multi-agent sessions on git.
//
// The library is TypeScript and ships unbuilt: tsx is a runtime dependency, so
// this shim registers the loader and hands off to src/cli.ts. No build step,
// and the published package contains the same source that runs.

import { register } from 'tsx/esm/api';

const unregister = register();

try {
  const { run } = await import('../src/cli.ts');
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`politik: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  unregister();
}
