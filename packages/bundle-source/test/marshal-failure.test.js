/* global globalThis */
/* eslint-disable no-eval */
// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import * as url from 'url';
import bundleSource from '../src/index.js';

test('marshal error works', async t => {
  const entryPath = url.fileURLToPath(
    new URL(`../demo/endo/marshal.js`, import.meta.url),
  );
  const bundle = await bundleSource(entryPath, {
    format: 'nestedEvaluate',
  });
  t.is(bundle.moduleFormat, 'nestedEvaluate');
  const { source } = bundle;
  // Evaluate in the start compartment
  const evaluate = globalThis.eval;
  const f = evaluate(`(${source})`);
  const { result, marshalledError } = f();
  t.deepEqual(result, {
    body: '#{"#error":"boom","errorId":"error:anon-marshal#10001","name":"Error"}',
    slots: [],
  });
  t.like(marshalledError, { message: 'boom' });
});
