#! /bin/sh -e
yarn build
cd integration-test
yarn pack --filename latest-nat.tgz
yarn add file:./latest-nat.tgz
yarn create-test-file-no-lib-cjs
yarn create-test-file-esm
yarn create-test-file-cjs
yarn create-test-file-browserified-tape
yarn build:webpack
yarn build:browserify
yarn build:rollup
