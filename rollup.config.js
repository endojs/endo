import minify from 'rollup-plugin-babel-minify';
import stripCode from 'rollup-plugin-strip-code';

export default () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const minfix = isProduction ? '.min' : '';

  const output = [
    {
      file: `dist/realms-shim.umd${minfix}.js`,
      name: 'Realm',
      format: 'umd',
      sourcemap: true
    },
    {
      file: `dist/realms-shim.esm${minfix}.js`,
      format: 'esm',
      sourcemap: true
    }
  ];

  const plugins = [
    stripCode({
      start_comment: 'START_TESTS_ONLY',
      end_comment: 'END_TESTS_ONLY'
    })
  ];

  if (isProduction) {
    plugins.push(
      minify({
        comments: false
      })
    );
  } else {
    output.push({
      file: 'dist/realms-shim.cjs.js',
      format: 'cjs',
      sourcemap: true
    });
  }

  return {
    input: 'src/main.js',
    output,
    plugins
  };
}
