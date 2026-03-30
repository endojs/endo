import { nodeResolve } from '@rollup/plugin-node-resolve';
import tsBlankSpace from 'ts-blank-space';

const tsBlankSpacePlugin = {
  name: 'ts-blank-space',
  transform(code, id) {
    if (!id.endsWith('.ts')) {
      return undefined;
    }
    return {
      code: tsBlankSpace(code),
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
  plugins: [tsBlankSpacePlugin, nodeResolve()],
};
