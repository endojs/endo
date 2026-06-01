#!/bin/sh

set -e

echo "yarn version: $(yarn --version)"

mkdir -p "$HOME/.bench-engines/bin"

if [ -f "$GITHUB_WORKSPACE/bin/xst" ]; then
  ln -s "$GITHUB_WORKSPACE/bin/xst" "$HOME/.bench-engines/bin"
fi

## Installing Engines and skipping if already installed ##
are_engines_installed() {
    [ -f "$HOME/.bench-engines/bin/xs" ] && [ -f "$HOME/.bench-engines/bin/v8" ]
}

# Download $1 to $2, retrying genuine transient network failures.
download() {
    curl -fSL --retry 3 --retry-all-errors --max-time 300 -o "$2" "$1"
}

install_xs() {
    # Install the latest Moddable release. Resolve the tag by following
    # the releases/latest redirect (avoids the GitHub API rate limit).
    # Fall back to a known-good pin if resolution is fragile.
    XS_VERSION=$(curl -fsSL -o /dev/null -w '%{redirect_url}' \
        https://github.com/Moddable-OpenSource/moddable/releases/latest \
        | sed -n 's#.*/releases/tag/\(.*\)$#\1#p')
    if [ -z "$XS_VERSION" ]; then
        XS_VERSION="8.1.1"
        echo "Could not resolve latest Moddable release; pinning XS_VERSION=$XS_VERSION"
    fi
    echo "Installing XS $XS_VERSION..."

    xs_zip="$tmp/xst-lin64.zip"
    download \
        "https://github.com/Moddable-OpenSource/moddable/releases/download/$XS_VERSION/xst-lin64.zip" \
        "$xs_zip"
    unzip -t "$xs_zip" >/dev/null || { echo "XS download is corrupt: $xs_zip" >&2; exit 1; }

    mkdir -p "$HOME/.bench-engines/engines/xs"
    unzip -o "$xs_zip" xst -d "$HOME/.bench-engines/engines/xs"
    [ -f "$HOME/.bench-engines/engines/xs/xst" ] || { echo "XS extract missing xst binary" >&2; exit 1; }
    chmod +x "$HOME/.bench-engines/engines/xs/xst"

    ln -sf "$HOME/.bench-engines/engines/xs/xst" "$HOME/.bench-engines/bin/xs"
}

install_v8() {
    # Resolve the latest version from the canary latest.json, then
    # download the matching linux64 release zip.
    V8_VERSION=$(curl -fsSL --max-time 60 \
        https://storage.googleapis.com/chromium-v8/official/canary/v8-linux64-rel-latest.json \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')
    [ -n "$V8_VERSION" ] || { echo "Could not resolve latest V8 version" >&2; exit 1; }
    echo "Installing V8 $V8_VERSION..."

    v8_zip="$tmp/v8-linux64-rel.zip"
    download \
        "https://storage.googleapis.com/chromium-v8/official/canary/v8-linux64-rel-$V8_VERSION.zip" \
        "$v8_zip"
    unzip -t "$v8_zip" >/dev/null || { echo "V8 download is corrupt: $v8_zip" >&2; exit 1; }

    mkdir -p "$HOME/.bench-engines/engines/v8"
    unzip -o "$v8_zip" -d "$HOME/.bench-engines/engines/v8"
    [ -f "$HOME/.bench-engines/engines/v8/d8" ] || { echo "V8 extract missing d8 binary" >&2; exit 1; }
    chmod +x "$HOME/.bench-engines/engines/v8/d8"

    # Launcher script: d8 finds icudtl.dat in its own directory; the
    # snapshot blob is passed explicitly.
    cat > "$HOME/.bench-engines/bin/v8" <<EOF
#!/usr/bin/env bash
"$HOME/.bench-engines/engines/v8/d8" --snapshot_blob="$HOME/.bench-engines/engines/v8/snapshot_blob.bin" "\$@"
EOF
    chmod 0755 "$HOME/.bench-engines/bin/v8"
}

if are_engines_installed; then
    echo "Engines already installed. Skipping installation."
else
    echo "Installing engines..."
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT

    install_xs
    install_v8

    are_engines_installed || { echo "Engine install finished but binaries are missing" >&2; exit 1; }
fi


## Making engine binaries executable ##
chmod +x "$HOME/.bench-engines/bin/xs" "$HOME/.bench-engines/bin/v8"

## Adding engines to eshost (if not already) ##
if ! yarn eshost --list | grep -q '"xs"'; then
    yarn eshost --add "xs" xs "$HOME/.bench-engines/bin/xs"
fi

if ! yarn eshost --list | grep -q '"v8"'; then
    yarn eshost --add "v8" d8 "$HOME/.bench-engines/bin/v8"
fi


yarn eshost --list
