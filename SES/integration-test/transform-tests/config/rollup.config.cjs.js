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
      file: 'transform-tests/output/test.cjs.js',
      format: 'cjs',
    },
    external: ['tape', '@agoric/make-hardener'],
    plugins: [
      multiEntry(),
      replace({
        delimiters: ['', ''],
        "import SES from '../src/index';": "import SES from 'ses';",
      }),
      resolve({
        only: ['@agoric/nat', 'ses'],
      }),
    ],
  },
];
