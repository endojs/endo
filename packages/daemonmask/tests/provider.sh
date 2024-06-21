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

endo make --UNCONFINED src/caplets/provider.js --name provider

endo eval "E(provider).init('${PROJECT_ID}')" provider
endo eval 'E(provider).request("eth_blockNumber")' provider
