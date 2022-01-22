/* global globalThis */
// This is a fixture for test-evalability.js which ensures that dynamic
// eval is available at the time of SES initialization.
// eslint-disable-next-line no-eval
const originalEval = eval;
// eslint-disable-next-line no-eval
globalThis.eval = source => originalEval(source);
