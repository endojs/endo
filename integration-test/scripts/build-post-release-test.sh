#! /bin/sh -e
yarn build
cd integration-test 
yarn add $( yarn pack .. )
yarn create-test-file-no-lib-cjs
yarn create-test-file-browserified-tape
