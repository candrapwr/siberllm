#!/usr/bin/env bash
#
# Generate app icons (icns / ico / png) from build/icon.svg.
# Works on macOS using only built-in tools (sips + iconutil) plus a tiny
# PNG-from-SVG step via node (sharp not required). If rsvg-convert or
# ImageMagick is available, it is used for the SVG rasterization.
#
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="build/icon.svg"
ICONS_DIR="build/icon.iconset"
OUT_ICNS="build/icon.icns"
OUT_ICO="build/icon.ico"
OUT_PNG="build/icon.png"

[[ -f "$SRC" ]] || { echo "build/icon.svg tidak ditemukan"; exit 1; }

# pick a rasterizer
raster() { # size out
  local size="$1" out="$2"
  if command -v rsvg-convert >/dev/null; then
    rsvg-convert -w "$size" -h "$size" "$SRC" -o "$out"
  elif command -v magick >/dev/null; then
    magick -background none -resize "${size}x${size}" "$SRC" "$out"
  elif command -v convert >/dev/null; then
    convert -background none -resize "${size}x${size}" "$SRC" "$out"
  else
    echo "Butuh rsvg-convert atau ImageMagick untuk konversi SVG. Install: brew install librsvg"; exit 1
  fi
}

echo "Rasterizing SVG…"
rm -rf "$ICONS_DIR"; mkdir -p "$ICONS_DIR"
for s in 16 32 48 64 128 256 512 1024; do
  raster "$s" "$ICONS_DIR/tmp_${s}.png"
done

# macOS .iconset expects specific names (with @2x variants)
cp "$ICONS_DIR/tmp_16.png"   "$ICONS_DIR/icon_16x16.png"
cp "$ICONS_DIR/tmp_32.png"   "$ICONS_DIR/icon_16x16@2x.png"
cp "$ICONS_DIR/tmp_32.png"   "$ICONS_DIR/icon_32x32.png"
cp "$ICONS_DIR/tmp_64.png"   "$ICONS_DIR/icon_32x32@2x.png"
cp "$ICONS_DIR/tmp_128.png"  "$ICONS_DIR/icon_128x128.png"
cp "$ICONS_DIR/tmp_256.png"  "$ICONS_DIR/icon_128x128@2x.png"
cp "$ICONS_DIR/tmp_256.png"  "$ICONS_DIR/icon_256x256.png"
cp "$ICONS_DIR/tmp_512.png"  "$ICONS_DIR/icon_256x256@2x.png"
cp "$ICONS_DIR/tmp_512.png"  "$ICONS_DIR/icon_512x512.png"
cp "$ICONS_DIR/tmp_1024.png" "$ICONS_DIR/icon_512x512@2x.png"

echo "Building icon.icns…"
rm -f "$OUT_ICNS"
iconutil -c icns "$ICONS_DIR" -o "$OUT_ICNS"
echo "  ✓ $OUT_ICNS"

echo "Building icon.png (512)…"
cp "$ICONS_DIR/tmp_512.png" "$OUT_PNG"
echo "  ✓ $OUT_PNG"

# Windows .ico: ImageMagick can write multi-size ico; else skip (build on Windows).
if command -v magick >/dev/null || command -v convert >/dev/null; then
  echo "Building icon.ico…"
  (command -v magick >/dev/null && magick "$ICONS_DIR/tmp_16.png" "$ICONS_DIR/tmp_32.png" "$ICONS_DIR/tmp_48.png" "$ICONS_DIR/tmp_64.png" "$ICONS_DIR/tmp_128.png" "$ICONS_DIR/tmp_256.png" "$OUT_ICO" 2>/dev/null) \
    || convert "$ICONS_DIR/tmp_16.png" "$ICONS_DIR/tmp_32.png" "$ICONS_DIR/tmp_48.png" "$ICONS_DIR/tmp_64.png" "$ICONS_DIR/tmp_128.png" "$ICONS_DIR/tmp_256.png" "$OUT_ICO"
  echo "  ✓ $OUT_ICO"
else
  echo "  ! icon.ico dilewati (butuh ImageMagick). Build di Windows atau: brew install imagemagick"
fi

rm -rf "$ICONS_DIR"
echo "Selesai."
