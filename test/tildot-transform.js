import '@agoric/install-ses';
import { test } from 'tape-promise/tape';
import bundleSource from '..';

test('tildot transform', async t => {
  try {
    const bundle = await bundleSource(
      `${__dirname}/../demo/tildot`,
      'getExport',
    );
    // console.log(bundle.source);
    t.equal(bundle.source.indexOf('~.'), -1);
    // this is overspecified (whitespace, choice of quotation marks), sorry
    t.notEqual(
      bundle.source.indexOf(
        `HandledPromise.applyMethod(bob, "foo", [arg1, arg2])`,
      ),
      -1,
    );
    t.notEqual(
      bundle.source.indexOf(
        `HandledPromise.applyMethod(carol, "bar", [message])`,
      ),
      -1,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
