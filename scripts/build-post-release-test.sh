#! /bin/bash
set -e
DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR/.."
npm run-script build
cd packages/ses-integration-test
npm install --no-save --legacy-peer-deps \
  "$( npm pack ../env-options | tail -1 )" \
  "$( npm pack ../ses | tail -1 )"
npm run create-test-file-no-lib-cjs
npm run create-test-file-browserified-tape
