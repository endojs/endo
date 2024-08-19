// @ts-check

// We import this first to fail as fast as possible if the shim has been
// transformed or embedded in a way that causes it to run in sloppy mode.
// See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
import './assert-sloppy-mode.js';
import { globalThis } from './commons.js';
import { repairIntrinsics } from './lockdown.js';

/** @import {LockdownOptions} from '../types.js' */

/**
 * @param {LockdownOptions} [options]
 */
globalThis.lockdown = options => {
  const hardenIntrinsics = repairIntrinsics(options);
  globalThis.harden = hardenIntrinsics();
};

/**
 * @param {LockdownOptions} [options]
 */
globalThis.repairIntrinsics = options => {
  const hardenIntrinsics = repairIntrinsics(options);
  // Reveal hardenIntrinsics after repairs.
  globalThis.hardenIntrinsics = () => {
    // Reveal harden after hardenIntrinsics.
    // Harden is dangerous before hardenIntrinsics because hardening just
    // about anything will inadvertently render intrinsics irreparable.
    // Also, for modules that must work both before or after lockdown (code
    // that is portable between JS and SES), the existence of harden in global
    // scope signals whether such code should attempt to use harden in the
    // defense of its own API.
    // @ts-ignore harden not yet recognized on globalThis.
    globalThis.harden = hardenIntrinsics();
  };
};
