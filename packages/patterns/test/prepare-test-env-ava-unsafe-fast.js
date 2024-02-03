import './pre-unsafe-fast.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
