#!/bin/bash
set -ueo pipefail

# Accepts a dependency version map on stdin and updates all of the
# package.jsons in this workspace such that, if they depend on one of the named
# dependencies, it uses the version from the map.
# This is useful for consistent bulk updates over all packages.

DIR=$(dirname -- "${BASH_SOURCE[0]}")

VERSIONSHASH=$(git hash-object -w --stdin)

(
  echo package.json
  npm query .workspace |
  jq -r '.[].location | "\(.)/package.json"'
) | while read PACKAGEJSON; do
  PACKAGEJSONHASH=$(
    jq --slurpfile versions <(git cat-file blob "$VERSIONSHASH") '
      def update(name): if .[name] then {
        (name): [
          .[name] |
          to_entries[] |
          {
            key: .key,
            value: ($versions[0][.key] // .value)
          }
        ] | from_entries
      } else {} end;

      . +
      update("dependencies") +
      update("devDependencies") +
      update("peerDependencies")
    ' "$PACKAGEJSON" |
    git hash-object -w --stdin
  )
  git cat-file blob "$PACKAGEJSONHASH" > "$PACKAGEJSON"
done
