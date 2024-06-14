#!/bin/bash

set -e # Exit on any non-zero status codes
set -u # Exit if attempting to use uninitialized variables
set -o pipefail # Exit on any failure in a pipe
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
