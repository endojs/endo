import replace from '@rollup/plugin-replace';

export default [
  {
    input: 'test-nat-tape.js',
    output: {
      file: 'transform-tests/output/test.esm.js',
      format: 'esm',
    },
    external: ['@agoric/nat', 'tape'],
    plugins: [
      replace({
        delimiters: ['', ''],
        "'../src/index';": "'@agoric/nat';",
      }),
    ],
  },
];
