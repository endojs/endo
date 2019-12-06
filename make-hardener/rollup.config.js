export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/make-hardener.umd.js',
        format: 'umd',
        name: 'makeHardener',
      },
      {
        file: 'dist/make-hardener.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/make-hardener.cjs.js',
        format: 'cjs',
      },
    ],
  },
];
