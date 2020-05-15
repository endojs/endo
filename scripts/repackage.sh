#!/bin/bash

# Updates or creates a package with the given name (idempotent).
# The name is the directory it will be housed in.
# The name will have @agoric/ in package.json by default, if the package is
# new.
#
# Usage: scripts/repackage.sh NAME
# Example: scripts/repackage.sh console

set -ueo pipefail

DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR/.."

NAME=$1
PKGJSON=packages/$NAME/package.json

mkdir -p "packages/$NAME/"{src,dist,test}

NEWPKGJSONHASH=$(
  if [ -f "$PKGJSON" ]; then
    cat "$PKGJSON"
  else
    echo {}
  fi | jq --arg name "$NAME" '{
    name: null,
    version: null,
    description: "Description forthcoming.",
    author: "Agoric",
    license: "Apache-2.0",
    type: null,
    main: null,
    module: null,
    browser: null,
    unpkg: null,
    exports: {},
    scripts: {},
    dependencies: {},
    devDependencies: {},
    files: []
  } + . + {
    name: (.name // "@agoric/\($name)"),
    version: "0.0.0+1-dev",
    type: "module",
    main: "./dist/\($name).cjs",
    module: "./src/main.js",
    browser: "./dist/\($name).umd.js",
    unpkg: "./dist/\($name).umd.js",
    exports: ((.exports // {}) + {
      import: "./src/main.js",
      require: "./dist/\($name).cjs",
      browser: "./dist/\($name).umd.js",
    }),
    scripts: ((.scripts // {}) + {
      prepublish: "yarn clean && yarn build",
      clean: "rm -rf dist",
      build: "rollup --config rollup.config.js",
      depcheck: "depcheck",
      test: "yarn build && tap --no-esm --no-coverage --reporter spec 'test/**/*.test.js'",
      lint: "eslint '"'**/*.js'"'",
      "lint-fix": "eslint --fix '"'**/*.js'"'",
    }) | to_entries | sort_by(.key) | from_entries,
    devDependencies: ((.devDependencies // {}) + {
      "@rollup/plugin-node-resolve": "^6.1.0",
      "rollup-plugin-terser": "^5.1.3",
      "tap": "14.10.5",
      "tape": "5.0.1",
    }) | to_entries | sort_by(.key) | from_entries,
    files: ((.files // []) + [
      "src",
      "dist",
      "LICENSE*"
    ]) | sort | unique
  }' | git hash-object -w --stdin
)

git cat-file blob "$NEWPKGJSONHASH" > "$PKGJSON"

cp packages/transform-module/rollup.config.js packages/"$NAME"/rollup.config.js
cp packages/transform-module/LICENSE packages/"$NAME"/LICENSE
touch packages/"$NAME"/README.md
touch packages/"$NAME"/NEWS.md
