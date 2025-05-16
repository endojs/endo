let isFirst = true;

const importIfEntrypoint = async script => {
  const url = await import('url');
  const mod = new URL(script, url.pathToFileURL('./')).href;
  const { isMainThread } = await import('worker_threads').catch(() => ({
    // This is a workaround for Node.js 12.x, which doesn't support
    // `worker_threads` in the main thread.
    isMainThread: true,
  }));
  const fs = await import('fs/promises');

  // Logic lifted from @agoric/cosmic-swingset/tools/inquisitor.mjs
  const realScript = await fs.realpath(script);
  const modPath = url.fileURLToPath(mod);
  const isImport = realScript !== modPath;
  const isEntryPoint = !isImport && !process?.send && isMainThread !== false;

  if (!isEntryPoint) {
    return false;
  }
  return import(mod);
};

/** @type {import('endo-exec').Main} */
export const runFirst = async (...args) => {
  const doRun = isFirst;
  isFirst = false;

  const [script] = args[0];

  let ns = {};
  if (doRun) {
    // Import the module, potentially unconfined and with side effects.
    ns = await importIfEntrypoint(script);
  }

  const { main } = ns;
  let resultP;
  if (typeof main === 'function') {
    // Execute the main-ish import if there is one, and this is the first run.
    resultP = main(...args);
  }

  const result = await resultP;
  if (Number.isSafeInteger(result)) {
    // Specify an exit code.
    process.exitCode = result;
  }
};
