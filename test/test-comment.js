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
      `${__dirname}/../demo/comments/trailing-comment.js`,
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

test('comment block opener', async t => {
  try {
    t.plan(1);
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/comments/block-opener.js`,
      'nestedEvaluate',
    );

    const success = () => t.pass('body runs correctly');

    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { nestedEvaluate, success });
    };
    // console.log(src1);
    const srcMap1 = `(${src1})`;
    nestedEvaluate(srcMap1)();
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('comment block closer', async t => {
  try {
    t.plan(1);
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/comments/block-closer.js`,
      'nestedEvaluate',
    );

    const success = () => t.pass('body runs correctly');

    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { nestedEvaluate, success });
    };
    // console.log(src1);
    const srcMap1 = `(${src1})`;
    nestedEvaluate(srcMap1)();
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
