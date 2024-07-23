// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

test('endo nested evaluate format', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/meaning.js`, import.meta.url),
  );
  const bundle = await bundleSource(entryPath, {
    format: 'nestedEvaluate',
  });
  t.is(bundle.moduleFormat, 'nestedEvaluate');
  const { source } = bundle;
  const compartment = new Compartment();
  const f = compartment.evaluate(`(${source})`);
  t.is(f('.').meaning, 42);
});
