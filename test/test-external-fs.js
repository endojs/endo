/* global Compartment */
import '@agoric/install-ses';
import { test } from 'tape-promise/tape';
import bundleSource from '..';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test(`external require('fs')`, async t => {
  try {
    t.plan(1);
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/external-fs.js`,
      'nestedEvaluate',
    );

    const myRequire = mod => t.equals(mod, 'fs', 'required fs module');

    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { nestedEvaluate, require: myRequire });
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
