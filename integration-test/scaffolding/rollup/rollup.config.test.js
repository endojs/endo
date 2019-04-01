import path from 'path';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: path.resolve(__dirname, 'ses.js'),
    output: [
      {
        file: path.resolve(__dirname, '../../bundles/rollup.js'),
        format: 'iife',
        name: 'SES',
      },
    ],
    plugins: [
      resolve({
        only: ['ses', '@agoric/make-hardener'],
      }),
    ],
  },
];
