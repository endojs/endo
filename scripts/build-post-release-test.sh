#! /bin/bash
set -e
DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR"
npm run-script build
cd packages/ses-integration-test
npm install --no-save $( npm pack .. )
npm run create-test-file-no-lib-cjs
npm run create-test-file-esm
npm run create-test-file-cjs
npm run create-test-file-browserified-tape
