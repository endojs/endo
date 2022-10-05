#!/bin/bash
#
# check-packages.sh performs a number of automated consistency checks to ensure
# that all public packages are ready to publish.

set -ueo pipefail
IFS=$'\n\t'

DIR=$(dirname -- "${BASH_SOURCE[0]}")
cd "$DIR/.."

EXIT=0

function assert() {
  ACTUAL=$(jq -r "$1" "$JSON")
  if [ "$ACTUAL" != "$2" ]; then
    echo "$PKG: fix $1 expected $2 actual $ACTUAL"
    EXIT=1
  fi
}

for JSON in $(find packages -depth 2 -name 'package.json'); do
  PKG=$(dirname "$JSON")
  if [ "$(jq .private "$JSON")" != true ]; then
    NAME=$(jq -r '.name | split("/") | last' "$JSON")
    assert .main "./dist/$NAME.cjs"
    assert .module "./src/main.js"
    assert .browser "./dist/$NAME.umd.js"
    assert .unpkg "./dist/$NAME.umd.js"
    assert .exports.import "./src/main.js"
    assert .exports.require "./dist/$NAME.cjs"
    assert .exports.browser "./dist/$NAME.umd.js"
    assert .scripts.clean "rm -rf dist"
    assert .scripts.build "rollup --config rollup.config.js"
    assert .scripts.lint "eslint ."
    assert '.scripts["lint-fix"]' "eslint --fix ."
    assert '.devDependencies["@rollup/plugin-node-resolve"]' '^6.1.0'
    assert '.devDependencies["rollup-plugin-terser"]' '^5.1.3'
    assert '.version | match("[0-9]+.[0-9]+.[0-9]+\\+1-dev") | . != null' true
    assert '(.files // []) | contains(["src", "dist", "LICENSE*"])' 'true'

    if [ ! -f "$PKG/src/main.js" ]; then
      echo "$PKG: src/main.js"
    fi

    if [ ! -f "$PKG/rollup.config.js" ]; then
      echo "$PKG: missing rollup.config.js"
    fi

    if ! diff "$JSON" <(jq '
      def sort_object: to_entries | sort_by(.key) | from_entries;

      if .dependencies
      then . + {dependencies: (.dependencies | sort_object)}
      else .
      end |

      if .devDependencies
      then . + {devDependencies: (.devDependencies | sort_object)}
      else .
      end

    ' "$JSON"); then
      echo "$PKG: ensure dependencies and devDependencies are sorted"
      EXIT=1
    fi

    if ! diff "$(dirname $JSON)/rollup.config.js" packages/ses/rollup.config.js; then
      echo "$PKG: ensure rollup.config.js is in sync with packages/ses/rollup.config.js"
      EXIT=1
    fi
  fi
done

exit "$EXIT"
