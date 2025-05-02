let isFirstRun = true;

/** @type {import('endo-exec').Main} */
export const runFirstMain = async powers => {
  const doRun = isFirstRun;
  isFirstRun = false;

  const url = await import('url');
  const {
    process: {
      argv: [script],
    },
  } = powers;
  const mod = new URL(script, url.pathToFileURL('./')).href;

  // Execute the `main` import if there is one, and this is the first run.
  const { main } = await import(mod);
  let resultP;
  if (doRun && typeof main === 'function') {
    resultP = main(powers);
  }

  const result = await resultP;
  if (Number.isSafeInteger(result)) {
    // Specify an exit code.
    process.exitCode = result;
  }
};
