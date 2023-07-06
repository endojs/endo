import 'ses';
import test from 'ava';
import path from 'path';
import fs from 'fs';
import url from 'url';
import crypto from 'crypto';

import { makeAndHashArchive } from '../archive.js';
import { makeReadPowers } from '../node-powers.js';

const readPowers = makeReadPowers({ fs, url, crypto });

test('missing entry', async t => {
  const entry = url.pathToFileURL(
    path.resolve('i-solemnly-swear-i-do-not-exist.js'),
  );
  await t.throwsAsync(
    makeAndHashArchive(readPowers, entry, {}).then(() => {}),
    {
      message: /Failed to load/,
    },
  );
});
