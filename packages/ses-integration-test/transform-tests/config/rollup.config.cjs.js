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
      file: 'transform-tests/output/test.cjs.js',
      format: 'cjs',
    },
    external: ['tape'],
    plugins: [
      multiEntry(),
      resolve({
        only: ['ses', ...Object.keys(sesPackage.dependencies)],
      }),
      commonjs(),
    ],
  },
];
