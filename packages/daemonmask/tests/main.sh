#!/bin/bash

set -e # Exit on any non-zero status codes
set -u # Exit if attempting to use uninitialized variables
set -o pipefail # Exit on any failure in a pipe

# This file should be executed from the project root directory
./tests/bundler.sh
echo ''
./tests/keyring.sh
echo ''
./tests/provider.sh
echo ''
./tests/wallet-infura.sh
echo ''
