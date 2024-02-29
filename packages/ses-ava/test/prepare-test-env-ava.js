import '@endo/lockdown/commit-debug.js';

import rawTest from 'ava';
import { wrapTest } from '../src/ses-ava-test.js';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest, { tlog: true });
