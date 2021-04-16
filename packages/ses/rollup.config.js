import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'index.js',
    output: [
      {
        file: 'dist/ses.mjs',
        format: 'esm',
      },
      {
        file: 'dist/ses.cjs',
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: 'dist/ses.umd.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: 'dist/ses.umd.min.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
