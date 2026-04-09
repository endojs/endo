#!/bin/bash
# Generates a list of all the files that will be packed up for npm from all
# packages.
# Depends on GNU tar, which is gnu-tar in Homebrew, and revealed as gtar on the
# PATH.
set -ueo pipefail
TAR=$(command -v gtar || command -v tar)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$REPO_ROOT/dist"

# Build every workspace's tarball into dist/ via pack-all (which uses
# ts-node-pack for .ts packages and yarn pack for the rest).
yarn pack:all 1>&2

for TGZ in "$DIST"/*.tgz; do
  PKG_NAME="$(basename "$TGZ" .tgz)"
  # shellcheck disable=SC2016
  PKG="$PKG_NAME" "$TAR" xf "$TGZ" --to-command='echo "$PKG/${TAR_FILENAME#package/}"'
done | sort
