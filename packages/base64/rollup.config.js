import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import fs from 'fs';

const metaPath = new URL('package.json', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
const name = meta.name.split('/').pop();
const umd = meta.umd || name;

export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: `dist/${name}.mjs`,
        format: 'esm',
      },
      {
        file: `dist/${name}.cjs`,
        format: 'cjs',
      },
    ],
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'src/main.js',
    output: {
      file: `dist/${name}.umd.js`,
      format: 'umd',
      name: umd,
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'src/main.js',
    output: {
      file: `dist/${name}.umd.min.js`,
      format: 'umd',
      name: umd,
    },
    plugins: [resolve(), commonjs(), terser()],
  },
];
