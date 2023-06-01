/* global require, module, __dirname */

const path = require('path');
const webpack = require('webpack');
const sesPackage = require('ses/package.json');

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
          Object.keys(sesPackage.dependencies).includes(resource)
        ) {
          return true;
        }
        return false;
      },
    }),
  ],
};
