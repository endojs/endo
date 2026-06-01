#!/bin/sh

set -e 

echo "yarn version: $(yarn --version)"

are_engines_installed() {
    [ -f "$HOME/.bench-engines/bin/xs" ] && [ -f "$HOME/.bench-engines/bin/v8" ]
}


if ! are_engines_installed; then
    echo "xs and/or v8 not found in $HOME/.bench-engines/bin; please run 'yarn install-engines' to install them."
    exit 127
fi

yarn rollup -c

yarn eshost -h xs,v8 dist/bundle.js
