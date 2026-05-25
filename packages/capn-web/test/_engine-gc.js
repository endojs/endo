/* global globalThis */
// Detect or force-enable the engine GC.  Adapted from @endo/captp's
// engine-gc.js — works regardless of whether --expose-gc was passed.

export const detectEngineGC = async () => {
  if (typeof globalThis.gc === 'function') {
    return globalThis.gc;
  }
  const { default: vm } = await import('vm');
  const nodeGC = vm.runInNewContext(`typeof gc === 'function' && gc`);
  if (nodeGC) return nodeGC;
  try {
    const { default: v8 } = await import('v8');
    v8.setFlagsFromString('--expose_gc');
    return vm.runInNewContext('gc');
  } catch (_e) {
    return null;
  }
};
