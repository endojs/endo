// @ts-nocheck
/* global globalThis */
export const detectEngineGC = async () => {
  const globalGC = globalThis.gc;
  if (typeof globalGC === 'function') {
    return globalGC;
  }
  const { default: vm } = await import('vm');
  // eslint-disable-next-line no-eval
  const nodeGC = vm.runInNewContext(`typeof gc === 'function' && gc`);
  if (nodeGC) {
    return nodeGC;
  }
  const { default: v8 } = await import('v8');
  v8.setFlagsFromString('--expose_gc');
  return vm.runInNewContext('gc');
};
