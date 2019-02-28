export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/harden.umd.js',
        format: 'umd',
        name: 'Harden',
        globals: {
          '@agoric/make-hardener': 'makeHardener',
        },
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
    external: ['@agoric/make-hardener'],
  },
];
