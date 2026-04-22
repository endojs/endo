#!/usr/bin/env bash

set -euo pipefail

set -x

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"

corepack enable --install-directory "$BIN_DIR"

yarn install --immutable

yarn build

cd ${SCRIPT_DIR}/../../cli

ln -sfv "$(pwd)/bin/endo" "$BIN_DIR/endo"

[ -x "$BIN_DIR/endo" ]
