# Image sources

Every raster image the app uses, with its source and license. Maintained by `quest-designer`.

> **Personal use only.** `web/public/stickers/*` (except `manifest.json`) and `web/public/decor/img/` are **gitignored**. Never commit, publish or redistribute them. Character art is © its rights holders (Natsu Hyuuga / Shufunotomo, Nekokurage / Square Enix, Itsuki Nanao / Shogakukan, TOHO / OLM, the anime production committee) and was saved from public MyAnimeList character pages for the owner's private use. Everything else below is public domain, CC0, CC BY or CC BY-SA. If the app is ever shared, keep the credits below and drop the character art.

Sources that were **not** used: the official anime site (kusuriyanohitorigoto.jp) and the Fandom wiki image CDN both serve a bot-challenge page to scripts, and we didn't try to get around it. The Jikan API timed out.

## Why these images (the "herbal notebook" redesign, 2026-10-27)

The series borrows from Tang court painting and Ming/Qing materia medica, so the decoration does too: court paintings of the period for the page bands, and real woodblock plates from a Qing herbal for the herb of the day. Stock tourist photos of the Qing Forbidden City, lanterns and moon gates were removed. Checked with `file`, re-encoded with ImageMagick, metadata stripped.

## Paintings and herbal pages: `web/public/decor/img/` (gitignored)

