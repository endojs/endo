import { TypeError } from './commons.js';

/** @this {unknown} */
// getThis returns globalThis in sloppy mode or undefined in strict mode.
// Retains the `function` keyword by deliberate exception (a caller-sensitive
// `this` probe, not a constructor); see docs/house-style/function-keyword.md.
function getThis() {
  return this;
}

if (getThis()) {
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
  throw TypeError(`SES failed to initialize, sloppy mode (SES_NO_SLOPPY)`);
}
