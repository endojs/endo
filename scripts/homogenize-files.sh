#!/bin/bash

# This script copies the "files" block from the package scaffold
# (packages/skel) into every other package's package.json.
# Review the results carefuly: some package deliberately deviate from the
# common pattern, including "ses" with its extra "dist" directory.

set -ueo pipefail

FILES=$(jq .files packages/skel/package.json | git hash-object -w --stdin)

while read -r PKGJSON; do
  echo "$PKGJSON"
  NEWPKGJSON=$(git hash-object -w <(
    jq '. + ({files: $files[0]})' --slurpfile files <(git cat-file blob "$FILES") "$PKGJSON"
  ))
  git cat-file blob "$NEWPKGJSON" > "$PKGJSON"
done < <(
  npm query '.workspace:not([private])' |
  jq -r '.[].location | "\(.)/package.json"'
)
