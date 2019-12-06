import testBundler from './utility/test-bundler';

testBundler(
  'mock unpkg umd',
  '../../pre-release-browser-tests/mock-unpkg-umd/index.html',
);
testBundler('webpack', '../../pre-release-browser-tests/webpack/index.html');
testBundler('rollup', '../../pre-release-browser-tests/rollup/index.html');
testBundler('parcel', '../../bundles/parcel/index.html');
testBundler(
  'browserify',
  '../../pre-release-browser-tests/browserify/index.html',
);
