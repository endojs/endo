import path from 'node:path';
import fs from 'node:fs/promises';
import url from 'url';
import rawTest from 'ava';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@endo/init/debug.js';

// eslint-disable-next-line import/no-extraneous-dependencies
// @ts-expect-error - no types
import { wrapTest } from '@endo/ses-ava';

/**
 * Path to fixture's bundled source code
 */
const fixtureSourcePath = path.resolve(
  url.fileURLToPath(
    new URL(
      './fixtures-transform/test-location-unmapper/cjs/index.cjs',
      import.meta.url,
    ),
  ),
);

/**
 * Path to source map of fixture's bundled source code
 */
const fixtureSourceMapPath = path.resolve(
  url.fileURLToPath(
    new URL(
      './fixtures-transform/test-location-unmapper/cjs/index.cjs.map',
      import.meta.url,
    ),
  ),
);

/**
 * @typedef TransformsTestContext
 * @property {string} source - Fixture source
 * @property {string} sourceMap - Fixture source map
 * @property {string} sourceUrl - Relative fixture source filepath
 */

/** @type {import('ava').TestFn<TransformsTestContext>} */
export const test = wrapTest(rawTest);

/**
 * Put fixture into the test context
 */
test.before(async t => {
  const [source, sourceMap] = await Promise.all([
    fs.readFile(fixtureSourcePath, 'utf8'),
    fs.readFile(fixtureSourceMapPath, 'utf8'),
  ]);
  t.context.source = source;
  t.context.sourceMap = sourceMap;
  t.context.sourceUrl = path.basename(fixtureSourcePath);

  t.false(
    path.isAbsolute(t.context.sourceUrl),
    'Absolute source URL will befoul snapshots',
  );
});
