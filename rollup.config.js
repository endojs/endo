import resolve from 'rollup-plugin-node-resolve';

export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/transform-module.umd.js',
        format: 'umd',
        name: 'makeModuleTransformer',
      },
      {
        file: 'dist/transform-module.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/transform-module.cjs.js',
        format: 'cjs',
      },
    ],
    plugins: [resolve()],
  },
];
