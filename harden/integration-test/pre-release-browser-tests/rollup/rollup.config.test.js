import path from 'path';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: path.resolve(__dirname, 'harden.js'),
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
        name: 'harden',
        globals: {
          '@agoric/harden': 'harden',
        },
      },
    ],
    plugins: [
      resolve({
        only: ['@agoric/harden', '@agoric/make-hardener'],
      }),
    ],
  },
];
