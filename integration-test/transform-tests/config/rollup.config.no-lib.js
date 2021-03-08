/* global __dirname */
/* eslint-disable-next-line import/no-unresolved */
import replace from 'rollup-plugin-replace';
import path from 'path';

export default [
  {
    input: '../test/test.js',
    output: {
      file: 'transform-tests/output/test.no-lib.cjs.js',
      format: 'cjs',
    },
    external: [path.resolve(__dirname, '../src/index.js'), 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import '../src/index';": '',
      }),
    ],
  },
];
