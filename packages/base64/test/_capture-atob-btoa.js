/* global globalThis */
const { atob: origAtob, btoa: origBtoa } = globalThis;
export { origAtob as atob, origBtoa as btoa };
