/* eslint-disable-next-line import/no-unresolved */
import replace from 'rollup-plugin-replace';

export default [
  {
    input: '../test/test.js',
    output: {
      file: 'transform-tests/output/test.esm.js',
      format: 'esm',
    },
    external: ['@agoric/make-hardener', 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import makeHardener from '../src/index';":
          "import makeHardener from '@agoric/make-hardener';",
      }),
    ],
  },
];
