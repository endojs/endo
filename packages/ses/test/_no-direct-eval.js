/* global globalThis */
// This is a fixture for test-no-direct-eval.js which ensures that dynamic
// eval is available at the time of SES initialization.
// eslint-disable-next-line no-eval
const indirectEval = eval;
// eslint-disable-next-line no-eval
globalThis.eval = source => indirectEval(source);
