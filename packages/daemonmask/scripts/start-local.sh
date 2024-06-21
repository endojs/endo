#!/bin/bash

set -e
set -u
set -o pipefail

# Check if something is listening on 127.0.0.1:8545
# We're gonna assume that this is Hardhat.
if ! nc -zv 127.0.0.1 8545 -w 2; then
  echo "Error: Nothing is listening on 127.0.0.1:8545"
  exit 1
fi

endo purge -f

endo make --UNCONFINED src/caplets/bundler.js --name bundler
endo make --UNCONFINED src/caplets/wallet.js --name wallet --powers AGENT

endo eval "E(wallet).init( \
  'test test test test test test test test test test test ball', \
  { rpcUrl: 'http://127.0.0.1:8545/' } \
)" wallet

endo mkguest ui-handle ui-agent
endo send ui-handle "@wallet"
endo adopt --as ui-agent 0 wallet

endo install src/weblet.js \
  --name ui \
  --powers ui-agent \
  --listen 8920 \
  --open
