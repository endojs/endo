#!/bin/bash

# Creates a package with the given name.
# The name is the directory it will be housed in.
# The name will implicitly have the @endo org prefix.
#
# Usage: scripts/create-package.sh NAME
# Example: scripts/create-package.sh console

set -ueo pipefail

DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR/.."

NAME=$1
PKGJSON=packages/$NAME/package.json

mkdir -p "packages/$NAME/"{src,dist,test}
(cd packages/skel; find . -print0 | xargs -0 tar c) |
  (cd "packages/$NAME"; tar x)

NEWPKGJSONHASH=$(
  jq --arg name "$NAME" '{
    name: null,
    version: null,
    private: null,
    description: null,
    keywords: [],
    author: "Endo contributors",
    license: "Apache-2.0",
    homepage: null,
    repository: null,
    bugs: null,
    type: null,
    main: null,
    module: null,
    exports: {},
    scripts: {},
    dependencies: {},
    devDependencies: {},
    files: [],
    publishConfig: null,
    eslintConfig: null,
    ava: null,
  } + . + {
    name: "@endo/\($name)",
    version: "0.1.0",
    homepage: (.homepage // "https://github.com/endojs/endo/tree/master/packages/\($name)#readme"),
    repository: (.repository + { directory: "packages/\($name)" }),
    scripts: ((.scripts // {}) | to_entries | sort_by(.key) | from_entries),
    dependencies: ((.dependencies // {}) | to_entries | sort_by(.key) | from_entries),
    devDependencies: ((.devDependencies // {}) | to_entries | sort_by(.key) | from_entries),
  }' "$PKGJSON" | git hash-object -w --stdin
)

git cat-file blob "$NEWPKGJSONHASH" > "$PKGJSON"

# update license to reflect the current year
BSD_SED="$(sed --help 2>&1 | sed 2q | grep -qe '-i ' && echo 1 || true)"
function sedi() {
  if [ -n "$BSD_SED" ]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}
sedi -e "s/\[yyyy\]\ \[name\ of\ copyright\ owner\]/$(date '+%Y') Endo Contributors/g" "packages/$NAME/LICENSE"
