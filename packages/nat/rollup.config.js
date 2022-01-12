export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/nat.umd.js',
        format: 'umd',
        name: 'Nat',
      },
      {
        file: 'dist/nat.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/nat.cjs.js',
        format: 'cjs',
      },
    ],
  },
];
