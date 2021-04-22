#!/bin/bash

# Updates or creates a package with the given name (idempotent).
# The name is the directory it will be housed in.
# The name will have @endo/ in package.json by default, if the package is
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
    keywords: [],
    author: "Endo contributors",
    license: "Apache-2.0",
    homepage: null,
    repository: null,
    bugs: null,
    type: null,
    parsers: null,
    main: null,
    module: null,
    browser: null,
    unpkg: null,
    types: null,
    exports: {},
    scripts: {},
    dependencies: {},
    devDependencies: {},
    files: [],
    publishConfig: null,
    eslintConfig: null,
    prettier: null,
    ava: null,
  } + . + {
    name: (.name // "@endo/\($name)"),
    version: (.version // "0.1.0"),
    homepage: (.homepage // "https://github.com/endojs/endo/tree/master/packages/\($name)#readme"),
    repository: {
      type: "git",
      url: "git+https://github.com/endojs/endo.git",
    },
    bugs: {
      url: "https://github.com/endojs/endo/issues",
    },
    type: "module",
    parsers: {"js": "mjs"},
    main: "./dist/\($name).cjs",
    module: "./index.js",
    browser: "./dist/\($name).umd.js",
    unpkg: "./dist/\($name).umd.js",
    types: "./index.d.ts",
    exports: (
      if
        .exports["./package.json"]
      then
        (.exports // {}) + {
          ".": ((.exports["."] // {}) + {
            import: "./index.js",
            require: "./dist/\($name).cjs",
            browser: "./dist/\($name).umd.js",
          })
        }
      else
        ({
          "./package.json": "./package.json",
          ".": ((.exports // {}) + {
            import: "./index.js",
            require: "./dist/\($name).cjs",
            browser: "./dist/\($name).umd.js",
          })
        })
      end
    ),
    scripts: ((.scripts // {}) + {
      "prepublish": "yarn clean && yarn build",
      "clean": "rm -rf dist",
      "build": "rollup --config rollup.config.js",
      "test": "ava",
      "cover": "nyc ava",
      "lint": "yarn lint:types && yarn lint:js",
      "lint:types": "tsc --build jsconfig.json",
      "lint:js": "eslint '"'*.js'"' '"'**/*.js'"' '"'test*/**.js'"'",
      "lint-fix": "eslint --fix '"'*.js'"' '"'**/*.js'"' '"'test*/**.js'"'",
    }) | to_entries | sort_by(.key) | from_entries,
    devDependencies: ((.devDependencies // {}) + {
      "@rollup/plugin-node-resolve": "^6.1.0",
      "@rollup/plugin-commonjs": "^13.0.0",
      "rollup-plugin-terser": "^5.1.3",
      "ava": "^3.12.1",
      "babel-eslint": "^10.0.3",
      "eslint": "^7.23.0",
      "eslint-config-airbnb-base": "^14.0.0",
      "eslint-config-prettier": "^6.9.0",
      "eslint-plugin-eslint-comments": "^3.1.2",
      "eslint-plugin-import": "^2.19.1",
      "eslint-plugin-prettier": "^3.1.2",
      "nyc": "^15.1.0",
      "prettier": "^1.19.1",
      "rollup": "1.31.0",
      "rollup-plugin-terser": "^5.1.3",
      "typescript": "^4.0.5",
      "ava": "^3.12.1",
      "nyc": "^15.1.0",
    }) | to_entries | sort_by(.key) | from_entries,
    files: ((.files // []) + [
      "src",
      "dist",
      "types",
      "LICENSE*"
    ]) | sort | unique,
    "publishConfig": {
      "access": "public",
    },
    "eslintConfig": {
      "extends": [
        "@agoric"
      ],
    },
    "prettier": {
      "trailingComma": "all",
      "singleQuote": true,
    },
    "ava": {
      "files": [
        "test/**/test-*.js"
      ],
      "timeout": "2m"
    }
  }' | git hash-object -w --stdin
)

git cat-file blob "$NEWPKGJSONHASH" > "$PKGJSON"

cp skel/index.d.ts packages/"$NAME"/index.d.ts
cp skel/rollup.config.js packages/"$NAME"/rollup.config.js
cp skel/jsconfig.json packages/"$NAME"/jsconfig.json
cp LICENSE packages/"$NAME"/LICENSE
touch packages/"$NAME"/README.md
touch packages/"$NAME"/NEWS.md
touch packages/"$NAME"/index.js
