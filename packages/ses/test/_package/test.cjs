// @ts-nocheck
/* eslint-disable */
// node test.cjs

// this is a polyfill for globalThis (eg node v10 and earlier)
// "global" is for nodejs and "self" is for browser / webworker
let globalRef =
  typeof global !== 'undefined'
    ? global
    : typeof self !== 'undefined'
      ? self
      : undefined;
if (globalRef && !globalRef.globalThis) {
  globalRef.globalThis = globalRef;
}

require('ses');

lockdown();

// eslint-disable-next-line no-undef
console.log(Compartment);
