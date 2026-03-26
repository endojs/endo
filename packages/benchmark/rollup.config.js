import { nodeResolve } from '@rollup/plugin-node-resolve';
import { transformSync } from 'amaro';

const stripTypesPlugin = {
  name: 'amaro-strip-types',
  transform(code, id) {
    if (!id.endsWith('.ts')) {
      return undefined;
    }
    return {
      code: transformSync(code, { mode: 'strip-only' }).code,
      map: null,
    };
  },
};

export default {
  input: 'test/index.test.js',
  output: {
    file: 'dist/bundle.js',
    format: 'iife',
    name: 'bundle',
    sourcemap: false,
  },
  plugins: [stripTypesPlugin, nodeResolve()],
};
