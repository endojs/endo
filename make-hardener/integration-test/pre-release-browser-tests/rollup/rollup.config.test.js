import path from 'path';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: path.resolve(__dirname, 'make-hardener.js'),
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
        name: 'makeHardener',
        globals: {
          '@agoric/make-hardener': 'makeHardener',
        },
      },
    ],
    plugins: [
      resolve({
        only: ['@agoric/make-hardener'],
      }),
    ],
  },
];
