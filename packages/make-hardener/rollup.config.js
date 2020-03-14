import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: 'dist/make-hardener.mjs',
        format: 'esm',
      },
      {
        file: 'dist/make-hardener.cjs',
        format: 'cjs',
      },
    ],
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: 'dist/make-hardener.umd.js',
      format: 'umd',
      name: 'make-hardener',
    },
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: 'dist/make-hardener.umd.min.js',
      format: 'umd',
      name: 'make-hardener',
    },
    plugins: [resolve(), terser()],
  },
];
