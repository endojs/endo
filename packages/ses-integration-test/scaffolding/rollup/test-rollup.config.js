/* global __dirname */

import path from 'path';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import sesPackage from 'ses/package.json';

export default [
  {
    input: 'ses',
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
      },
    ],
    plugins: [
      resolve({
        only: ['ses', ...Object.keys(sesPackage.dependencies)],
      }),
      commonjs(),
    ],
  },
];
