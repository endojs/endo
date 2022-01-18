/* eslint-disable import/no-extraneous-dependencies */
import '@agoric/install-ses/pre-bundle-source.js';
import '@agoric/lockdown/commit-debug.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';

/** @type {typeof rawTest} */
export const test = wrapTest(rawTest);
