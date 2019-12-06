/* eslint-disable-next-line import/no-unresolved */
import replace from 'rollup-plugin-replace';

export default [
  {
    input: '../test/test.js',
    output: {
      file: 'transform-tests/output/test.esm.js',
      format: 'esm',
    },
    external: ['@agoric/harden', 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import harden from '../src/index';":
          "import harden from '@agoric/harden';",
      }),
    ],
  },
];
