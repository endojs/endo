#!/bin/bash
set -euo pipefail

# Prepares the familiar package directory for electron-forge make.
# Copies the correct Node binary and chat dist into the package.
#
# Usage: ./scripts/prepare-package.sh [target-os] [target-arch]
# Defaults to current platform if not specified.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAMILIAR_DIR="$SCRIPT_DIR/.."
REPO_ROOT="$FAMILIAR_DIR/../.."

# Determine target OS
if [ -n "${1:-}" ]; then
  TARGET_OS="$1"
else
  TARGET_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
fi

# Determine target arch
if [ -n "${2:-}" ]; then
  TARGET_ARCH="$2"
else
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) TARGET_ARCH="x64" ;;
    aarch64|arm64) TARGET_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac
fi

# Copy Node binary
BINARY_NAME="node-${TARGET_OS}-${TARGET_ARCH}"
NODE_SRC="$FAMILIAR_DIR/binaries/$BINARY_NAME"

if [ ! -f "$NODE_SRC" ]; then
  echo "Error: Node binary not found at $NODE_SRC" >&2
  echo "Run ./scripts/download-node.sh first." >&2
  exit 1
fi

echo "Copying Node binary: $BINARY_NAME -> node"
cp "$NODE_SRC" "$FAMILIAR_DIR/node"
chmod +x "$FAMILIAR_DIR/node"

# Copy chat dist
CHAT_DIST="$REPO_ROOT/packages/chat/dist"

if [ ! -d "$CHAT_DIST" ]; then
  echo "Error: Chat dist not found at $CHAT_DIST" >&2
  echo "Run 'yarn workspace @endo/chat build' first." >&2
  exit 1
fi

echo "Copying chat dist..."
mkdir -p "$FAMILIAR_DIR/dist/chat"
cp -r "$CHAT_DIST/"* "$FAMILIAR_DIR/dist/chat/"

echo "Package preparation complete."
