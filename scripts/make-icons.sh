#!/usr/bin/env sh
# Rasterize the ORIGINAL icon SVGs into the committed PWA icons (designer-AC17).
# Needs `resvg` and a CJK serif font (Noto Serif CJK JP). Run from the repo root: sh scripts/make-icons.sh
set -eu
d=web/public/icons
resvg -w 192 -h 192 "$d/icon.svg" "$d/icon-192.png"
resvg -w 512 -h 512 "$d/icon.svg" "$d/icon-512.png"
resvg -w 512 -h 512 "$d/icon-maskable.svg" "$d/icon-maskable-512.png"
# iOS draws its own rounded mask: use the full-bleed variant for the touch icon
resvg -w 180 -h 180 "$d/icon-maskable.svg" "$d/apple-touch-icon.png"
ls -l "$d"
