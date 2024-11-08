import 'ses';
import test from 'ava';
import fs from 'fs';
import crypto from 'crypto';
import url from 'url';
import { parseArchive, makeArchive } from '../index.js';
import { makeReadPowers } from '../node-powers.js';

const fixtureLocation = new URL(
  'fixtures-stack/index.js',
  import.meta.url,
).toString();

const readPowers = makeReadPowers({ fs, crypto, url });

test('rewrite source url', async t => {
  const locations = new Map();

  const computeKey = (compartmentName, moduleSpecifier) => {
    return `${JSON.stringify(compartmentName)},${JSON.stringify(
      moduleSpecifier,
    )}`;
  };

  const archive = await makeArchive(readPowers, fixtureLocation, {
    /**
     * @param {string} compartmentName
     * @param {string} moduleSpecifier
     * @param {string} location
     */
    captureSourceLocation(compartmentName, moduleSpecifier, location) {
      const key = computeKey(compartmentName, moduleSpecifier);
      locations.set(key, location);
    },
  });

  const app = await parseArchive(archive, '<memory>', {
    /**
     * @param {string} compartmentName
     * @param {string} moduleSpecifier
     * @returns {string|undefined}
     */
    computeSourceLocation(compartmentName, moduleSpecifier) {
      const key = computeKey(compartmentName, moduleSpecifier);
      return locations.get(key);
    },
  });

  let error;
  try {
    await app.import();
  } catch (_error) {
    error = _error;
  }

  t.assert(error);
  t.log(error.stack);
  t.assert(
    error.stack.includes(
      '/packages/compartment-mapper/test/fixtures-stack/index.js:3:',
    ),
  );
});
