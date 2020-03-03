#!/bin/bash
set -ueo pipefail
DIR=$(dirname -- "${BASH_SOURCE[0]}")
npm run-script build
cd integration-test 
npm install "$(npm pack "$DIR/..")"
npm run create-test-file-no-lib-cjs
npm run create-test-file-browserified-tape
