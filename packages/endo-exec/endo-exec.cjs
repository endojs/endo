#!/usr/bin/env node
(async () => {
  // We use the legacy mode for maximum compatibility.
  await import('@endo/init/legacy.js');

  // Trim off the Node.js interpreter name.
  const [_nodeJS, endoExec, ...args] = process.argv;

  const script = require.main === module ? args.shift() : endoExec;
  assert(script, `Usage: ${endoExec} SCRIPT [ARGS...]`);

  const { runFirst } = await import('endo-exec/run-first.js');

  const cleanEnv = Object.fromEntries(
    /** @type {[string, string][]} */ (
      Object.entries(process.env).filter(([_k, v]) => typeof v === 'string')
    ),
  );
  await runFirst(harden([script, ...args]), harden(cleanEnv), harden({}));
})().catch(error => {
  console.error(error);
  if (process.exitCode === 0) {
    process.exitCode = 1;
  }
});
