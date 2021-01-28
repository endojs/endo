import '@agoric/install-ses';
import test from 'ava';
import bundleSource from '..';

test('bigint transform', async t => {
  const bundle = await bundleSource(`${__dirname}/../demo/bigint`, 'getExport');
  console.log(bundle.source);
  t.not(bundle.source.indexOf('37n'), -1);
});
