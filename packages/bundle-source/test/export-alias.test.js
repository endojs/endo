/* global globalThis */
/* eslint-disable no-eval */
// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

test.failing('export alias', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/exports.js`, import.meta.url),
  );
  const bundle = await bundleSource(entryPath, {
    format: 'nestedEvaluate',
  });
  t.is(bundle.moduleFormat, 'nestedEvaluate');
  const { source } = bundle;
  // Evaluate in the start compartment
  const evaluate = globalThis.eval;
  const f = evaluate(`(${source})`);
  const {
    bigint1,
    bigint2,
    bigint3,
    string1,
    string2,
    number1,
    number2,
    number3,
    number4,
  } = f();
  t.is(string1, 'some string');
  t.is(string2, 'some string');
  t.is(number1, 42);
  t.is(number2, 42);
  t.is(number3, 42);
  t.is(number4, 42);
  t.is(typeof bigint1, 'function');
  t.is(typeof bigint2, 'function');
  t.is(typeof bigint3, 'function');
  t.is(bigint1(), 37n);
  t.is(bigint2(), 37n);
  t.is(bigint3(), 37n);
});
