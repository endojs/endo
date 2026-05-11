#!/bin/bash
set -euo pipefail

# Generates application icons from the Familiar SVG for all platforms.
# Requires macOS with sips and iconutil (ships with Xcode CLI tools).
# Requires rsvg-convert (brew install librsvg) for SVG rendering.
# Requires ImageMagick (brew install imagemagick) for .ico generation.
#
# The icon files are checked-in under assets/.
# This script regenerates them when the source SVG changes.
#
# Usage: ./scripts/generate-icons.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAMILIAR_DIR="$SCRIPT_DIR/.."
ASSETS_DIR="$FAMILIAR_DIR/assets"
SVG_SOURCE="$FAMILIAR_DIR/art/familiar.svg"

if [ ! -f "$SVG_SOURCE" ]; then
  echo "Error: Source SVG not found at $SVG_SOURCE" >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR"

# Render SVG to 1024x1024 PNG
echo "🐈‍⬛ Rendering SVG to 1024x1024 PNG..."
if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert "$SVG_SOURCE" -o "$ASSETS_DIR/icon-1024.png" -w 1024 -h 1024
else
  echo "Error: rsvg-convert not found. Install with: brew install librsvg" >&2
  exit 1
fi

# Generate PNG sizes for macOS iconset
SIZES=(16 32 64 128 256 512)
for size in "${SIZES[@]}"; do
  echo "Generating ${size}x${size}..."
  sips -z "$size" "$size" "$ASSETS_DIR/icon-1024.png" --out "$ASSETS_DIR/icon-${size}.png" >/dev/null
done

# Build macOS iconset
echo "Generating icon.icns..."
ICONSET_DIR="$(mktemp -d)/Familiar.iconset"
mkdir -p "$ICONSET_DIR"

cp "$ASSETS_DIR/icon-16.png"   "$ICONSET_DIR/icon_16x16.png"
cp "$ASSETS_DIR/icon-32.png"   "$ICONSET_DIR/icon_16x16@2x.png"
cp "$ASSETS_DIR/icon-32.png"   "$ICONSET_DIR/icon_32x32.png"
cp "$ASSETS_DIR/icon-64.png"   "$ICONSET_DIR/icon_32x32@2x.png"
cp "$ASSETS_DIR/icon-128.png"  "$ICONSET_DIR/icon_128x128.png"
cp "$ASSETS_DIR/icon-256.png"  "$ICONSET_DIR/icon_128x128@2x.png"
cp "$ASSETS_DIR/icon-256.png"  "$ICONSET_DIR/icon_256x256.png"
cp "$ASSETS_DIR/icon-512.png"  "$ICONSET_DIR/icon_256x256@2x.png"
cp "$ASSETS_DIR/icon-512.png"  "$ICONSET_DIR/icon_512x512.png"
cp "$ASSETS_DIR/icon-1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil --convert icns --output "$ASSETS_DIR/icon.icns" "$ICONSET_DIR"
rm -rf "$(dirname "$ICONSET_DIR")"

# Generate .ico for Windows
if command -v magick >/dev/null 2>&1; then
  echo "Generating icon.ico..."
  magick convert "$ASSETS_DIR/icon-1024.png" -bordercolor white -border 0 \
    \( -clone 0 -resize 16x16 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 64x64 \) \
    -delete 0 -alpha off -colors 256 "$ASSETS_DIR/icon.ico"
elif command -v convert >/dev/null 2>&1; then
  echo "Generating icon.ico..."
  convert "$ASSETS_DIR/icon-1024.png" -bordercolor white -border 0 \
    \( -clone 0 -resize 16x16 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 64x64 \) \
    -delete 0 -alpha off -colors 256 "$ASSETS_DIR/icon.ico"
else
  echo "Warning: ImageMagick not found, skipping .ico generation."
  echo "Install with: brew install imagemagick"
fi

echo ""
echo "🐈‍⬛ Icons generated in $ASSETS_DIR:"
ls -lh "$ASSETS_DIR"/icon.{icns,ico,png} "$ASSETS_DIR"/icon-1024.png 2>/dev/null || true
