import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

export default [
  {
    input: 'lib/captp.js',
    output: [
      {
        file: 'dist/captp.umd.js',
        format: 'umd',
        name: 'CapTP',
      },
      {
        file: 'dist/captp.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/captp.cjs.js',
        format: 'cjs',
      },
    ],
    plugins: [
      resolve(),
      commonjs({include: 'node_modules/**'}),
    ],
  },
];
