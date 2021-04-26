import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'index.js',
    output: [
      {
        file: `dist/syrup.mjs`,
        format: 'esm',
      },
      {
        file: `dist/syrup.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: `dist/syrup.umd.js`,
      format: 'umd',
      name: 'Syrup',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: `dist/syrup.umd.min.js`,
      format: 'umd',
      name: 'Syrup',
    },
    plugins: [resolve(), commonjs(), terser()],
  },

  {
    input: 'encode.js',
    output: [
      {
        file: `dist/encode.mjs`,
        format: 'esm',
      },
      {
        file: `dist/encode.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'encode.js',
    output: {
      file: `dist/encode.umd.js`,
      format: 'umd',
      name: 'SyrupEncoder',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'encode.js',
    output: {
      file: `dist/encode.umd.min.js`,
      format: 'umd',
      name: 'SyrupEncoder',
    },
    plugins: [resolve(), commonjs(), terser()],
  },

  {
    input: 'decode.js',
    output: [
      {
        file: `dist/decode.mjs`,
        format: 'esm',
      },
      {
        file: `dist/decode.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'decode.js',
    output: {
      file: `dist/decode.umd.js`,
      format: 'umd',
      name: 'SyrupDecoder',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'decode.js',
    output: {
      file: `dist/decode.umd.min.js`,
      format: 'umd',
      name: 'SyrupDecoder',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
