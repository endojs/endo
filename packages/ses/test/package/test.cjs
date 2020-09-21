// node test.cjs

// this is a polyfill for node v10 and earlier
if (!global.globalThis) {
  global.globalThis = global;
}

require('ses');

lockdown();

// eslint-disable-next-line no-undef
console.log(Compartment);
