#!/usr/bin/env node
(async () => {
  // We use the legacy mode for maximum compatibility.
  await import('@endo/init/legacy.js');

  // Trim off the Node.js interpreter name.
  const [_nodeJS, endoExec, ...args] = process.argv;

  const script =
    endoExec && endoExec.endsWith('endo-exec.cjs') ? args.shift() : endoExec;
  assert(script, `Usage: ${endoExec} SCRIPT [ARGS...]`);

  const { runFirstMain } = await import('endo-exec/run-first-main.js');
  await runFirstMain({
    process: harden({ argv: [script, ...args], env: { ...process.env } }),
  });
})().catch(error => {
  console.error(error);
  if (process.exitCode === 0) {
    process.exitCode = 1;
  }
});
