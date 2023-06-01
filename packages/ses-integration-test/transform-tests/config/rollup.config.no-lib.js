import replace from 'rollup-plugin-replace';
import multiEntry from 'rollup-plugin-multi-entry';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import sesPackage from 'ses/package.json';

export default [
  {
    input: {
      include: ['test/**/*.js', 'test/**/*.mjs'],
    },
    output: {
      file: 'transform-tests/output/test.no-lib.cjs.js',
      format: 'cjs',
    },
    external: ['ses', 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "import 'ses';": '', // NEVER
        'import "ses";': '', // AGAIN
      }),
      resolve({
        only: Object.keys(sesPackage.dependencies),
      }),
      commonjs(),
      multiEntry(),
    ],
  },
];
