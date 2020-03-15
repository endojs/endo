#! /bin/sh -e
npm run-script build
cd packages/ses-integration-test 
npm install $( npm pack ../ses )
npm run create-test-file-no-lib-cjs
npm run create-test-file-esm
npm run create-test-file-cjs
npm run create-test-file-browserified-tape
npm run build:webpack
npm run build:browserify
npm run build:rollup
npm run build:parcel
