/* eslint-disable import/no-extraneous-dependencies */
import '@endo/init/pre-bundle-source.js';
import '@endo/lockdown/commit-debug.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
