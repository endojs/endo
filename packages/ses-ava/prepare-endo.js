/* global globalThis */

import '@endo/init/pre-remoting.js';
import '@endo/init/debug.js';
import { environmentOptionsListHas } from '@endo/env-options';

import rawTest from 'ava';
import { wrapTest } from './src/ses-ava-test.js';

// TODO consider adding env option setting APIs to @endo/env-options
// TODO should set up globalThis.process.env if absent
const env = (globalThis.process || {}).env || {};
env.TRACK_TURNS = 'enabled';

if (!environmentOptionsListHas('DEBUG', 'track-turns')) {
  if ('DEBUG' in env) {
    env.DEBUG = `${env.DEBUG},track-turns`;
  } else {
    env.DEBUG = 'track-turns';
  }
}

/** @type {typeof rawTest} */
const test = wrapTest(rawTest);

// eslint-disable-next-line no-restricted-exports
export { test as default };
