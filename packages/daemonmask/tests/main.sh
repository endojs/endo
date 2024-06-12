#!/bin/bash

set -e # Exit on any non-zero status codes
set -u # Exit if attempting to use uninitialized variables
set -o pipefail # Exit on any failure in a pipe
set -x  # Print each command before execution

# This file should be executed from the project root directory
./tests/keyring.sh
