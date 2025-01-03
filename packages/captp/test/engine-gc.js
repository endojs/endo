/* global globalThis */
export const detectEngineGC = async () => {
  const globalGC = globalThis.gc;
  if (typeof globalGC === 'function') {
    return globalGC;
  }

  // Node.js v8 wizardry to dynamically find the GC capability, regardless of
  // interpreter command line flags.
  const { default: vm } = await import('vm');
  const nodeGC = vm.runInNewContext(`typeof gc === 'function' && gc`);
  if (nodeGC) {
    return nodeGC;
  }

  const { default: v8 } = await import('v8');
  v8.setFlagsFromString('--expose_gc');
  return vm.runInNewContext('gc');
};
