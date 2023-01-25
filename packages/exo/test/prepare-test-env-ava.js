// eslint-disable-next-line import/no-extraneous-dependencies
import '@endo/init/debug.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { wrapTest } from '@endo/ses-ava';
// TODO: Why do we need to suppress import/no-unresolved here, but not
// in similar packages like pass-style?
// eslint-disable-next-line import/no-unresolved
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