| File | Used for | Source | Author | License |
|---|---|---|---|---|
| `band-evening.webp` | Evening ledger band | [宮樂圖 *A Palace Concert*, Tang dynasty, National Palace Museum, Taipei](https://commons.wikimedia.org/wiki/File:A_palace_concert.jpg) | Anonymous, Tang dynasty | Public domain |
| `band-garden.webp` | Garden band | [簪花仕女圖 *Court Ladies Wearing Flowered Headdresses*, detail 2](https://commons.wikimedia.org/wiki/File:Zhou_Fang._Court_Ladies_Wearing_Flowered_Headdresses.Detail2.jpg) | Zhou Fang (attr.), Tang dynasty | Public domain |
| `hero-consorts.webp` | Onboarding hero | [簪花仕女圖, detail 1](https://commons.wikimedia.org/wiki/File:Zhou_Fang._Court_Ladies_Wearing_Flowered_Headdresses.Detail1.jpg) | Zhou Fang (attr.), Tang dynasty | Public domain |
| `loader-pestle.webp` | Loader (the round fan) | [搗練圖 *Court Ladies Preparing Newly Woven Silk*, women with pestles](https://commons.wikimedia.org/wiki/File:Court_ladies_pounding_silk_from_a_painting_(%E6%8D%A3%E7%BB%83%E5%9B%BE)_by_Emperor_Huizong.jpg) | Emperor Huizong of Song, after Zhang Xuan | Public domain |
| `band-notes.webp` | Notes (profile) band | [First edition of *Bencao Gangmu* 本草綱目, 1590](https://commons.wikimedia.org/wiki/File:First_edition_of_Bencao_Gangmu;_Chinese,_1590_Wellcome_L0039328.jpg) | Li Shizhen; photograph Wellcome Collection | **CC BY 4.0** ([terms](https://creativecommons.org/licenses/by/4.0/)). Credit: Wellcome Collection |
| `apothecary-drawers.webp` | Palace market header | [File:TCM herbs 3.jpg](https://commons.wikimedia.org/wiki/File:TCM_herbs_3.jpg) | ProjectManhattan | CC BY-SA 3.0 ([terms](https://creativecommons.org/licenses/by-sa/3.0)) |

Edits: art-directed crops (bands about 4:1 at 1200 px wide; the loader a square crop), re-encoded to WebP. The drawer photo is shared under the same license, as CC BY-SA requires.

## Herb plates: `web/public/decor/herbs/` (committed)

17 woodblock plates from **植物名實圖考** (*Zhiwu mingshi tukao*, "Illustrated investigation of the names and realities of plants"), Wu Qijun, 1848. **Public domain** (the author died in 1847; the scans are faithful reproductions). Source pages on Wikimedia Commons, `File:植物名實圖考·<name>.jpg`:

| File | Plate | Source |
|---|---|---|
| `licorice.webp` | 甘草 | [植物名實圖考·甘草.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·甘草.jpg) |
| `aconite.webp` | 附子 | [植物名實圖考·附子.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·附子.jpg) |
| `ginseng.webp` | 人參 | [植物名實圖考·人參.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·人參.jpg) |
| `pinellia.webp` | 半夏 | [植物名實圖考·半夏.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·半夏.jpg) |
| `honeysuckle.webp` | 忍冬 | [植物名實圖考·忍冬.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·忍冬.jpg) |
| `goji.webp` | 枸杞 | [植物名實圖考·枸杞.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·枸杞.jpg) |
| `balloon-flower.webp` | 桔梗 | [植物名實圖考·桔梗.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·桔梗.jpg) |
| `tree-peony.webp` | 牡丹 | [植物名實圖考·牡丹.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·牡丹.jpg) |
| `dong-quai.webp` | 當歸 | [植物名實圖考·當歸.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·當歸.jpg) |
| `peony.webp` | 芍藥 | [植物名實圖考·芍藥.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·芍藥.jpg) |
| `poria.webp` | 茯苓 | [植物名實圖考·茯苓.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·茯苓.jpg) |
| `mint.webp` | 薄荷 | [植物名實圖考·薄荷.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·薄荷.jpg) |
| `astragalus.webp` | 黃耆 | [植物名實圖考·黃耆.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·黃耆.jpg) |
| `sicklepod.webp` | 決明 | [植物名實圖考·決明.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·決明.jpg) |
| `lycopus.webp` | 澤蘭 | [植物名實圖考·澤蘭.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·澤蘭.jpg) |
| `daylily.webp` | 萱草 | [植物名實圖考·萱草.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·萱草.jpg) |
| `plantain.webp` | 車前 | [植物名實圖考·車前.jpg](https://commons.wikimedia.org/wiki/File:植物名實圖考·車前.jpg) |

Edits (`scripts/make-herb-plates.py`): converted to an ink-only alpha mask (paper → transparent, ink → opaque black), cropped to the drawing, 560 px tall, WebP. The app tints them with CSS `mask-image`, so they print in the theme's ink colour in light and dark mode. They are committed because they are public domain and contain no character art.

## Fonts: `web/src/lib/theme/fonts/` (committed)

Subsets made with `scripts/subset-fonts.py` from [google/fonts](https://github.com/google/fonts): **Shippori Mincho B1** (FONTDASU), **Zen Kaku Gothic New** (Yoshimichi Ohira), **Yuji Syuku** (Kinuta Font Factory). All SIL Open Font License 1.1.

## Character stickers: `web/public/stickers/` (personal use only)

| File | Character | Source image | Source page | License |
|---|---|---|---|---|
| `maomao-herb.webp` | Maomao | https://cdn.myanimelist.net/images/characters/6/343055.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-chew.webp` | Maomao | https://cdn.myanimelist.net/images/characters/15/508563.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-smug.webp` | Maomao | https://cdn.myanimelist.net/images/characters/13/508910.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-calm.webp` | Maomao | https://cdn.myanimelist.net/images/characters/12/525772.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-curious.webp` | Maomao | https://cdn.myanimelist.net/images/characters/16/371204.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-tired.webp` | Maomao | https://cdn.myanimelist.net/images/characters/11/505475.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `maomao-cozy.webp` | Maomao | https://cdn.myanimelist.net/images/characters/16/508913.jpg | https://myanimelist.net/character/155904/pics | © rights holders, personal use only |
| `jinshi-point.webp` | Jinshi | https://cdn.myanimelist.net/images/characters/8/528542.jpg | https://myanimelist.net/character/156096/pics | © rights holders, personal use only |
| `jinshi-smile.webp` | Jinshi | https://cdn.myanimelist.net/images/characters/12/511064.jpg | https://myanimelist.net/character/156096/pics | © rights holders, personal use only |
| `jinshi-serene.webp` | Jinshi | https://cdn.myanimelist.net/images/characters/11/543154.jpg | https://myanimelist.net/character/156096/pics | © rights holders, personal use only |
| `xiaolan-cheer.webp` | Xiaolan | https://cdn.myanimelist.net/images/characters/16/574075.jpg | https://myanimelist.net/character/178874/pics | © rights holders, personal use only |
| `xiaolan-smile.webp` | Xiaolan | https://cdn.myanimelist.net/images/characters/10/562528.jpg | https://myanimelist.net/character/178874/pics | © rights holders, personal use only |
| `luomen-kind.webp` | Luomen (Ruomen Han) | https://cdn.myanimelist.net/images/characters/16/525775.jpg | https://myanimelist.net/character/199481/pics | © rights holders, personal use only |
| `gaoshun-steady.webp` | Gaoshun | https://cdn.myanimelist.net/images/characters/9/525777.jpg | https://myanimelist.net/character/178876/pics | © rights holders, personal use only |
| `gyokuyou-smile.webp` | Gyokuyou | https://cdn.myanimelist.net/images/characters/12/574070.jpg | https://myanimelist.net/character/178869/pics | © rights holders, personal use only |
| `lihaku-grin.webp` | Lihaku | https://cdn.myanimelist.net/images/characters/14/527810.jpg | https://myanimelist.net/character/199478/pics | © rights holders, personal use only |
| `cat-calico.webp` | Palace cat (real photo, stands in for the cat Maomao) | [File:Calico kitten-Princess-01.jpg](https://commons.wikimedia.org/wiki/File:Calico_kitten-Princess-01.jpg) | Patricesf | Public domain |
| `cat-curious.webp` | Palace cat (real photo, stands in for the cat Maomao) | [File:6296Curious following cats in the Philippines 03.jpg](https://commons.wikimedia.org/wiki/File:6296Curious_following_cats_in_the_Philippines_03.jpg) | Judgefloro | CC0 |
| `cat-kitten.webp` | Palace cat (real photo, stands in for the cat Maomao) | [File:Golden tabby and white kitten n02.jpg](https://commons.wikimedia.org/wiki/File:Golden_tabby_and_white_kitten_n02.jpg) | Marie-Lan Nguyen | CC BY 2.5 |

Edits: cropped to 3:4 (360×480), re-encoded to WebP and metadata stripped.

## Fallbacks: `web/public/decor/*.svg`
Small single-colour SVGs (`currentColor`) drawn for this project. They're used only when an image above is missing, so the app still works on a fresh clone where the gitignored folders are empty.

## Adding your own
Put extra PNG/WebP files in `web/public/stickers/`, add them to `manifest.json` under the event you want, and add a row here.


## Original artwork (committed): `web/public/icons/`

Made for this project in M6 (designer-AC17, architect-AC13). These files are **committed**, so they contain no photos and no character art.

| File | Used for | Source | License |
|---|---|---|---|
| `icon.svg` | Source of the "any" icons | Original: a vermilion 済 seal on paper with a jade lattice rim, drawn as SVG shapes plus a 済 glyph set in Noto Serif CJK JP | Project artwork. The glyph outline comes from Noto Serif CJK (SIL Open Font License 1.1) |
| `icon-maskable.svg` | Source of the maskable and Apple icons | The same design, full-bleed, inside the central 80% safe zone | Same as above |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | PWA manifest, home-screen icon | Rasterized from the SVGs with `resvg` (`scripts/make-icons.sh`) | Same as above |
