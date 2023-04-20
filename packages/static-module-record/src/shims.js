/* global globalThis */

const { freeze } = Object;

const shimmedProcess = freeze({
  // process.env itself should be mutable.
  env: {},
});
if (typeof process === 'undefined') {
  Object.defineProperty(globalThis, 'process', {
    value: shimmedProcess,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

const shimmedBuffer = freeze({
  isBuffer: freeze(() => false),
});
if (typeof Buffer === 'undefined') {
  Object.defineProperty(globalThis, 'Buffer', {
    value: shimmedBuffer,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export { shimmedBuffer as Buffer, shimmedProcess as process };
