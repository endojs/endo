/* global __dirname */
import path from 'path';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: path.resolve(__dirname, 'eventual-send.js'),
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
        name: 'EventualSend',
        globals: {
          '@agoric/eventual-send': 'EventualSend',
        },
      },
    ],
    plugins: [
      resolve({
        only: ['@agoric/eventual-send'],
      }),
    ],
  },
];
