#!/bin/bash
# Generates a list of all the files that will be packed up for npm from all
# packages.
# Depends on GNU tar, which is gnu-tar in Homebrew, and revealed as gtar on the
# PATH.
set -ueo pipefail
TAR=$(command -v gtar || command -v tar)
while read -r PKG; do
  (cd "$PKG"; yarn pack 1>&2)
  # shellcheck disable=SC2097,SC2098,SC2016
  PKG="$PKG" "$TAR" xf "$PKG/package.tgz" --to-command='echo "$PKG/${TAR_FILENAME#package/}"'
done < <(npm query '.workspace:not([private])' | jq -r '.[].location') |
sort
