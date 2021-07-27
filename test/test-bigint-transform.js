import { test } from './prepare-test-env-ava.js';
import bundleSource from '../src/index.js';

test('bigint transform', async t => {
  const bundle = await bundleSource(
    new URL(`../demo/bigint`, import.meta.url).pathname,
    'getExport',
  );
  // console.log(bundle.source);
  t.assert(bundle.source.indexOf('37n') >= 0);
});
