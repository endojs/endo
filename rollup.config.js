import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/transform-modules.umd.js',
        format: 'umd',
        name: 'makeModulesTransformer',
      },
      {
        file: 'dist/transform-modules.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/transform-modules.cjs.js',
        format: 'cjs',
      },
    ],
    plugins: [resolve()],
  },
];
