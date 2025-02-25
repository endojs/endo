#!/bin/sh

set -e 

echo "yarn version: $(yarn --version)"

are_engines_installed() {
    [ -d "$HOME/.esvu/engines/xs" ] && [ -d "$HOME/.esvu/engines/v8" ]
}

if are_engines_installed; then
    echo "Engines already installed. Skipping installation."
else
    echo "Installing engines..."
    INSTALL_OUTPU_XS=$(yarn dlx esvu install xs 2>&1) || INSTALL_STATUS_XS=$?
    INSTALL_OUTPU_V8=$(yarn dlx esvu install v8 2>&1) || INSTALL_STATUS_V8=$?
fi

if [ -n "$INSTALL_STATUS_XS" ] || [ -n "$INSTALL_STATUS_V8" ]; then 
    if are_engines_installed; then
        echo "Engines installed successfully despite esvu error."
    else
        echo "Error installing XS or V8:"
        echo "$INSTALL_OUTPU_XS"
        echo "$INSTALL_OUTPU_V8"
        exit 1
    fi
fi


echo $(ls -la "$HOME/.esvu/engines")
echo $(ls -la "$HOME/.esvu/engines/xs")
echo $(ls -la "$HOME/.esvu/engines/v8")


chmod +x "$HOME/.esvu/engines/xs/xst"
chmod +x "$HOME/.esvu/engines/v8/d8"

yarn eshost --add "xs" xs "$HOME/.esvu/engines/xs/xst"
yarn eshost --add "v8" d8 "$HOME/.esvu/engines/v8/d8"

yarn eshost --list

yarn rollup -c

yarn eshost -h xs,v8 dist/bundle.js
