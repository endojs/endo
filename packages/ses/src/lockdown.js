import { lockdown, harden } from './lockdown-shim.js';

Object.assign(globalThis, {
  lockdown,
  harden,
});
