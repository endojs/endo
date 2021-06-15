/* global __dirname */
// TODO Remove babel-standalone preinitialization
// https://github.com/endojs/endo/issues/768
import '@agoric/babel-standalone';
import '@agoric/install-ses';
import test from 'ava';
import bundleSource from '../src/index.js';

test('bigint transform', async t => {
  const bundle = await bundleSource(`${__dirname}/../demo/bigint`, 'getExport');
  // console.log(bundle.source);
  t.assert(bundle.source.indexOf('37n') >= 0);
});
