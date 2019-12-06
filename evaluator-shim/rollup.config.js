import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: 'dist/evaluator-shim.cjs.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: `dist/evaluator-shim.umd.js`,
        name: 'Evaluator',
        format: 'umd',
        sourcemap: true,
      },
      {
        file: `dist/evaluator-shim.esm.js`,
        format: 'esm',
        sourcemap: true,
      },
    ],
  },
  {
    input: 'src/main.js',
    output: [
      {
        file: `dist/evaluator-shim.umd.min.js`,
        name: 'Evaluator',
        format: 'umd',
        sourcemap: true,
      },
      {
        file: `dist/evaluator-shim.esm.min.js`,
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [terser()],
  },
];
