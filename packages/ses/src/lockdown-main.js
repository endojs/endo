import { assign } from './commons.js';
import { makeLockdown, harden } from './lockdown-shim.js';

assign(globalThis, {
  harden,
  lockdown: makeLockdown(),
});
