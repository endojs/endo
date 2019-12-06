/* eslint-disable-next-line import/no-unresolved */
import replace from 'rollup-plugin-replace';

/* eslint-disable-next-line import/no-unresolved */
import multiEntry from 'rollup-plugin-multi-entry';

/* eslint-disable-next-line import/no-unresolved */
import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: {
      include: ['../test/**/*.js'],
    },
    output: {
      file: 'transform-tests/output/test.no-lib.cjs.js',
      format: 'cjs',
    },
    external: ['ses', 'tape', '@agoric/make-hardener'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import SES from '../src/index';": '',
      }),
      resolve({
        only: ['@agoric/nat'],
      }),
      multiEntry(),
    ],
  },
];
