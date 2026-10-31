# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11", "fonttools>=4.50", "brotli>=1.1"]
# ///
"""Build the small decorative images used by README.md (docs/readme/).

Everything here is original or public domain: the 1848 herb plates in
web/public/decor/herbs/, the app's own SVG motifs and its OFL fonts. No
character art is used (that is personal-use only and never committed).

    uv run scripts/make-readme-art.py

Needs `rsvg-convert` (librsvg) for the SVG motifs.
"""

from __future__ import annotations

import io
import random
import subprocess
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "readme"
FONTS = ROOT / "web" / "src" / "lib" / "theme" / "fonts"
HERBS = ROOT / "web" / "public" / "decor" / "herbs"
DECOR = ROOT / "web" / "public" / "decor"

# Tokens from docs/design/design-system.md
THEMES = {
    "light": dict(bg="#f3ead6", ink="#2a251f", muted="#5b5246", seal="#ad3326", rule="#c4685a", grain=(90, 70, 40)),
    "dark": dict(bg="#15120e", ink="#ece3cb", muted="#b3a993", seal="#e3786a", rule="#b85a4d", grain=(236, 227, 203)),
}
GOLD = "#b8913f"


def rgb(hex_: str) -> tuple[int, int, int]:
    h = hex_.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    """Load one of the app's woff2 subsets (decompressed in memory)."""
    tt = TTFont(FONTS / f"{name}.woff2")
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def tint(mask: Image.Image, color: str, alpha: float = 1.0) -> Image.Image:
    """Colour an alpha mask: RGBA image in `color`, opacity = mask * alpha."""
    a = mask.getchannel("A") if mask.mode == "RGBA" else mask.convert("L")
    a = a.point(lambda v: int(v * alpha))
    out = Image.new("RGBA", a.size, rgb(color) + (0,))
    out.putalpha(a)
    return out


def svg(name: str, height: int) -> Image.Image:
    """Rasterise one of the app's currentColor SVG motifs to a black alpha mask."""
    png = subprocess.run(
        ["rsvg-convert", "-h", str(height), str(DECOR / f"{name}.svg")],
        check=True,
        capture_output=True,
    ).stdout
    return Image.open(io.BytesIO(png)).convert("RGBA")


def herb(name: str, height: int) -> Image.Image:
    im = Image.open(HERBS / f"{name}.webp").convert("RGBA")
    w = round(im.width * height / im.height)
    return im.resize((w, height), Image.Resampling.LANCZOS)


