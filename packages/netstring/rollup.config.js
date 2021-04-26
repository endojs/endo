import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'index.js',
    output: [
      {
        file: `dist/netstring.mjs`,
        format: 'esm',
      },
      {
        file: `dist/netstring.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: `dist/netstring.umd.js`,
      format: 'umd',
      name: 'Netstring',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'index.js',
    output: {
      file: `dist/netstring.umd.min.js`,
      format: 'umd',
      name: 'Netstring',
    },
    plugins: [resolve(), commonjs(), terser()],
  },

  {
    input: 'reader.js',
    output: [
      {
        file: `dist/netstring-reader.mjs`,
        format: 'esm',
      },
      {
        file: `dist/netstring-reader.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'reader.js',
    output: {
      file: `dist/netstring-reader.umd.js`,
      format: 'umd',
      name: 'NetstringReader',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'reader.js',
    output: {
      file: `dist/netstring-reader.umd.min.js`,
      format: 'umd',
      name: 'NetstringReader',
    },
    plugins: [resolve(), commonjs(), terser()],
  },

  {
    input: 'writer.js',
    output: [
      {
        file: `dist/netstring-writer.mjs`,
        format: 'esm',
      },
      {
        file: `dist/netstring-writer.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'writer.js',
    output: {
      file: `dist/netstring-writer.umd.js`,
      format: 'umd',
      name: 'NetstringWriter',
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'writer.js',
    output: {
      file: `dist/netstring-writer.umd.min.js`,
      format: 'umd',
      name: 'NetstringWriter',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
