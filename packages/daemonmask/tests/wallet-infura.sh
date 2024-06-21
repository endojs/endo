#!/bin/bash

set -e
set -u
set -o pipefail
set -x  # Print each command before execution

if [ -z "${PROJECT_ID}" ]; then
  echo "PROJECT_ID is required."
  exit 1
fi

endo purge -f
endo start

endo make --UNCONFINED src/caplets/bundler.js --name bundler
endo make --UNCONFINED src/caplets/wallet.js --name wallet --powers AGENT

endo eval "E(wallet).init( \
  'test test test test test test test test test test test ball', \
  { projectId: '${PROJECT_ID}' } \
)" wallet
endo eval "E(wallet).getAddresses()" wallet
endo eval "E(wallet).request('eth_blockNumber')" wallet
