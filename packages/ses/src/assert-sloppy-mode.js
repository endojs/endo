/* eslint-disable no-new-func, no-restricted-globals */

import { TypeError } from './commons.js';

const getThis = () => Function('return this')();

if (getThis()) {
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
  throw TypeError(`SES failed to initialize, sloppy mode (SES_NO_SLOPPY)`);
}
