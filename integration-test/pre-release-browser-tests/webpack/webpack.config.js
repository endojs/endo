/* global __dirname module require */
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './transform-tests/output/test.esm.js',
  output: {
    path: path.resolve(__dirname, '../../bundles/'),
    filename: 'webpack.js',
  },
  node: {
    fs: 'empty',
  },
};
