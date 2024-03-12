// @ts-check
import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

test('bigint transform', async t => {
  const bundle = await bundleSource(
    url.fileURLToPath(new URL(`../demo/bigint`, import.meta.url)),
    'getExport',
  );
  // console.log(bundle.source);
  t.assert(bundle.source.indexOf('37n') >= 0);
});
