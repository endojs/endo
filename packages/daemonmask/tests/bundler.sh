#!/bin/bash

set -e
set -u
set -o pipefail
set -x  # Print each command before execution

endo purge -f
endo start

endo make --UNCONFINED src/caplets/bundler.js --name bundler
