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
    private: null,
    description: "Description forthcoming.",
    keywords: [],
    author: "Endo contributors",
    license: "Apache-2.0",
    homepage: null,
    repository: null,
    bugs: null,
    type: null,
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
    main: "./index.js",
    module: "./index.js",
    exports: (
      if
        .exports["./package.json"]
      then
        (.exports // {}) + {
          ".": "./index.js",
        }
      else
        ({
          ".": "./index.js",
          "./package.json": "./package.json",
        })
      end
    ),
    scripts: ((.scripts // {}) + {
      "build": "exit 0",
      "prepack": "tsc --build jsconfig.build.json",
      "postpack": "git clean -f '\''*.d.ts*'\''",
      "test": "ava",
      "lint": "yarn lint:types && yarn lint:js",
      "lint:types": "tsc -p jsconfig.json",
      "lint:js": "eslint .",
      "lint-fix": "eslint --fix .",
    }) | to_entries | sort_by(.key) | from_entries,
    devDependencies: ((.devDependencies // {}) + {
      "@endo/init": "^0.5.56",
      "@endo/ses-ava": "^0.2.40",
      "ava": "^5.3.0",
      "babel-eslint": "^10.0.3",
      "eslint": "^8.46.0",
      "eslint-config-airbnb-base": "^15.0.0",
      "eslint-config-prettier": "^8.8.0",
      "eslint-plugin-eslint-comments": "^3.1.2",
      "eslint-plugin-import": "^2.27.5",
      "prettier": "^3.0.0",
      "typescript": "~5.1.3",
    }) | to_entries | sort_by(.key) | from_entries,
    files: ((.files // []) + [
      "LICENSE*",
      "SECURITY*",
      "src",
      "*.js",
      "*.ts"
    ]) | sort | unique,
    "publishConfig": {
      "access": "public",
    },
    "eslintConfig": {
      "extends": [
        "plugin:@endo/internal"
      ],
    },
    "ava": {
      "files": [
        "test/**/test-*.js"
      ],
      "timeout": "2m"
    }
  }' | git hash-object -w --stdin
)

git cat-file blob "$NEWPKGJSONHASH" >"$PKGJSON"

cp -r skel/* packages/"$NAME"
cp LICENSE packages/"$NAME"/LICENSE
