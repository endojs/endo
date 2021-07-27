import { rollup } from 'rollup';
import { resolve as pathResolve } from 'path';
import resolvePlugin from '@rollup/plugin-node-resolve';
import { test } from './prepare-test-env-ava.js';
import bundleSource from '../src/index.js';

test('explicit authority', async t => {
  const { moduleFormat } = await bundleSource(
    new URL(`../demo/dir1`, import.meta.url).pathname,
    'getExport',
    {
      rollup,
      resolvePlugin,
      pathResolve,
    },
  );
  t.is(moduleFormat, 'getExport', 'module format is getExport');
});
