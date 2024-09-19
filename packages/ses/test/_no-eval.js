/* global globalThis */
// This is a fixture for test-no-eval.js which ensures that eval is unusable at
// the time of SES initialization.
// eslint-disable-next-line no-eval
globalThis.eval = _source => {
  throw TypeError('no unsafe-eval, as if by content-security-policy');
};
