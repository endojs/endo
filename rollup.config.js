import path from 'path';
import minify from 'rollup-plugin-babel-minify';
import stripCode from 'rollup-plugin-strip-code';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  input: path.resolve('src/main.js'),
  output: [
    {
      file: path.resolve(isProduction ? 'dist/realms-shim.umd.min.js' : 'dist/realms-shim.umd.js'),
      name: 'Realm',
      format: 'umd',
      sourcemap: true
    },
    {
      file: 'dist/realms-shim.esm.js',
      format: 'esm',
      sourcemap: true
    },
    {
      file: 'dist/realms-shim.cjs.js',
      format: 'cjs',
      sourcemap: true
    }
  ],
  plugins: [
    stripCode({
      start_comment: 'START_TESTS_ONLY',
      end_comment: 'END_TESTS_ONLY'
    }),
    isProduction
      ? minify({
          comments: false
        })
      : {}
  ]
};
