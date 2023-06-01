/* global globalThis */

import '@endo/lockdown/commit-debug.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

export * from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);

const env = (globalThis.process || {}).env || {};
env.TRACK_TURNS = 'enabled';
