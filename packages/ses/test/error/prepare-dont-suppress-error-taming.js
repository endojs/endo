/* global globalThis */

// TODO consider adding env option setting APIs to @endo/env-options
// TODO should set up globalThis.process.env if absent
const env = (globalThis.process || {}).env || {};

// Tests that test error taming that might run on Node with
// `errorTaming: 'unsafe'` should include this file so that the error
// taming is not suppressed even if the external environment variable
// is set to normally suppress it.
env.SUPPRESS_NODE_ERROR_TAMING = 'disabled';
