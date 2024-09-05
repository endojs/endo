#!/bin/bash
# Generates a report of all files that will be included in npm tarballs before
# and after some changes between the generation of a pair of file lists.
# Generate those lists with files.sh before and after pertientent code changes.
# Use homogenize-files.sh to copy the "files" entry in
# packages/skel/package.json over all other public packages.
set -ueo pipefail
echo '```diff'
comm -23 "$1" "$2" | sed 's/^/< /'
comm -13 "$1" "$2" | sed 's/^/> /'
echo '```'
