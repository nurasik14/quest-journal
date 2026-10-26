/**
 * `bun run seed:demo <dir> [--today YYYY-MM-DD] [--seed N] [--broken]` (sprint M6 goal 27).
 *
 * Writes 30 synthetic ledger pages into a SCRATCH data dir through the real store writers, so every file passes
 * the day schema. Deterministic: the same `--seed` + `--today` give byte-identical files. The data exercises
 * every garden state (5 levels, gaps, unrated, private, partial-only, rating-only, let-go with reasons,
 * a backfilled page, long text, a page exactly one month back) and holds no real personal data and no care
 * language. No week files are written and nothing is committed or pushed.
 *
 * Safety (architect-AC20, psychologist-AC16): the target must be given explicitly (DATA_DIR / .env are never
 * read), must not resolve under ~/quest-data or inside this repo, and must be absent or empty. Otherwise it
 * exits 2 and writes nothing.
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { addDays, isValidDate, logicalDate } from "./clock";
import { assertDataDirOutsideRepo, ConfigError, realDataDir, realpathLoose } from "./config";
import { TARIFF, type Category, type Difficulty, type ReasonChip, type Status } from "./domain";
import { monthBack } from "./stats";
import { createStore } from "./store";

export const DEMO_DAYS = 30;
/** 30 pages over a 34-day window: one 3-day gap and one 1-day gap. */
const WINDOW = 34;
const GAP_IDX = new Set([10, 11, 12, 20]);

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PoolItem {
  title: string;
  category: Category;
}

// Synthetic, generic quest titles. None of them describe a real person.
const EASY: PoolItem[] = [
  { title: "Stretch for ten minutes", category: "body" },
  { title: "Walk around the block once", category: "body" },
  { title: "Drink a glass of water before lunch", category: "body" },
  { title: "Make a proper pot of tea", category: "care" },
];
const MEDIUM: PoolItem[] = [
  { title: "Read ten pages of a book", category: "mind" },
  { title: "Tidy one drawer", category: "mind" },
  { title: "Write down tomorrow's first task", category: "mind" },
  { title: "Do one practice problem", category: "learning" },
];
const HARD: PoolItem[] = [
  { title: "Watch one lecture and take notes", category: "learning" },
  { title: "Sketch the teacup on your desk", category: "creative" },
  { title: "Write four lines of a short poem", category: "creative" },
  { title: "Send a friend a message about a book", category: "social" },
];
const RARE: Record<number, PoolItem> = {
  4: { title: "Take a new street on the way home", category: "adventure" },
  16: { title: "Find a bench you've never sat on", category: "adventure" },
  25: { title: "Buy one small pastry and eat it slowly", category: "treat" },
};
const LONG_TITLE = "Copy one page of a recipe by hand, slowly, in your best writing"; // 60+ chars
const MOODS = ["calm", "curious", "cozy", "tired", "proud", "energized", "connected"];
const HIGHLIGHTS = [
  "The tea was exactly right.",
  "Finished the chapter I started last week.",
  "A quiet walk after dinner.",
  "The drawer is tidy and it feels good.",
  "Got the practice problem on the second try.",
  "A long chat over lunch.",
];
const LONG_HIGHLIGHT =
  "Spent the afternoon at the window with a notebook, sketching the teacup and the plant and the light moving " +
  "across the desk. Nothing about it was hard, and it still felt like the best hour of the week. Wrote a few lines " +
  "afterwards about why small, slow things are worth doing, then made more tea and kept going.";
const NOTES = ["", "", "Slow morning, better afternoon.", "Went to bed a little earlier.", "Rained most of the day."];
const GRATITUDE = ["", "Warm socks.", "A good playlist.", "The library being open late."];
const REASONS: ReasonChip[] = ["no_time", "not_feeling_it", "didnt_fit", "not_possible"];

export interface DemoDay {
  date: string;
  energy: number | null;
  satisfaction: number | null;
  mood: string[];
  private?: boolean;
  backfilled?: boolean;
  quests: { id: string; slot: number; title: string; category: Category; difficulty: Difficulty; status: Status; reason?: ReasonChip }[];
  highlight: string;
  notes: string;
  gratitude: string;
}

