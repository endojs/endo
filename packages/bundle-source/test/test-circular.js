import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test('circular export', async t => {
  const { source: src1, sourceMap: map1 } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/circular/a.js`, import.meta.url)),
    'nestedEvaluate',
  );

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})\n${map1}`;
  const ex1 = nestedEvaluate(srcMap1)();

  // console.log(err.stack);
  t.is(ex1.default, 'Foo', `circular export is Foo`);
});
