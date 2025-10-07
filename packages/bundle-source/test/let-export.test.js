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
  const { letVal, constVal, constValFromLet } = f();
  t.is(constVal, 42);
  t.is(constValFromLet, 'updated');
  t.is(letVal, 'updated');
});
