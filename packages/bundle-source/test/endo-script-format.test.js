// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

const generate = async (options = {}) => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/meaning.js`, import.meta.url),
  );
  return bundleSource(entryPath, {
    format: 'endoScript',
    ...options,
  });
};

test('endo script format', async t => {
  const bundle = await generate();
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.meaning, 42);
});

test('endo script format is smaller with blank comments', async t => {
  const bigBundle = await generate();
  const smallBundle = await generate({ elideComments: true });
  const compartment = new Compartment();
  const ns = compartment.evaluate(smallBundle.source);
  t.is(ns.meaning, 42);
  t.assert(smallBundle.source.length < bigBundle.source.length);
});
