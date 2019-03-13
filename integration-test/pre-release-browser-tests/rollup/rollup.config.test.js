import path from 'path';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: path.resolve(__dirname, 'nat.js'),
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
        name: 'Nat',
        globals: {
          '@agoric/nat': 'Nat',
        },
      },
    ],
    plugins: [
      resolve({
        only: ['@agoric/nat'],
      }),
    ],
  },
];
