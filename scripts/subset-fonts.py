#!/usr/bin/env python3
"""Self-hosted font subsets for the notebook theme.

Collects every CJK character used in web/src (vocab.ts, folio.ts, components) plus Latin, and writes
small WOFF2 files to web/src/lib/theme/fonts/. Vite fingerprints them into /assets, so the service
worker precaches them and the notebook keeps its type offline over Tailscale.

Usage (needs fonttools + brotli):
    python3 scripts/subset-fonts.py <dir-with-the-source-ttfs>

Sources (SIL OFL 1.1, github.com/google/fonts): ShipporiMinchoB1-{Medium,Bold,ExtraBold}.ttf,
ZenKakuGothicNew-{Regular,Medium,Bold}.ttf, YujiSyuku-Regular.ttf.
Re-run after adding a new kanji anywhere in web/src.
"""
import pathlib
import re
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "src"
OUT = SRC / "lib" / "theme" / "fonts"

CJK = re.compile(r"[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]")

LATIN = "".join(chr(c) for c in range(0x20, 0x7F)) + "".join(chr(c) for c in range(0xA0, 0x180))
PUNCT = "‘’“”–—…·•→←↑↓−×✓№′″‹›«»€£¥ǎǐǒǔāēīōūáéíóúàèìòùüǘǚǜ"


def used_cjk() -> str:
    chars: set[str] = set()
    for p in SRC.rglob("*"):
        if p.suffix in {".ts", ".svelte", ".css", ".html"} and "fonts" not in p.parts:
            chars.update(CJK.findall(p.read_text("utf8")))
    return "".join(sorted(chars))


def make(src_dir: pathlib.Path, ttf: str, out: str, text: str) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "palt", "vert", "vrt2", "vkrn", "vpal", "locl"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src_dir / ttf), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT / out), opts)
    print(f"{out:34} {(OUT / out).stat().st_size // 1024:4} KB")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src_dir = pathlib.Path(sys.argv[1]).expanduser()
    cjk = used_cjk()
    print(f"{len(cjk)} CJK glyphs: {cjk}")
    for w in ("Medium", "Bold", "ExtraBold"):
        make(src_dir, f"ShipporiMinchoB1-{w}.ttf", f"shippori-mincho-b1-{w.lower()}.woff2", LATIN + PUNCT + cjk)
    for w in ("Regular", "Medium", "Bold"):
        make(src_dir, f"ZenKakuGothicNew-{w}.ttf", f"zen-kaku-gothic-new-{w.lower()}.woff2", LATIN + PUNCT)
    make(src_dir, "YujiSyuku-Regular.ttf", "yuji-syuku-regular.woff2", cjk + "0123456789·")


if __name__ == "__main__":
    main()
