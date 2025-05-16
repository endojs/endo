let isFirst = true;

/** @type {import('endo-exec').OnEndoExec} */
export const runFirst = async powers => {
  const doRun = isFirst;
  isFirst = false;

  const url = await import('url');
  const {
    process: {
      argv: [script],
    },
  } = powers;
  const mod = new URL(script, url.pathToFileURL('./')).href;

  // Import the module, potentially unconfined and with side effects.
  const { onEndoExec } = await import(mod);
  let resultP;
  if (doRun && typeof onEndoExec === 'function') {
    // Execute the main-ish import if there is one, and this is the first run.
    resultP = onEndoExec(powers);
  }

  const result = await resultP;
  if (Number.isSafeInteger(result)) {
    // Specify an exit code.
    process.exitCode = result;
  }
};
