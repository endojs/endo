// @ts-check

// We import this first to fail as fast as possible if the shim has been
// transformed or embedded in a way that causes it to run in sloppy mode.
// See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
import './assert-sloppy-mode.js';
import { globalThis } from './commons.js';
import { repairIntrinsics } from './lockdown.js';

/**
 * @param {import('./lockdown.js').LockdownOptions} options
 */
globalThis.lockdown = options => {
  const hardenIntrinsics = repairIntrinsics(options);
  hardenIntrinsics();
};

/**
 * @param {import('./lockdown.js').LockdownOptions} options
 */
globalThis.repairIntrinsics = options => {
  const hardenIntrinsics = repairIntrinsics(options);
  // Reveal hardenIntrinsics after repairs.
  globalThis.hardenIntrinsics = hardenIntrinsics;
};
