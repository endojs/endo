import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'ses.js',
    output: [
      {
        file: `dist/ses.mjs`,
        format: 'esm',
      },
      {
        file: `dist/ses.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'compartment.js',
    output: [
      {
        file: `dist/compartment.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'lockdown.js',
    output: [
      {
        file: `dist/lockdown.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },

  {
    input: 'ses.js',
    output: {
      file: `dist/ses.umd.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'lockdown.js',
    output: {
      file: `dist/lockdown.umd.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'compartment.js',
    output: {
      file: `dist/compartment.umd.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs()],
  },

  {
    input: 'ses.js',
    output: {
      file: `dist/ses.umd.min.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
  {
    input: 'compartment.js',
    output: {
      file: `dist/compartment.umd.min.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
  {
    input: 'lockdown.js',
    output: {
      file: `dist/lockdown.umd.min.js`,
      format: 'umd',
      name: 'SES',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
