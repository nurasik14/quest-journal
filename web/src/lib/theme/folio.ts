/**
 * Folio vocabulary: the book conventions the redesign borrows from real Chinese thread-bound herbals
 * (vertical brush labels, Chinese-numeral dates, the herb plate of the day).
 *
 * Every CJK character the UI can render lives in this file or in vocab.ts. `scripts/subset-fonts.py`
 * collects them from web/src and bakes them into the self-hosted font subsets, so a new glyph here means
 * re-running that script (otherwise the browser falls back to a system Mincho for the missing glyph).
 */

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/** 1 → 一, 10 → 十, 14 → 十四, 20 → 廿, 26 → 廿六, 31 → 卅一, 44 → 四十四 (old-book day numbering). */
export function kanjiNumber(n: number, { classical = false } = {}): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (classical && tens === 2) return '廿' + (ones ? DIGITS[ones] : '');
  if (classical && tens === 3) return '卅' + (ones ? DIGITS[ones] : '');
  return (tens === 1 ? '' : DIGITS[tens]) + '十' + (ones ? DIGITS[ones] : '');
}

const WEEKDAY_KANJI = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** Parts of a YYYY-MM-DD logical date, written the way a ledger page heading would be. */
export function folioDate(date: string): { month: string; day: string; weekday: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return {
    month: kanjiNumber(d.getMonth() + 1) + '月',
    day: kanjiNumber(d.getDate(), { classical: true }) + '日',
    weekday: WEEKDAY_KANJI[d.getDay()] + '曜'
  };
}

/** Vertical brush label per quest category: real materia-medica style headings, not decoration. */
export const CATEGORY_KANJI: Record<string, string> = {
  body: '養身',
  mind: '醒神',
  social: '閑話',
  creative: '筆墨',
  adventure: '遠行',
  outside: '遠行',
  care: '安神',
  rest: '安神',
  learning: '本草',
  treat: '甘味',
  chores: '雜務'
};

/** "第一方" = the first prescription of the page. The weekly commission is Jinshi's 依頼 (request). */
export function entryLabel(index: number | undefined, boss: boolean): string {
  if (boss) return '依頼';
  return index === undefined ? '方' : `第${kanjiNumber(index + 1)}方`;
}

/** Single brush character on each index tab of the notebook. */
export const NAV_KANJI: Record<string, string> = {
  today: '方',
  evening: '録',
  market: '市',
  archive: '苑',
  profile: '記'
};

/** Page titles in the margin of the other screens. */
export const PAGE_KANJI = {
  evening: '日録',
  market: '藥市',
  archive: '花苑',
  profile: '覚書',
  onboarding: '問診'
} as const;

/** The notebook's own title, written on the spine slip. */
export const BOOK_TITLE = '藥帖';

export interface HerbPlate {
  /** file stem in /decor/herbs/<slug>.webp */
  slug: string;
  han: string;
  pinyin: string;
  english: string;
  latin: string;
  /** One verifiable line about the herb, in Maomao's register (no medical advice). */
  note: string;
}

/**
 * Woodblock plates from Wu Qijun's 植物名實圖考 (Zhiwu mingshi tukao, 1848), public domain via Wikimedia
 * Commons. Converted to ink-only masks so they print in the theme's ink colour. See IMAGE_SOURCES.md.
 */
export const PLATE_SOURCE = '植物名實圖考 · Wu Qijun, 1848';

export const HERB_PLATES: readonly HerbPlate[] = [
  { slug: 'licorice', han: '甘草', pinyin: 'gāncǎo', english: 'Licorice root', latin: 'Glycyrrhiza uralensis', note: 'The great harmoniser: it turns up in a huge share of the classical formulas.' },
  { slug: 'aconite', han: '附子', pinyin: 'fùzǐ', english: 'Aconite', latin: 'Aconitum carmichaelii', note: 'Deadly raw, medicine only after long processing. The kind of root Maomao tastes anyway.' },
  { slug: 'ginseng', han: '人參', pinyin: 'rénshēn', english: 'Ginseng', latin: 'Panax ginseng', note: 'The man-shaped root, prized as a tonic and priced like silver.' },
  { slug: 'pinellia', han: '半夏', pinyin: 'bànxià', english: 'Pinellia', latin: 'Pinellia ternata', note: 'Named “half summer” for when it is dug. Toxic raw; always processed first.' },
  { slug: 'honeysuckle', han: '忍冬', pinyin: 'rěndōng', english: 'Honeysuckle', latin: 'Lonicera japonica', note: '“Endures winter.” Its flowers are sold as 金銀花, gold-and-silver.' },
  { slug: 'goji', han: '枸杞', pinyin: 'gǒuqǐ', english: 'Goji', latin: 'Lycium chinense', note: 'Red berries for soups and tea; the root bark is a different medicine.' },
  { slug: 'balloon-flower', han: '桔梗', pinyin: 'jiégěng', english: 'Balloon flower', latin: 'Platycodon grandiflorus', note: 'The root goes into remedies for coughs and sore throats.' },
  { slug: 'tree-peony', han: '牡丹', pinyin: 'mǔdān', english: 'Tree peony', latin: 'Paeonia suffruticosa', note: 'The flower Tang Chang’an went mad for; the root bark is the medicine.' },
  { slug: 'dong-quai', han: '當歸', pinyin: 'dāngguī', english: 'Dong quai', latin: 'Angelica sinensis', note: 'Its name reads “ought to return”; a classic herb for the blood.' },
  { slug: 'peony', han: '芍藥', pinyin: 'sháoyào', english: 'Chinese peony', latin: 'Paeonia lactiflora', note: 'Given at partings in the Book of Songs; the root eases cramping.' },
  { slug: 'poria', han: '茯苓', pinyin: 'fúlíng', english: 'Poria', latin: 'Wolfiporia extensa', note: 'A fungus that grows on buried pine roots, used to calm the spirit.' },
  { slug: 'mint', han: '薄荷', pinyin: 'bòhe', english: 'Field mint', latin: 'Mentha canadensis', note: 'A cooling leaf for hot heads and stuffy noses.' },
  { slug: 'astragalus', han: '黃耆', pinyin: 'huángqí', english: 'Astragalus', latin: 'Astragalus membranaceus', note: 'The “yellow elder” root, a staple tonic for tired people.' },
  { slug: 'sicklepod', han: '決明', pinyin: 'juémíng', english: 'Sicklepod', latin: 'Senna obtusifolia', note: 'The seeds “brighten the eyes”; roasted, they make a bitter tea.' },
  { slug: 'lycopus', han: '澤蘭', pinyin: 'zélán', english: 'Bugleweed', latin: 'Lycopus lucidus', note: 'A “marsh orchid” in name only: it is a mint, used to move the blood.' },
  { slug: 'daylily', han: '萱草', pinyin: 'xuāncǎo', english: 'Daylily', latin: 'Hemerocallis fulva', note: 'Also called 忘憂草, the grass that makes you forget your worries.' },
  { slug: 'plantain', han: '車前', pinyin: 'chēqián', english: 'Plantain', latin: 'Plantago asiatica', note: 'It grows in cart ruts, so it is named “before the cart”.' }
];

/** Same plate all day, a different one tomorrow (date string hash, so the server's date decides). */
export function plateFor(date: string): HerbPlate {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HERB_PLATES[h % HERB_PLATES.length]!;
}
