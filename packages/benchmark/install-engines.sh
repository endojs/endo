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

# Retry an esvu install a few times to ride out intermittent flakes
# fetching the Moddable XS release on GitHub or the V8 canary build on
# Google's chromium-v8 GCS bucket (endojs/endo#3289). On every attempt
# we capture the combined output; on the final failure the captured
# output of the last attempt is what the caller prints before exit 1.
install_engine_with_retry() {
    engine=$1
    attempts=3
    delay=5
    i=1
    while [ "$i" -le "$attempts" ]; do
        if output=$(yarn dlx esvu install "$engine" 2>&1); then
            INSTALL_OUTPUT=$output
            return 0
        fi
        INSTALL_OUTPUT=$output
        if [ "$i" -lt "$attempts" ]; then
            echo "esvu install $engine attempt $i/$attempts failed; retrying in ${delay}s..."
            sleep "$delay"
        fi
        i=$((i + 1))
    done
    return 1
}

if are_engines_installed; then
    echo "Engines already installed. Skipping installation."
else
    echo "Installing engines..."
    install_engine_with_retry xs || INSTALL_STATUS_XS=$?
    INSTALL_OUTPU_XS=$INSTALL_OUTPUT
    install_engine_with_retry v8 || INSTALL_STATUS_V8=$?
    INSTALL_OUTPU_V8=$INSTALL_OUTPUT
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
