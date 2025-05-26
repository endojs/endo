// @ts-check
/* eslint-disable import/no-extraneous-dependencies */

import test from 'ava';
import { harden } from '@endo/harden';
import { makeHardener } from '@endo/harden/hardener.js';

test('harden should throw if used in both modes', t => {
  harden({});
  t.throws(() => makeHardener()({}), {
    message: /harden must be used either with lockdown or without lockdown/,
  });
});
