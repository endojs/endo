// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

test('endo script format', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/meaning.js`, import.meta.url),
  );
  const bundle = await bundleSource(entryPath, {
    format: 'endoScript',
  });
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.meaning, 42);
});
