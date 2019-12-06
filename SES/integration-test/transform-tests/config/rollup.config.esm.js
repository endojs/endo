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
      exclude: ['../test/test-require.js'],
    },
    output: {
      file: 'transform-tests/output/test.esm.js',
      format: 'esm',
    },
    external: ['tape', '@agoric/make-hardener'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import SES from '../src/index';": "import SES from 'ses';",
      }),
      resolve({
        only: ['@agoric/nat', 'ses'],
      }),
      multiEntry(),
    ],
  },
];

/* (!) Unresolved dependencies
https://rollupjs.org/guide/en#warning-treating-module-as-external-dependency
ses (imported by ../test/test-console.js, ../test/test-date.js, ../test/test-error.js, ../test/test-freeze.js, ../test/test-intl.js, ../test/test-math.js, ../test/test-nesting.js, ../test/test-regexp.js, ../test/test-removal.js, ../test/test-require.js, ../test/test.js)
created transform-tests/output/test.esm.js in 190ms
*/
