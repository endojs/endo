// @ts-check

// This test maintains the invariant that @endo/init can be captured
// in a bundle.
// This test was previously at home in @endo/init itself, but a failure
// indicates a weakness of @endo/compartment-mapper, and more importantly,
// housing the test in @endo/compartment-mapper avoids a dependency cycle.

import fs from 'fs';
import url, { URL } from 'url';
import crypto from 'crypto';

import '@endo/init/debug.js';
import test from 'ava';

import { makeArchive } from '../archive.js';
import { makeReadPowers } from '../node-powers.js';

test('@endo/init can be bundled', async t => {
  const powers = makeReadPowers({ fs, url, crypto });

  await t.notThrowsAsync(() =>
    makeArchive(
      powers,
      new URL('./_can-bundle-init.js', import.meta.url).toString(),
      {
        dev: true,
      },
    ),
  );
});
