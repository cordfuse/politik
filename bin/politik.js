#!/usr/bin/env node
// politik — governed multi-agent sessions on git.
//
// The library is TypeScript and ships unbuilt: tsx is a runtime dependency, so
// this shim registers the loader and hands off to src/cli.ts. No build step,
// and the published package contains the same source that runs.

import { register } from 'tsx/esm/api';

// A reader that closes early — `politik status | head` — makes the next write
// fail with EPIPE. That is normal Unix behaviour for a pipeline, not an error
// worth a stack trace. Swallow it and keep running: calling process.exit() here
// would terminate synchronously and abort an in-flight commit mid-write, which
// is exactly how a governance act's record could be lost. Discarding the write
// lets the remaining work finish and the process exit naturally.
process.stdout.on('error', (error) => {
  if (error?.code === 'EPIPE') return;
  throw error;
});

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
