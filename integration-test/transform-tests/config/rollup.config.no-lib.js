/* eslint-disable-next-line import/no-unresolved */
import replace from '@rollup/plugin-replace';
import path from 'path';

export default [
  {
    input: 'test-nat-tape.js',
    output: {
      file: 'transform-tests/output/test.no-lib.cjs.js',
      format: 'cjs',
    },
    external: [path.resolve(__dirname, '../src/index.js'), 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import { isNat, Nat } from '../src/index';": '',
      }),
    ],
  },
];
