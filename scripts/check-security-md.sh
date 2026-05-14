#!/bin/bash
#
# check-security-md.sh verifies that every workspace package has a
# SECURITY.md file and that all such files are byte-identical. The
# canonical body is whichever variant is present in the majority of
# packages.

set -ueo pipefail
IFS=$'\n\t'

DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR/.."

EXIT=0

# Collect packages that have a package.json (matches the existing
# check-packages.sh convention; ignores stub directories with no
# manifest such as packages/endo).
PKGS=()
for JSON in $(find packages -mindepth 2 -maxdepth 2 -name 'package.json' | sort); do
  PKGS+=("$(dirname "$JSON")")
done

# First pass: every package must have a SECURITY.md.
PRESENT=()
for PKG in "${PKGS[@]}"; do
  if [ ! -f "$PKG/SECURITY.md" ]; then
    echo "$PKG: missing SECURITY.md"
    EXIT=1
  else
    PRESENT+=("$PKG")
  fi
done

# Second pass: all SECURITY.md files must hash to the same value.
# The canonical hash is the one most packages use.
if [ "${#PRESENT[@]}" -gt 0 ]; then
  CANONICAL=$(
    for PKG in "${PRESENT[@]}"; do
      sha256sum "$PKG/SECURITY.md" | awk '{print $1}'
    done | sort | uniq -c | sort -rn | awk 'NR==1 {print $2}'
  )
  for PKG in "${PRESENT[@]}"; do
    HASH=$(sha256sum "$PKG/SECURITY.md" | awk '{print $1}')
    if [ "$HASH" != "$CANONICAL" ]; then
      echo "$PKG: SECURITY.md differs from canonical (sha256 $HASH vs $CANONICAL)"
      EXIT=1
    fi
  done
fi

exit "$EXIT"
