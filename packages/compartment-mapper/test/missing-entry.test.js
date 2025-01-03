import 'ses';
import test from 'ava';
import fs from 'fs';
import url from 'url';
import crypto from 'crypto';

import { makeAndHashArchive } from '../archive.js';
import { makeReadPowers } from '../node-powers.js';

// @ts-expect-error XXX Node interface munging
const readPowers = makeReadPowers({ fs, url, crypto });

test('missing entry', async t => {
  const entry = new URL(
    'fixtures-missing/i-solemnly-swear-i-do-not-exist.js',
    import.meta.url,
  ).href;
  await t.throwsAsync(
    makeAndHashArchive(readPowers, entry, {}).then(() => {}),
    {
      message: /Failed to load/,
    },
  );
});
