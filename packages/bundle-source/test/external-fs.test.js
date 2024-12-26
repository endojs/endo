import 'ses';
import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test(`external require('fs')`, async t => {
  t.plan(1);
  const { source: src1 } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/external-fs.js`, import.meta.url)),
    'nestedEvaluate',
  );

  const myRequire = mod => {
    t.is(mod, 'fs', 'required fs module');
    return { readFileSync() {} };
  };

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate, require: myRequire, assert });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})`;
  nestedEvaluate(srcMap1)();
});
