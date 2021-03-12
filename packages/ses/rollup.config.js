import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'ses.js',
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
    input: 'lockdown.js',
    output: [
      {
        file: 'dist/lockdown.cjs',
        format: 'cjs',
      },
    ],
  },
  {
    input: 'src/transforms.js',
    output: [
      {
        file: 'dist/transforms.cjs',
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'ses.js',
    output: {
      file: 'dist/ses.umd.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'lockdown.js',
    output: {
      file: 'dist/lockdown.umd.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'src/transforms.js',
    output: {
      file: 'dist/transforms.umd.js',
      format: 'umd',
      name: 'SesTransforms',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'ses.js',
    output: {
      file: 'dist/ses.umd.min.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
  {
    input: 'lockdown.js',
    output: {
      file: 'dist/lockdown.umd.min.js',
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
  {
    input: 'src/transforms.js',
    output: {
      file: 'dist/transforms.umd.min.js',
      format: 'umd',
      name: 'SesTransforms',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
