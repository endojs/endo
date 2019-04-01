const path = require('path');
// eslint-disable-next-line import/no-unresolved
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: './transform-tests/output/test.esm.js',
  output: {
    path: path.resolve(__dirname, '../../bundles/'),
    filename: 'webpack.js',
  },
  node: {
    fs: 'empty',
  },
  plugins: [
    new webpack.IgnorePlugin({
      checkContext(_context) {
        return true;
      },
      checkResource(resource) {
        if (
          resource === 'foo' ||
          resource === 'unknown' ||
          resource === '@agoric/harden'
        ) {
          return true;
        }
        return false;
      },
    }),
  ],
};
