/* global __dirname */
// TODO Remove babel-standalone preinitialization
// https://github.com/endojs/endo/issues/768
import '@agoric/babel-standalone';
import '@agoric/install-ses';
import test from 'ava';
import { rollup } from 'rollup';
import { resolve as pathResolve } from 'path';
import resolvePlugin from '@rollup/plugin-node-resolve';
import bundleSource from '..';

test('explicit authority', async t => {
  const { moduleFormat } = await bundleSource(
    `${__dirname}/../demo/dir1`,
    'getExport',
    {
      rollup,
      resolvePlugin,
      pathResolve,
    },
  );
  t.is(moduleFormat, 'getExport', 'module format is getExport');
});
