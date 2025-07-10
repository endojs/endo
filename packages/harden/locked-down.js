/* global globalThis */
/* eslint-disable no-restricted-globals */

// This module should only be present if it was bundled or executed with the
// "harden" condition, indicating that "harden" is expected to have been
// installed globally, usually an effect of calling lockdown() to set up
// HardenedJS.
if (globalThis.harden === undefined) {
  throw new Error(
    'Missing global harden function. Applications running or bundled with the "harden" condition expect globalThis.harden to exist at time of initialization',
  );
}
export const harden = globalThis.harden;
