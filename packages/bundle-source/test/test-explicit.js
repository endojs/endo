import { rollup } from 'rollup';
import { resolve as pathResolve } from 'path';
import resolvePlugin from '@rollup/plugin-node-resolve';
import url from 'url';
import { test } from '@endo/ses-ava/prepare-test-env-ava.js';
import bundleSource from '../src/index.js';

test('explicit authority', async t => {
  const { moduleFormat } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/dir1`, import.meta.url)),
    'getExport',
    {
      rollup,
      resolvePlugin,
      pathResolve,
    },
  );
  t.is(moduleFormat, 'getExport', 'module format is getExport');
});
