/* global globalThis */
/* eslint-disable no-eval */
// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

test.failing('let export', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/let-export.js`, import.meta.url),
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
    constErrorsVal,
    constValFromLet,
    constValFromFunc,
    constValFromClass,
    constValFromVar,
    letVal,
    funcVal,
    classVal,
    varVal,
  } = f();
  t.deepEqual(constErrorsVal, []);
  t.is(constValFromLet, 'updated');
  t.is(constValFromFunc(), 'updated');
  t.is(constValFromClass.value, 'updated');
  t.is(constValFromVar, 'updated');
  t.is(letVal, 'updated');
  t.is(funcVal(), 'updated');
  t.is(classVal.value, 'updated');
  t.is(varVal, 'updated');
});
