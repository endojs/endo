/* global globalThis */

// TODO consider adding env option setting APIs to @endo/env-options
// TODO should set up globalThis.process.env if absent
const env = (globalThis.process || {}).env || {};

env.SES_NON_TRAPPING_SHIM = 'enabled';
