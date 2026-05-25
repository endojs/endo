/* global setImmediate */
// GC + finalize helper.  Returns a function that, when awaited, runs gc() and
// flushes finalizers.  If no gcPower is available, returns a no-op.

/**
 * @param {Promise<(() => void) | null> | (() => void) | null} gcPowerP
 * @returns {Promise<() => Promise<void>>}
 */
export async function makeGcAndFinalize(gcPowerP) {
  const gcPower = await gcPowerP;
  if (typeof gcPower !== 'function') {
    return async () => {};
  }
  return async () => {
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    gcPower();
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  };
}
