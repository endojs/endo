// @ts-check

import fs from 'fs';
import url, { URL } from 'url';
import crypto from 'crypto';

import '../debug.js';
import test from 'ava';

import { makeArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

test('Can be bundled', async t => {
  const powers = makeReadPowers({ fs, url, crypto });

  await t.notThrowsAsync(() =>
    makeArchive(
      powers,
      new URL('./fixture/ses-boot.js', import.meta.url).toString(),
    ),
  );
});
