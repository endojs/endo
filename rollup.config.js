export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/eventual-send.umd.js',
        format: 'umd',
        name: 'EventualSend',
        globals: {
          '@agoric/harden': 'harden',
        },
      },
      {
        file: 'dist/eventual-send.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/eventual-send.cjs.js',
        format: 'cjs',
      },
    ],
    external: ['@agoric/harden'],
  },
];
