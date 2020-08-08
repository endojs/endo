import { assign } from './src/commons.js';
import { makeLockdown, harden } from './src/lockdown-shim.js';

assign(globalThis, {
  harden,
  lockdown: makeLockdown(),
});
