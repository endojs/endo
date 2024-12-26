import { resolve as pathResolve } from 'path';
import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

test('explicit authority', async t => {
  const { moduleFormat } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/dir1`, import.meta.url)),
    'getExport',
    {
      pathResolve,
    },
  );
  t.is(moduleFormat, 'getExport', 'module format is getExport');
});
