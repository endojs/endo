/* global globalThis */

import { environmentOptionsListHas } from '@endo/env-options';
import test from '@endo/ses-ava/prepare-endo.js';

// TODO consider adding env option setting APIs to @endo/env-options
// TODO should set up globalThis.process.env if absent
const env = (globalThis.process || {}).env || {};
if (!environmentOptionsListHas('DEBUG', 'label-instances')) {
  if ('DEBUG' in env) {
    env.DEBUG = `${env.DEBUG},label-instances`;
  } else {
    env.DEBUG = 'label-instances';
  }
}

// eslint-disable-next-line no-restricted-exports
export { test as default };
