import 'ses';
import '@agoric/eventual-send/shim.js';
import './lockdown.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
