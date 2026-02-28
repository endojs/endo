// @ts-check
/* global process */

import { freeze } from '../commons.js';
import { makeAssert } from './assert.js';
import './types.js';

/** @import {Assert} from '../../types.js' */

let abandon;
// Sniff for host-provided functions for terminating the enclosing UOPT (see
// below). Currently it only checks for the `process.abort` or `process.exit`
// found on Node. It should also sniff for a vat terminating function expected
// to be found within the start compartment of SwingSet vats. What else?
if (typeof process === 'object' && process) {
  abandon = process.abort || process.exit;
}
let raise;
if (typeof abandon === 'function') {
  /** @param {Error} reason */
  raise = reason => {
    // Check `console` each time `raise` is called.
    // eslint-disable-next-line no-restricted-globals
    if (typeof console === 'object' && typeof console.error === 'function') {
      // eslint-disable-next-line @endo/no-polymorphic-call, no-restricted-globals
      console.error('Failed because:', reason);
    }
    abandon(1);
  };
}

/**
 * @type {Partial<{assert: Assert}>}
 *
 * When run in the start compartment, this sniffs to see if there are known
 * forms of host-provided functions for immediately terminating the enclosing
 * Unit of Preemptive Termination. If so, we initialize the exported
 * `fatal` object with its own `assert`, which is like the global `assert`.
 * But rather than throwing the error as global `assert` does,
 * `fatal.assert` logs the error to the current `console`, if any, and terminates
 * this unit of computation.
 *
 * See https://github.com/tc39/proposal-oom-fails-fast for the meaning of a
 * "Unit of Preemptive Termination" (UOPT). This is a unit of
 * computation---like the vat, worker, or process---containing the potentially
 * corrupted state. We preemptively terminate it in order to abandon that
 * corrupted state.
 */
const fatal = {};
if (raise) {
  fatal.assert = makeAssert(raise);
}
freeze(fatal);
export { fatal };