/** The pure plan: which pages exist and what they say. `end` = the last page's date (yesterday by default). */
export function planDemo(end: string, seed: number, monthAgo: string): DemoDay[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const ordinary = [5, 6, 6, 7, 7, 7, 8, 5, 6];
  const out: DemoDay[] = [];
  for (let i = 0; i < WINDOW; i++) {
    const date = addDays(end, i - (WINDOW - 1));
    if (GAP_IDX.has(i)) {
      r(); // keep the stream aligned regardless of gaps
      continue;
    }
    const slots: [PoolItem, Difficulty][] = [
      [pick(EASY), "easy"],
      [pick(MEDIUM), "medium"],
      [RARE[i] ?? pick(HARD), "hard"],
    ];
    if (i === 21) slots[1] = [{ title: LONG_TITLE, category: "creative" }, "medium"];
    const statuses: Status[] = slots.map(() => (r() < 0.78 ? "done" : r() < 0.5 ? "partial" : "let_go"));
    let satisfaction: number | null = pick(ordinary);
    let highlight = r() < 0.7 ? pick(HIGHLIGHTS) : "";
    const day: DemoDay = {
      date,
      energy: 2 + Math.floor(r() * 3),
      satisfaction,
      mood: r() < 0.6 ? [pick(MOODS)] : [],
      quests: [],
      highlight,
      notes: pick(NOTES),
      gratitude: pick(GRATITUDE),
    };
    // Special pages (index → role), chosen so every garden state appears exactly where a tester expects it.
    if (i === 8) {
      satisfaction = 2; // the one 1–2 day: an un-bloomed bud, never red
      statuses[2] = "let_go";
    }
    if (i === 15) satisfaction = 10; // the one 10
    if (i === 9) {
      satisfaction = 9;
      highlight = LONG_HIGHLIGHT;
    }
    if (i === 13) satisfaction = 4;
    if (i === 24) satisfaction = 3;
    if (i === 7) day.private = true;
    if (i === 14) {
      statuses.splice(0, 3, "partial", "partial", "open"); // partial-only page
    }
    if (i === 18 || i === 22 || i === 27) {
      satisfaction = null; // logged, no rating
      statuses[0] = "done";
    }
    if (i === 19) day.backfilled = true;
    if (date === monthAgo) {
      satisfaction = 8;
      highlight = "A slow breakfast and a page of reading in the sun.";
    }
    day.satisfaction = satisfaction;
    day.highlight = highlight;
    if (i === 17) {
      // rating-only page: no quests at all
      day.quests = [];
    } else {
      day.quests = slots.map(([p, difficulty], k) => {
        const status = statuses[k]!;
        return {
          id: `${date}-${k + 1}`,
          slot: k + 1,
          title: p.title,
          category: p.category,
          difficulty,
          status,
          ...(status === "let_go" ? { reason: REASONS[(i + k) % REASONS.length]! } : {}),
        };
      });
    }
    out.push(day);
  }
  return out;
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export interface SeedArgs {
  dir: string;
  today: string | null;
  seed: number;
  broken: boolean;
}

export function parseSeedArgs(argv: readonly string[]): SeedArgs | string {
  let dir: string | null = null;
  let today: string | null = null;
  let seed = 1;
  let broken = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--today") {
      const v = argv[++i];
      if (!v || !isValidDate(v)) return "--today needs a date like 2026-10-26";
      today = v;
    } else if (a === "--seed") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 0) return "--seed needs a whole number";
      seed = v;
    } else if (a === "--broken") {
      broken = true;
    } else if (a.startsWith("-")) {
      return `unknown option ${a}`;
    } else if (dir === null) {
      dir = a;
    } else {
      return "only one directory, please";
    }
  }
  if (dir === null) return "usage: bun run seed:demo <empty-scratch-dir> [--today YYYY-MM-DD] [--seed N] [--broken]";
  return { dir, today, seed, broken };
}

/** Refuse unsafe targets. Returns an error message, or null when the dir is safe to write. */
export function checkTarget(dir: string, home: string = homedir()): string | null {
  const abs = realpathLoose(resolve(dir));
  if (isWithin(abs, realpathLoose(realDataDir(home)))) return `refusing ${abs}: that's your real journal (~/quest-data)`;
  try {
    assertDataDirOutsideRepo(abs);
  } catch (e) {
    return e instanceof ConfigError ? `refusing ${abs}: it's inside the app repo` : String(e);
  }
  if (existsSync(abs)) {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return `refusing ${abs}: not a readable directory`;
    }
    if (entries.length > 0) return `refusing ${abs}: it isn't empty (seed:demo only writes into a fresh scratch dir)`;
  }
  return null;
}

export async function seedDemo(args: SeedArgs, now: Date = new Date(), tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<{ dir: string; dates: string[] }> {
  const dir = realpathLoose(resolve(args.dir));
  const today = args.today ?? logicalDate(now, tz, 4);
  const end = addDays(today, -1); // today stays unwritten, so Today/check-in can be tried on the demo data
  const days = planDemo(end, args.seed, monthBack(today));
  await mkdir(join(dir, "days"), { recursive: true });
  const store = createStore({ dataDir: dir });
  for (const d of days) {
    await store.updateDay(d.date, (draft) => {
      draft.date = d.date;
      draft.energy = d.energy;
      draft.satisfaction = d.satisfaction;
      draft.mood = d.mood;
      if (d.private) draft.private = true;
      if (d.backfilled) draft.backfilled = true;
      draft.generation = { source: "pool", model: null, at: `${d.date}T08:00:00Z` };
      draft.quests = d.quests.map((q) => ({
        id: q.id,
        slot: q.slot,
        title: q.title,
        why: "",
        category: q.category,
        difficulty: q.difficulty,
        coins: TARIFF[q.difficulty],
        status: q.status,
        feedback: null,
        source: "pool",
        completed_at: q.status === "done" || q.status === "partial" ? `${d.date}T13:00:00Z` : null,
        ...(q.reason ? { reason: q.reason } : {}),
      }));
      draft.highlight = d.highlight;
      draft.notes = d.notes;
      draft.gratitude = d.gratitude;
    });
  }
  const dates = days.map((d) => d.date);
  if (args.broken) {
    // One quarantined page on a gap date (a typo'd rating), to show the "can't be read" plot.
    const gap = addDays(end, 11 - (WINDOW - 1));
    await writeFile(join(dir, "days", `${gap}.md`), `---\ndate: ${gap}\nsatisfaction: 14\n---\n\n## Highlight\n\n## Notes\n\n## Gratitude\n`);
    dates.push(gap);
  }
  return { dir, dates: dates.sort() };
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseSeedArgs(argv);
  if (typeof args === "string") {
    console.error(`[seed:demo] ${args}`);
    return 2;
  }
  const refusal = checkTarget(args.dir);
  if (refusal) {
    console.error(`[seed:demo] ${refusal}`);
    return 2;
  }
  const out = await seedDemo(args);
  console.log(`[seed:demo] wrote ${out.dates.length} pages (${out.dates[0]} … ${out.dates.at(-1)}) into ${out.dir}`);
  console.log(`[seed:demo] try it: DATA_DIR=${out.dir} PORT=4399 SERVE_WEB=true AI_ENABLED=false bun server/src/index.ts`);
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`[seed:demo] failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
