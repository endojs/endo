#!/bin/sh

set -e

echo "yarn version: $(yarn --version)"

mkdir -p "$HOME/.engines/bin"

if [ -f "$GITHUB_WORKSPACE/bin/xst" ]; then
  ln -s "$GITHUB_WORKSPACE/bin/xst" "$HOME/.engines/bin"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

## Installing Engines and skipping if already installed ##
are_engines_installed() {
    [ -f "$HOME/.engines/bin/xs" ] && [ -f "$HOME/.engines/bin/v8" ]
}

# Download $1 to $2, retrying genuine transient network failures.
download() {
    curl -fSL --retry 3 --retry-all-errors --max-time 300 -o "$2" "$1"
}

install_xs() {
    # Install the latest Moddable release. Resolve the tag by following
    # the releases/latest redirect (avoids the GitHub API rate limit).
    # Fall back to a known-good pin if resolution is fragile.
    XS_VERSION=$(curl -fsSI \
        https://github.com/Moddable-OpenSource/moddable/releases/latest \
        | grep -i '^location:' \
        | tr -d '\r' \
        | sed -n 's#.*/releases/tag/##p')
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

    mkdir -p "$HOME/.engines/engines/xs"
    unzip -o "$xs_zip" xst -d "$HOME/.engines/engines/xs"
    [ -f "$HOME/.engines/engines/xs/xst" ] || { echo 'XS download missing file `xst`' >&2; exit 1; }
    chmod +x "$HOME/.engines/engines/xs/xst"
    "$HOME/.engines/engines/xs/xst" -v || { echo 'XS download file `xst` execution failed' >&2; exit 1; }

    ln -sf "$HOME/.engines/engines/xs/xst" "$HOME/.engines/bin/xs"
}

install_v8() {
    # Resolve the latest version from the canary latest.json, then
    # download the matching linux64 release zip.
    V8_VERSION=$(curl -fsSL --max-time 60 \
        https://storage.googleapis.com/chromium-v8/official/canary/v8-linux64-rel-latest.json \
        | jq -r .version)
    [ -n "$V8_VERSION" ] || { echo "Could not resolve latest V8 version" >&2; exit 1; }
    echo "Installing V8 $V8_VERSION..."

    v8_zip="$tmp/v8-linux64-rel.zip"
    download \
        "https://storage.googleapis.com/chromium-v8/official/canary/v8-linux64-rel-$V8_VERSION.zip" \
        "$v8_zip"
    unzip -t "$v8_zip" >/dev/null || { echo "V8 download is corrupt: $v8_zip" >&2; exit 1; }

    mkdir -p "$HOME/.engines/engines/v8"
    unzip -o "$v8_zip" -d "$HOME/.engines/engines/v8"
    [ -f "$HOME/.engines/engines/v8/d8" ] || { echo 'V8 download missing file `d8`' >&2; exit 1; }
    chmod +x "$HOME/.engines/engines/v8/d8"
    "$HOME/.engines/engines/v8/d8" -v </dev/null || { echo 'V8 download file `d8` execution failed' >&2; exit 1; }

    # Launcher script: d8 finds icudtl.dat in its own directory; the
    # snapshot blob is passed explicitly. Use relative traversal from $0
    # so the install is relocatable (the absolute $HOME is not baked in
    # at install time).
    cat > "$HOME/.engines/bin/v8" <<'EOF'
#!/bin/sh
engines_bin_dir="$(dirname "$0")"
engines_dir="$(dirname "$engines_bin_dir")"
"$engines_dir/engines/v8/d8" --snapshot_blob="$engines_dir/engines/v8/snapshot_blob.bin" "$@"
EOF
    chmod 0755 "$HOME/.engines/bin/v8"
}

if are_engines_installed; then
    echo "Engines already installed. Skipping installation."
else
    echo "Installing engines..."

    install_xs
    install_v8

    are_engines_installed || { echo "Engine install finished but binaries are missing" >&2; exit 1; }
fi


## Making engine binaries executable ##
chmod +x "$HOME/.engines/bin/xs" "$HOME/.engines/bin/v8"

## Adding engines to eshost (if not already) ##
if ! yarn eshost --list | grep -q '"xs"'; then
    yarn eshost --add "xs" xs "$HOME/.engines/bin/xs"
fi

if ! yarn eshost --list | grep -q '"v8"'; then
    yarn eshost --add "v8" d8 "$HOME/.engines/bin/v8"
fi


yarn eshost --list
