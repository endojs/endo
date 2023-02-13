#!/usr/bin/env node
(async () => {
  // We use the legacy mode for maximum compatibility.
  await import('@endo/init/legacy.js');

  // Trim off the Node.js interpreter name.
  const [_nodeJS, endoExec, ...args] = process.argv;

  const script = endoExec.endsWith('endo-exec.cjs') ? args.shift() : endoExec;
  assert(script, `Usage: ${endoExec} SCRIPT [ARGS...]`);

  const url = await import('url');
  const mod = new URL(script, url.pathToFileURL('./')).href;

  // Execute the `main` import if there is one.
  const { main } = await import(mod);
  let resultP;
  if (typeof main === 'function') {
    resultP = main(harden([script, ...args]));
  }

  const result = await resultP;
  if (Number.isSafeInteger(result)) {
    // Specify an exit code.
    process.exitCode = result;
  }
})().catch(error => {
  console.error(error);
  if (process.exitCode === 0) {
    process.exitCode = 1;
  }
});
