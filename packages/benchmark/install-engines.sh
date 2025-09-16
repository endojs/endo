#!/bin/sh

set -e 

echo "yarn version: $(yarn --version)"

mkdir -p "$HOME/.esvu/bin"

if [ -f "$GITHUB_WORKSPACE/bin/xst" ]; then
  ln -s "$GITHUB_WORKSPACE/bin/xst" "$HOME/.esvu/bin"
fi

## Installing Engines and skiping if already installed ##
are_engines_installed() {
    [ -f "$HOME/.esvu/bin/xs" ] && [ -f "$HOME/.esvu/bin/v8" ]
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


## Making engine binaries executable ##
chmod +x "$HOME/.esvu/bin/xs" "$HOME/.esvu/bin/v8"

## Adding engines to eshost (if not already) ##
if ! yarn eshost --list | grep -q '"xs"'; then
    yarn eshost --add "xs" xs "$HOME/.esvu/bin/xs"
fi

if ! yarn eshost --list | grep -q '"v8"'; then
    yarn eshost --add "v8" d8 "$HOME/.esvu/bin/v8"
fi


yarn eshost --list
