// @ts-check
import '@agoric/install-ses/pre-remoting.js';
import '@agoric/install-ses/debug.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
