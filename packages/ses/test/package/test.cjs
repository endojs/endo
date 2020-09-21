// node test.cjs
global.globalThis = global;
require('ses');

lockdown();
// eslint-disable-next-line no-undef
console.log(Compartment);
