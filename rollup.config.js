import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

const name = 'base64';
const umd = 'Base64';

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
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: `dist/${name}.umd.js`,
      format: 'umd',
      name: umd,
    },
    plugins: [resolve()],
  },
  {
    input: 'src/main.js',
    output: {
      file: `dist/${name}.umd.min.js`,
      format: 'umd',
      name: umd,
    },
    plugins: [resolve(), terser()],
  },
];
