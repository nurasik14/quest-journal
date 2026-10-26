#!/usr/bin/env python3
"""Turn 植物名實圖考 (Wu Qijun, 1848) woodblock scans into ink-only alpha masks for the herb of the day.

RGB = black, alpha = ink density, so the app tints them with CSS mask-image in either theme.

Usage (needs numpy + pillow):
    python3 scripts/make-herb-plates.py <dir-of-scans> web/public/decor/herbs

Scans: the full-size JPEGs of `File:植物名實圖考·<name>.jpg` on Wikimedia Commons (public domain),
saved as `<slug>.jpg` (or `herb-<slug>.jpg`). The slugs must match HERB_PLATES in
web/src/lib/theme/folio.ts; credits are in web/public/IMAGE_SOURCES.md.
"""
import os
import sys

import numpy as np
from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    raw, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    scans = sorted(f for f in os.listdir(raw) if f.endswith('.jpg'))
    # a mixed folder: only the herb-<slug>.jpg files are plates
    if any(f.startswith('herb-') for f in scans):
        scans = [f for f in scans if f.startswith('herb-')]
    for fn in scans:
        slug = fn.removesuffix('.jpg').removeprefix('herb-')
        a = np.asarray(Image.open(os.path.join(raw, fn)).convert('L')).astype(np.float32)
        # the paper tone varies per scan: estimate it from the brighter part of the page
        paper = np.percentile(a, 70)
        ink = np.clip((paper - 18 - a) / (paper - 18 - 40), 0, 1)  # 1 = full ink
        ink[ink < 0.08] = 0
        # drop a thin border (scan edges, frame lines)
        h, w = ink.shape
        m = int(min(h, w) * 0.025)
        ink[:m, :] = 0
        ink[-m:, :] = 0
        ink[:, :m] = 0
        ink[:, -m:] = 0
        ys, xs = np.nonzero(ink > 0.25)
        pad = 8
        ink = ink[max(0, ys.min() - pad):ys.max() + pad, max(0, xs.min() - pad):xs.max() + pad]
        alpha = Image.fromarray((ink * 255).astype(np.uint8), 'L')
        target_h = 560
        if alpha.height > target_h:
            alpha = alpha.resize((round(alpha.width * target_h / alpha.height), target_h), Image.LANCZOS)
        rgba = Image.new('RGBA', alpha.size, (0, 0, 0, 0))
        rgba.putalpha(alpha)
        out = os.path.join(out_dir, f'{slug}.webp')
        rgba.save(out, 'WEBP', quality=82, method=6)
        print(f'{slug:16} {alpha.size} {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    main()
