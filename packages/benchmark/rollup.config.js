import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'test/index.test.js',
  output: {
    file: 'dist/bundle.js',
    format: 'iife',
    name: 'bundle',
    sourcemap: false,
  },
  plugins: [nodeResolve()],
};
