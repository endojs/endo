import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/harden.umd.js',
        format: 'umd',
        name: 'harden',
      },
      {
        file: 'dist/harden.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/harden.cjs.js',
        format: 'cjs',
      },
    ],
    plugins: [resolve()],
  },
];
