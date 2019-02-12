import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/ses-shim.js',
    exports: 'named',
    format: 'iife',
    name: 'SES',
    sourcemap: true,
  },
  plugins: [resolve()],
};
