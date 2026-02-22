#!/bin/bash
set -euo pipefail

# Downloads a Node.js binary for the target platform into packages/familiar/binaries/.
# Usage: ./scripts/download-node.sh [node-version] [target-os] [target-arch]
# Defaults to current platform when target-os and target-arch are not specified.

NODE_VERSION="${1:-v20.18.1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../binaries"

# Determine target arch (use argument or detect from host)
if [ -n "${3:-}" ]; then
  ARCH="$3"
else
  HOST_ARCH="$(uname -m)"
  case "$HOST_ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $HOST_ARCH" >&2; exit 1 ;;
  esac
fi

# Determine target OS (use argument or detect from host)
if [ -n "${2:-}" ]; then
  OS="$2"
else
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$OS" in
    darwin|linux) ;;
    *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
  esac
fi

BINARY_NAME="node-${OS}-${ARCH}"
DEST="$BINARIES_DIR/$BINARY_NAME"

if [ -f "$DEST" ]; then
  echo "Already exists: $DEST"
  exit 0
fi

mkdir -p "$BINARIES_DIR"

TARBALL="node-${NODE_VERSION}-${OS}-${ARCH}.tar.gz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"

echo "Downloading Node.js ${NODE_VERSION} for ${OS}-${ARCH}..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL "$URL" -o "$TMPDIR/$TARBALL"
tar -xzf "$TMPDIR/$TARBALL" -C "$TMPDIR"

cp "$TMPDIR/node-${NODE_VERSION}-${OS}-${ARCH}/bin/node" "$DEST"
chmod +x "$DEST"

echo "Installed: $DEST"
ls -lh "$DEST"
