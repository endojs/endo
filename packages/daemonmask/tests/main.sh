#!/bin/bash

set -e
set -u
set -o pipefail

# This file should be executed from the project root directory
./tests/bundler.sh
echo ''
./tests/keyring.sh
echo ''
./tests/provider.sh
echo ''
./tests/wallet-infura.sh
echo ''
