export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: 'dist/make-hardener.umd.js',
        format: 'umd',
        name: 'makeHardener',
      },
      {
        file: 'dist/make-hardener.cjs.js',
        format: 'cjs',
      },
    ],
  },
];
