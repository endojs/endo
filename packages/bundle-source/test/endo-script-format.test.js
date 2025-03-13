// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

/**
 * @template {Partial<object>} Options
 * @param {string} entry
 * @param {Options} options
 */
const generate = async (entry, options = {}) => {
  const entryPath = url.fileURLToPath(new URL(entry, import.meta.url));
  return bundleSource(entryPath, {
    format: 'endoScript',
    ...options,
  });
};

test('endo script format', async t => {
  const bundle = await generate('../demo/meaning.js');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.meaning, 42);
});

test('endo script format supports typescript type erasure', async t => {
  const bundle = await generate('../demo/fortune.ts');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  t.notRegex(source, /string/);
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.fortune, 'outlook uncertain');
});

test('endo script supports reexporting typescript in typescript', async t => {
  const bundle = await generate('../demo/reexport-fortune-ts.ts');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.fortune, 'outlook uncertain');
});

test('endo script supports reexporting typescript in javascript', async t => {
  const bundle = await generate('../demo/reexport-fortune-ts.js');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.fortune, 'outlook uncertain');
});

test('endo script supports reexporting javascript in typescript', async t => {
  const bundle = await generate('../demo/reexport-meaning-js.ts');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.meaning, 42);
});

test('endo script supports reexporting javascript in javascript', async t => {
  const bundle = await generate('../demo/reexport-meaning-js.js');
  t.is(bundle.moduleFormat, 'endoScript');
  const { source } = bundle;
  const compartment = new Compartment();
  const ns = compartment.evaluate(source);
  t.is(ns.meaning, 42);
});

test.failing(
  'endo supports importing ts from ts with a js extension',
  async t => {
    t.log(`\
TypeScript with tsc encourages importing with the .js extension, even if
presumptively generated .js file does not exist but is presumed to be generated
from the corresponding .ts module. We do not yet implement this.`);
    const bundle = await generate('../demo/import-ts-as-js.ts');
    t.is(bundle.moduleFormat, 'endoScript');
    const { source } = bundle;
    const compartment = new Compartment();
    const ns = compartment.evaluate(source);
    t.is(ns.fortune, 'outlook uncertain');
  },
);

test('endo script format is smaller with blank comments', async t => {
  const bigBundle = await generate('../demo/meaning.js');
  const smallBundle = await generate('../demo/meaning.js', {
    elideComments: true,
  });
  const compartment = new Compartment();
  const ns = compartment.evaluate(smallBundle.source);
  t.is(ns.meaning, 42);
  t.assert(smallBundle.source.length < bigBundle.source.length);
});
