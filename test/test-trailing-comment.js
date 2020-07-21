/* global Compartment */
import '@agoric/install-ses';
import { test } from 'tape-promise/tape';
import bundleSource from '..';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test('trailing comment', async t => {
  try {
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/trailing-comment.js`,
      'nestedEvaluate',
    );

    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { nestedEvaluate });
    };
    // console.log(src1);
    const srcMap1 = `(${src1})`;
    const ex1 = nestedEvaluate(srcMap1)();

    // console.log(err.stack);
    t.equals(
      typeof ex1.buildRootObject,
      'function',
      `buildRootObject is exported`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
