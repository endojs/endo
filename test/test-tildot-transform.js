/* global __dirname */
import '@agoric/install-ses';
import test from 'ava';
import bundleSource from '..';

test('tildot transform', async t => {
  const bundle = await bundleSource(`${__dirname}/../demo/tildot`, 'getExport');
  // console.log(bundle.source);
  t.is(bundle.source.indexOf('~.'), -1);
  // this is overspecified (whitespace, choice of quotation marks), sorry
  t.not(
    bundle.source.indexOf(
      `HandledPromise.applyMethod(bob, "foo", [arg1, arg2])`,
    ),
    -1,
  );
  t.not(
    bundle.source.indexOf(
      `HandledPromise.applyMethod(carol, "bar", [message])`,
    ),
    -1,
  );
});