def grain(size: tuple[int, int], color: tuple[int, int, int], seed: int, amount: int = 14) -> Image.Image:
    """Sparse fibre speckle so flat fills read as paper."""
    rnd = random.Random(seed)
    layer = Image.new("RGBA", size, color + (0,))
    d = ImageDraw.Draw(layer)
    w, h = size
    for _ in range(w * h // 260):
        x, y = rnd.randrange(w), rnd.randrange(h)
        d.point((x, y), fill=color + (rnd.randrange(4, amount),))
    for _ in range(w // 9):  # long fibres
        x, y = rnd.randrange(w), rnd.randrange(h)
        dx, dy = rnd.randint(-22, 22), rnd.randint(-6, 6)
        d.line((x, y, x + dx, y + dy), fill=color + (rnd.randrange(4, amount // 2 + 5),), width=1)
    return layer


def seal(size: int, color: str, paper: str, glyph: str = "藥", seed: int = 4) -> Image.Image:
    """A hand-pressed square vermilion chop with the glyph knocked out (白文印)."""
    s = size * 2  # draw at 2x, downsample for soft edges
    ink = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(ink)
    pad = s // 14
    d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=s // 16, fill=255)
    f = font("yuji-syuku-regular", int(s * 0.66))
    box = d.textbbox((0, 0), glyph, font=f)
    gx = (s - (box[2] - box[0])) / 2 - box[0]
    gy = (s - (box[3] - box[1])) / 2 - box[1]
    d.text((gx, gy), glyph, font=f, fill=0)
    # pressed-ink texture: knock random specks out of the red, rough the edge
    rnd = random.Random(seed)
    speck = Image.new("L", (s, s), 255)
    sd = ImageDraw.Draw(speck)
    for _ in range(s * 3):
        x, y, r = rnd.randrange(s), rnd.randrange(s), rnd.choice((1, 1, 2, 3))
        sd.ellipse((x - r, y - r, x + r, y + r), fill=rnd.randrange(0, 160))
    ink = ImageChops.multiply(ink, speck.filter(ImageFilter.GaussianBlur(0.6)))
    a = ink.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), rgb(color) + (0,))
    out.putalpha(a.point(lambda v: int(v * 0.93)))
    return out.rotate(-4, resample=Image.Resampling.BICUBIC, expand=True)


def double_rule(d: ImageDraw.ImageDraw, w: int, h: int, color: str) -> None:
    """四周雙邊: the thick-and-thin border of a woodblock page."""
    c = rgb(color)
    d.rectangle((18, 18, w - 19, h - 19), outline=c + (255,), width=5)
    d.rectangle((31, 31, w - 32, h - 32), outline=c + (200,), width=2)


def banner(theme: str) -> Image.Image:
    t = THEMES[theme]
    W, H = 1600, 380
    im = Image.new("RGBA", (W, H), rgb(t["bg"]) + (255,))
    im.alpha_composite(grain((W, H), t["grain"], seed=7, amount=22 if theme == "light" else 12))

    # herb plates faint in the two lower corners, like a page's margin drawing
    left = tint(herb("ginseng", 330), t["ink"], 0.17 if theme == "light" else 0.14)
    im.alpha_composite(left, (52, H - left.height - 36))
    right = tint(herb("honeysuckle", 300), t["ink"], 0.15 if theme == "light" else 0.12)
    right = right.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im.alpha_composite(right, (W - right.width - 50, H - right.height - 36))

    d = ImageDraw.Draw(im)
    double_rule(d, W, H, t["rule"])

    # the 版心 strip: a vertical margin label as in a thread-bound herbal
    cjk = ImageFont.truetype("/usr/share/fonts/google-noto-serif-cjk-fonts/NotoSerifCJK-Medium.ttc", 30, index=2)
    x0 = 282
    d.line((x0, 58, x0, H - 58), fill=rgb(t["rule"]) + (170,), width=2)
    d.line((x0 + 50, 58, x0 + 50, H - 58), fill=rgb(t["rule"]) + (170,), width=2)
    # fish-tail mark (魚尾)
    fy = 74
    d.polygon([(x0 + 2, fy), (x0 + 48, fy), (x0 + 48, fy + 22), (x0 + 25, fy + 12), (x0 + 2, fy + 22)], fill=rgb(t["rule"]) + (210,))
    for i, ch in enumerate("藥師手記"):
        d.text((x0 + 25, 132 + i * 44), ch, font=cjk, fill=rgb(t["muted"]) + (255,), anchor="mm")

    title = font("shippori-mincho-b1-extrabold", 118)
    sub = font("shippori-mincho-b1-medium", 35)
    tx = 382
    d.text((tx, 92), "Quest Journal", font=title, fill=rgb(t["ink"]) + (255,))
    d.text((tx + 4, 238), "An apothecary's ledger for small, real-life quests", font=sub, fill=rgb(t["muted"]) + (255,))
    # a thin gold rule with a tael-coin dot, as a title underline
    d.line((tx + 4, 300, tx + 520, 300), fill=rgb(GOLD) + (200,), width=2)
    d.ellipse((tx + 530, 294, tx + 542, 306), outline=rgb(GOLD) + (220,), width=2)

    chop = seal(124, t["seal"], t["bg"])
    im.alpha_composite(chop, (1240, 84))
    return im.convert("RGB")


def corner(name: str, theme: str, height: int = 240) -> Image.Image:
    """A herb plate in the theme's ink, for the right margin of a section."""
    return tint(herb(name, height), THEMES[theme]["ink"], 0.82)


def motif(name: str, color: str, height: int) -> Image.Image:
    return tint(svg(name, height), color)


def save(im: Image.Image, name: str) -> None:
    path = OUT / name
    im.save(path, optimize=True)
    print(f"{path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {path.stat().st_size // 1024} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for theme in THEMES:
        save(banner(theme), f"banner-{theme}.png")
        for h in ("ginseng", "goji", "mint", "licorice"):
            save(corner(h, theme), f"herb-{h}-{theme}.png")
        save(motif("cat", THEMES[theme]["ink"], 120), f"cat-{theme}.png")
    save(seal(150, THEMES["light"]["seal"], THEMES["light"]["bg"]), "seal.png")
    save(motif("sycee", GOLD, 64), "tael.png")


if __name__ == "__main__":
    main()
