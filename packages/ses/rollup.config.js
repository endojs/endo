import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: 'dist/ses.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/ses.cjs.js',
        format: 'cjs',
      },
    ],
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: 'dist/ses.umd.js',
      format: 'umd',
      name: 'ses',
    },
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: 'dist/ses.umd.min.js',
      format: 'umd',
      name: 'ses',
    },
    plugins: [resolve(), terser()],
  },
];
