#!/bin/sh

set -e 

echo $(yarn --version)

are_engines_installed() {
    [ -d "$HOME/.esvu/engines/xs" ] && [ -d "$HOME/.esvu/engines/v8" ]
}

if are_engines_installed; then
    echo "Engines already installed. Skipping installation."
else
    echo "Installing engines..."
    INSTALL_OUTPUT=$(yarn dlx esvu install xs,v8 2>&1) || INSTALL_STATUS=$?
fi

if [ -n "$INSTALL_STATUS" ]; then 
    if are_engines_installed; then
        echo "Engines installed successfully despite esvu error."
    else
        echo "Error installing XS or V8:"
        echo "$INSTALL_OUTPUT"
        exit 1
    fi
fi


ls -la "$HOME/.esvu/engines"
ls -la "$HOME/.esvu/engines/xs"
ls -la "$HOME/.esvu/engines/v8"


chmod +x "$HOME/.esvu/engines/xs/xst"
chmod +x "$HOME/.esvu/engines/v8/d8"

yarn eshost --add "xs" xs "$HOME/.esvu/engines/xs/xst"
yarn eshost --add "v8" d8 "$HOME/.esvu/engines/v8/d8"

yarn eshost --list

echo "Running eshost..."

yarn rollup -c

yarn eshost -h xs,v8 dist/bundle.js
