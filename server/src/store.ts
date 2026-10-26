/**
 * File store for the data repo (DATA_DIR). Rules (architecture.md §2.1–2.2):
 * - Always read from disk; no in-memory cache.
 * - Every mutation runs under a per-file async mutex: read → parse → apply → validate → atomic write.
 * - Unknown frontmatter keys, unknown quest keys, preamble text and non-owned `## ` sections are preserved.
 *   Mutations are merged into the raw on-disk object as a diff, so untouched keys keep their order/format.
 * - Broken files are quarantined: reads and writes throw 422 StoreErrors and the bytes are never touched.
 * - Plain reads never write (in-memory normalization only: ids, `failed`→`let_go`, category aliases).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { z } from "zod";
import { isValidDate, isValidWeek } from "./clock";
import { assertSafeDataDir } from "./config";
import { CATEGORY_ALIASES, CURRENT_SCHEMA, DAY_SECTIONS, STATUS_ALIASES, TARIFF, WEEK_SECTIONS } from "./domain";
import { StoreError, type Warning } from "./errors";
import {
  applySections,
  editYamlText,
  FrontmatterError,
  getSection,
  parseMarkdown,
  parseYamlText,
  serializeMarkdown,
  splitFrontmatter,
  splitSections,
  stringifyYaml,
  type YamlOp,
  type YamlPath,
} from "./markdown";
import {
  daySchema,
  purchasesFileSchema,
  questPoolFileSchema,
  rewardsFileSchema,
  weekSchema,
  type DayFrontmatter,
  type PurchasesFile,
  type QuestPool,
  type RewardsFile,
  type WeekFrontmatter,
} from "./schemas";

type Raw = Record<string, unknown>;

export const DAY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
export const WEEK_FILE_RE = /^(\d{4}-W\d{2})\.md$/;
export const KB_NAMES = ["profile", "insights"] as const;
export type KbName = (typeof KB_NAMES)[number];

export interface DayRecord {
  file: string;
  etag: string;
  day: DayFrontmatter;
  highlight: string;
  notes: string;
  gratitude: string;
  /** Headings of non-owned `## ` sections, in file order. */
  extraSections: string[];
}

export interface WeekRecord {
  file: string;
  etag: string;
  week: WeekFrontmatter;
  review: string;
  extraSections: string[];
}

export type DayDraft = DayFrontmatter & { highlight: string; notes: string; gratitude: string };
export type WeekDraft = WeekFrontmatter & { review: string };

export interface WriteOptions {
  /** ETag the caller last saw. `"*"` = the caller believes the file doesn't exist yet. */
  expectedEtag?: string;
}

export interface TextRecord {
  file: string;
  etag: string;
  content: string;
}

export function etagOf(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------- low-level fs helpers

const locks = new Map<string, Promise<unknown>>();

/** Serialize async work per absolute file path. */
export async function withFileLock<T>(absPath: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(absPath);
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export async function atomicWrite(absPath: string, text: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp-${randomBytes(6).toString("hex")}`;
  const fh = await open(tmp, "w", 0o644);
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, absPath);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

async function readText(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Editor temp files etc. are ignored by every directory scan. */
export function isIgnoredName(name: string): boolean {
  return name.startsWith(".") || name.endsWith("~") || name.endsWith(".swp") || name.includes(".tmp-");
}

// ---------------------------------------------------------------- generic helpers

function isPlainObject(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Apply the changes between `before` and `after` (both parsed views) onto `raw` (the on-disk object),
 * preserving untouched keys and their order. Array elements are matched by `id` when present.
 */
export function mergeChanges(raw: unknown, before: unknown, after: unknown): unknown {
  if (deepEqual(before, after)) return raw;
  if (isPlainObject(after)) {
    if (!isPlainObject(raw) || !isPlainObject(before)) return clone(after);
    for (const k of Object.keys(after)) {
      const v = after[k];
      if (v === undefined) {
        delete raw[k];
        continue;
      }
      const m = Object.hasOwn(before, k) ? mergeChanges(raw[k], before[k], v) : clone(v);
      if (m === undefined) delete raw[k];
      else raw[k] = m;
    }
    for (const k of Object.keys(before)) if (!Object.hasOwn(after, k)) delete raw[k];
    return raw;
  }
  if (Array.isArray(after)) {
    const rawArr = Array.isArray(raw) ? raw : [];
    const beforeArr = Array.isArray(before) ? before : [];
    return after.map((el, i) => {
      const id = isPlainObject(el) ? el.id : undefined;
      const bi = id !== undefined ? beforeArr.findIndex((b) => isPlainObject(b) && b.id === id) : i;
      if (bi < 0 || bi >= beforeArr.length) return clone(el);
      return mergeChanges(rawArr[bi] ?? clone(el), beforeArr[bi], el);
    });
  }
  return after;
}

/**
 * Path operations that turn `before` into `after` (both parsed views). Array elements are matched by
 * `id` (or index); a reordered array is replaced whole. Used to edit the YAML Document in place so
 * comments, formatting and untouched (possibly aliased) values stay as the user wrote them.
 */
export function diffOps(before: unknown, after: unknown, path: YamlPath = []): YamlOp[] {
  if (deepEqual(before, after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const ops: YamlOp[] = [];
    for (const k of Object.keys(after)) {
      const v = after[k];
      const had = Object.hasOwn(before, k) && before[k] !== undefined;
      if (v === undefined) {
        if (had) ops.push({ path: [...path, k], delete: true });
      } else if (!had) ops.push({ path: [...path, k], value: clone(v) });
      else ops.push(...diffOps(before[k], v, [...path, k]));
    }
    for (const k of Object.keys(before)) {
      if (before[k] !== undefined && !Object.hasOwn(after, k)) ops.push({ path: [...path, k], delete: true });
    }
    return ops;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const idOf = (x: unknown) => (isPlainObject(x) && typeof x.id === "string" ? x.id : undefined);
    const common = Math.min(before.length, after.length);
    for (let i = 0; i < common; i++) {
      const a = idOf(before[i]);
      const b = idOf(after[i]);
      if (a !== b && (a !== undefined || b !== undefined)) return [{ path, value: clone(after) }];
    }
    // Removing an id'd element from the middle would show up as a mismatch above; plain shrink/grow is fine.
    const ops: YamlOp[] = [];
    for (let i = 0; i < common; i++) ops.push(...diffOps(before[i], after[i], [...path, i]));
    for (let i = common; i < after.length; i++) ops.push({ path: [...path, i], value: clone(after[i]) });
    for (let i = before.length - 1; i >= after.length; i--) ops.push({ path: [...path, i], delete: true });
    return ops;
  }
  return [{ path, value: clone(after) }];
}

function getPath(obj: unknown, path: YamlPath): unknown {
  let cur = obj;
  for (const p of path) {
    if (Array.isArray(cur) && typeof p === "number") cur = cur[p];
    else if (isPlainObject(cur) && typeof p === "string") cur = cur[p];
    else return undefined;
  }
  return cur;
}

function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? ` (${i.path.join(".") || "root"}: ${i.message})` : "";
}

function zodDetails(err: z.ZodError): Record<string, unknown> {
  return { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}

function aliasValue(map: Readonly<Record<string, string>>, v: unknown): unknown {
  if (typeof v !== "string") return v;
  const k = v.trim().toLowerCase();
  return Object.hasOwn(map, k) ? map[k] : v;
}

/** Normalize a raw quest list in place: aliases, missing ids, missing coin snapshots. */
function normalizeQuests(quests: unknown, idBase: string, rel: string, boss: boolean): void {
  if (!Array.isArray(quests)) return;
  const explicit = new Set<string>();
  for (const q of quests) {
    if (!isPlainObject(q) || typeof q.id !== "string") continue;
    if (explicit.has(q.id)) {
      throw new StoreError("invalid_file", `Duplicate quest id ${q.id}`, rel, { issues: [{ path: "quests", message: `duplicate id ${q.id}` }] });
    }
    explicit.add(q.id);
  }
  quests.forEach((q, i) => {
    if (!isPlainObject(q)) return;
    if ("status" in q) q.status = aliasValue(STATUS_ALIASES, q.status);
    if ("category" in q) q.category = aliasValue(CATEGORY_ALIASES, q.category);
    if (q.id === undefined || q.id === null || q.id === "") {
      const slot = typeof q.slot === "number" ? q.slot : i + 1;
      const base = boss ? idBase : `${idBase}-${slot}`;
      let id = base;
      for (let n = 1; explicit.has(id); n++) id = base + String.fromCharCode(97 + n); // b, c, …
      q.id = id;
      explicit.add(id);
    }
    if (q.coins === undefined || q.coins === null) {
      const d = boss ? "boss" : q.difficulty;
      if (typeof d === "string" && Object.hasOwn(TARIFF, d)) q.coins = TARIFF[d as keyof typeof TARIFF];
    }
  });
}

function checkSchemaVersion(raw: Raw, current: number, rel: string): void {
  if (typeof raw.schema === "number" && raw.schema > current) {
    throw new StoreError("newer_schema", `${rel} uses schema ${raw.schema}; this app understands ${current}. Read-only.`, rel);
  }
}

function parseOrQuarantine(text: string, rel: string): { data: Raw; body: string } {
  try {
    const { data, body } = parseMarkdown(text);
    return { data, body };
  } catch (e) {
    const fe = e instanceof FrontmatterError ? e : new FrontmatterError(String(e));
    throw new StoreError("unparseable_file", `Fix ${rel} in your editor: ${fe.message}`, rel, {
      ...(fe.line !== undefined ? { line: fe.line } : {}),
      raw: text,
    });
  }
}

// ---------------------------------------------------------------- Markdown doc kinds

interface MdKind<View, Rec> {
  owned: readonly string[];
  schema: z.ZodType<View>;
  current: number;
  defaults(id: string): Raw;
  /** Normalize the raw object in place (in-memory on reads, persisted on writes). */
  normalize(raw: Raw, id: string, rel: string): void;
  check(view: View, id: string, rel: string): void;
  record(rel: string, etag: string, view: View, body: string): Rec;
  sectionsOf(rec: Rec): Record<string, string>;
  /** The quest element an op path edits (its computed id/coins get persisted when touched), or null. */
  questOf(path: YamlPath): YamlPath | null;
}

/** Section text as compared for change detection (same normalization applySections uses). */
function normSection(v: string | undefined): string {
  return (v ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

function sectionKey(name: string): string {
  return name.toLowerCase();
}

function extraSections(body: string, owned: readonly string[]): string[] {
  const ownedKeys = owned.map((o) => o.toLowerCase());
  return splitSections(body)
    .filter((c) => c.key !== null && !ownedKeys.includes(c.key))
    .map((c) => c.headingLine.replace(/^##[ \t]+/, "").trim());
}

const dayKind: MdKind<DayFrontmatter, DayRecord> = {
  owned: DAY_SECTIONS,
  schema: daySchema,
  current: CURRENT_SCHEMA.day,
  defaults: (date) => ({
    schema: CURRENT_SCHEMA.day,
    date,
    energy: null,
    satisfaction: null,
    mood: [],
    private: false,
    publish: false,
    rerolls_used: 0,
    generation: null,
    quests: [],
  }),
  normalize(raw, date, rel) {
    if (raw.date === undefined || raw.date === null) raw.date = date;
    normalizeQuests(raw.quests, date, rel, false);
  },
  check(view, date, rel) {
    if (view.date !== date) {
      throw new StoreError("invalid_file", `${rel}: date ${view.date} doesn't match the file name`, rel, {
        issues: [{ path: "date", message: "must equal the file name" }],
      });
    }
  },
  record: (file, etag, day, body) => {
    const chunks = splitSections(body);
    return {
      file,
      etag,
      day,
      highlight: getSection(chunks, "Highlight") ?? "",
      notes: getSection(chunks, "Notes") ?? "",
      gratitude: getSection(chunks, "Gratitude") ?? "",
      extraSections: extraSections(body, DAY_SECTIONS),
    };
  },
  sectionsOf: (r) => ({ highlight: r.highlight, notes: r.notes, gratitude: r.gratitude }),
  questOf: (p) => (p[0] === "quests" && typeof p[1] === "number" && p.length > 2 ? p.slice(0, 2) : null),
};

const weekKind: MdKind<WeekFrontmatter, WeekRecord> = {
  owned: WEEK_SECTIONS,
  schema: weekSchema,
  current: CURRENT_SCHEMA.week,
  defaults: (week) => ({ schema: CURRENT_SCHEMA.week, week, boss: null, generation: null }),
  normalize(raw, week, rel) {
    if (raw.week === undefined || raw.week === null) raw.week = week;
    if (isPlainObject(raw.boss)) {
      const list = [raw.boss];
      normalizeQuests(list, `${week}-boss`, rel, true);
    }
  },
  check(view, week, rel) {
    if (view.week !== week) {
      throw new StoreError("invalid_file", `${rel}: week ${view.week} doesn't match the file name`, rel, {
        issues: [{ path: "week", message: "must equal the file name" }],
      });
    }
  },
  record: (file, etag, week, body) => ({
    file,
    etag,
    week,
    review: getSection(splitSections(body), "Review") ?? "",
    extraSections: extraSections(body, WEEK_SECTIONS),
  }),
  sectionsOf: (r) => ({ review: r.review }),
  questOf: (p) => (p[0] === "boss" && p.length > 1 ? ["boss"] : null),
};

// ---------------------------------------------------------------- the store

export interface StoreOptions {
  dataDir: string;
}

export type Store = ReturnType<typeof createStore>;

export function createStore(opts: StoreOptions) {
  const dataDir = resolve(opts.dataDir);
  assertSafeDataDir(dataDir);

  function abs(rel: string): string {
    const p = resolve(dataDir, rel);
    if (p !== dataDir && !p.startsWith(dataDir + sep)) {
      throw new StoreError("bad_request", "Path escapes DATA_DIR");
    }
    return p;
  }

  /** ETag of the bytes this process last wrote per file (M2 R-BUG-2: tells hand edits from app writes). */
  const lastWritten = new Map<string, string>();
  async function writeTracked(file: string, text: string): Promise<void> {
    await atomicWrite(file, text);
    lastWritten.set(relative(dataDir, file).split(sep).join("/"), etagOf(text));
  }

  const paths = {
    day(date: string): string {
      if (!isValidDate(date)) throw new StoreError("bad_request", `Not a valid date: ${date}`);
      return `days/${date}.md`;
    },
    week(week: string): string {
      if (!isValidWeek(week)) throw new StoreError("bad_request", `Not a valid ISO week: ${week}`);
      return `weeks/${week}.md`;
    },
    kb(name: KbName): string {
      if (!KB_NAMES.includes(name)) throw new StoreError("bad_request", `Unknown kb file: ${String(name)}`);
      return `kb/${name}.md`;
    },
  };

  function checkEtag(rel: string, current: string | null, expected: string | undefined): void {
    if (expected === undefined) return;
    if (expected === "*" ? current === null : current !== null && expected === current) return;
    throw new StoreError("stale", `${rel} changed since it was loaded`, rel, { current_etag: current });
  }

  function parseMd<V, R>(kind: MdKind<V, R>, id: string, rel: string, text: string): { raw: Raw; view: V; body: string } {
    const { data, body } = parseOrQuarantine(text, rel);
    checkSchemaVersion(data, kind.current, rel);
    const raw = data;
    kind.normalize(raw, id, rel);
    const res = kind.schema.safeParse(raw);
    if (!res.success) {
      throw new StoreError("invalid_file", `${rel} has values the app doesn't understand${firstIssue(res.error)}`, rel, {
        ...zodDetails(res.error),
        raw: text,
      });
    }
    kind.check(res.data, id, rel);
    return { raw, view: res.data, body };
  }

  async function readMd<V, R>(kind: MdKind<V, R>, id: string, rel: string): Promise<R | null> {
    const text = await readText(abs(rel));
    if (text === null) return null;
    const { view, body } = parseMd(kind, id, rel, text);
    return kind.record(rel, etagOf(text), view, body);
  }

  /**
   * Rewrite only what changed: YAML ops applied to the original frontmatter text (comments, flow style,
   * aliases like `failed` and untouched lines kept byte-for-byte) + the new body. Returns null when the
   * file has no frontmatter or the result doesn't parse back to exactly the expected view.
   */
  function surgicalEdit<V, R>(kind: MdKind<V, R>, id: string, rel: string, text: string, before: V, expected: Raw, newBody: string): string | null {
    const parts = splitFrontmatter(text);
    if (!parts) return null;
    let pristine: Raw;
    try {
      pristine = parseMarkdown(text).data;
    } catch {
      return null;
    }
    const ops = diffOps(before, expected);
    // A touched quest gets its computed id/coins written down, so later awards/ids stay stable.
    const extra: YamlOp[] = [];
    const seen = new Set<string>();
    for (const op of ops) {
      const q = kind.questOf(op.path);
      if (!q || seen.has(JSON.stringify(q))) continue;
      seen.add(JSON.stringify(q));
      const orig = getPath(pristine, q);
      const want = getPath(expected, q);
      if (!isPlainObject(orig) || !isPlainObject(want)) continue;
      for (const k of ["id", "coins"]) {
        if ((orig[k] === undefined || orig[k] === null) && want[k] !== undefined) extra.push({ path: [...q, k], value: want[k] });
      }
    }
    let yamlOut = parts.yaml;
    if (ops.length > 0) {
      if (parts.yaml.trim() === "") return null;
      try {
        yamlOut = editYamlText(parts.yaml, [...extra, ...ops]);
      } catch {
        return null;
      }
    }
    const out = parts.open + yamlOut + parts.close + (parts.close.endsWith("\n") || newBody === "" ? "" : "\n") + newBody;
    try {
      const check = parseMd(kind, id, rel, out);
      if (!deepEqual(check.view, expected)) return null;
    } catch {
      return null;
    }
    return out;
  }

  async function updateMd<V extends object, R>(
    kind: MdKind<V, R>,
    id: string,
    rel: string,
    fn: (draft: Raw) => void | Promise<void>,
    options: WriteOptions,
  ): Promise<{ record: R; changed: boolean }> {
    const file = abs(rel);
    return withFileLock(file, async () => {
      const text = await readText(file);
      checkEtag(rel, text === null ? null : etagOf(text), options.expectedEtag);
      let raw: Raw;
      let view: V;
      let body: string;
      if (text === null) {
        raw = kind.defaults(id);
        body = "";
        const res = kind.schema.safeParse(raw);
        if (!res.success) throw new StoreError("invalid_update", "Default document failed validation", rel, zodDetails(res.error));
        view = res.data;
      } else {
        ({ raw, view, body } = parseMd(kind, id, rel, text));
      }
      const sectionsBefore = kind.sectionsOf(kind.record(rel, "", view, body));
      const draft: Raw = { ...clone(view as Raw), ...sectionsBefore };
      await fn(draft);

      const after: Raw = { ...draft };
      const sectionValues: Record<string, string> = {};
      for (const k of Object.keys(sectionsBefore)) {
        const v = after[k];
        delete after[k];
        if (typeof v !== "string") throw new StoreError("invalid_update", `Section ${k} must be a string`, rel);
        sectionValues[k] = v;
      }
      // No-op short-circuit (M1 BUG-2, BACKLOG MUST): when the mutator changed no frontmatter value and no
      // owned section text, the file is left byte-identical (YAML comments, CRLF and all). In-memory
      // normalization (computed ids/coins, aliases) alone never counts as a change.
      if (text !== null) {
        const sectionsChanged = Object.keys(sectionsBefore).some(
          (k) => normSection(sectionValues[k]) !== normSection(sectionsBefore[k]),
        );
        if (!sectionsChanged && deepEqual(view, after)) {
          return { record: kind.record(rel, etagOf(text), view, body), changed: false };
        }
      }
      // Expected result: the mutated view, normalized (ids/coins for new quests) and validated.
      const expectedRaw = clone(after);
      kind.normalize(expectedRaw, id, rel);
      const expected = kind.schema.safeParse(expectedRaw);
      if (!expected.success) throw new StoreError("invalid_update", "Update produced an invalid document", rel, zodDetails(expected.error));
      kind.check(expected.data, id, rel);

      const ownedValues: Record<string, string> = {};
      for (const name of kind.owned) {
        const v = sectionValues[sectionKey(name)];
        if (v !== undefined && v !== sectionsBefore[sectionKey(name)]) ownedValues[name] = v;
      }
      const eol = text !== null && /\r\n/.test(text) && !/(^|[^\r])\n/.test(text) ? "\r\n" : "\n";
      // New or frontmatter-less files get the full section template; app files get minimal edits (AC17).
      const adopt = text === null || splitFrontmatter(text) === null;
      const newBody = applySections(body, kind.owned, ownedValues, eol, adopt);

      // Preferred path (M2 BUG-2): edit only the changed YAML nodes/lines and the changed sections.
      let out: string | null = text === null ? null : surgicalEdit(kind, id, rel, text, view, expected.data as Raw, newBody);
      if (out === null) {
        // Fallback (new file, no frontmatter, or the in-place edit didn't round-trip): full re-serialization.
        const merged = mergeChanges(raw, view, after) as Raw;
        kind.normalize(merged, id, rel);
        const res = kind.schema.safeParse(merged);
        if (!res.success) throw new StoreError("invalid_update", "Update produced an invalid document", rel, zodDetails(res.error));
        kind.check(res.data, id, rel);
        out = serializeMarkdown(merged, newBody);
      }
      if (out !== text) await writeTracked(file, out);
      const final = parseMd(kind, id, rel, out);
      return { record: kind.record(rel, etagOf(out), final.view, final.body), changed: out !== text };
    });
  }

  async function listIds(dir: string, re: RegExp, valid: (id: string) => boolean): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(abs(dir));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    return names
      .filter((n) => !isIgnoredName(n))
      .map((n) => re.exec(n)?.[1])
      .filter((id): id is string => id !== undefined && valid(id))
      .sort();
  }

  async function readYaml<S extends z.ZodType>(rel: string, schema: S): Promise<{ data: z.infer<S>; etag: string } | null> {
    const text = await readText(abs(rel));
    if (text === null) return null;
    let parsed: unknown;
    try {
      parsed = parseYamlText(text);
    } catch (e) {
      const fe = e as FrontmatterError;
      // M5 (architect-AC11): parity with day files: the raw text + line, for the calm read-only view.
      throw new StoreError("unparseable_file", `Fix ${rel} in your editor: ${fe.message}`, rel, {
        ...(fe.line !== undefined ? { line: fe.line } : {}),
        raw: text,
      });
    }
    const raw = parsed ?? {};
    if (!isPlainObject(raw)) throw new StoreError("invalid_file", `${rel} must be a YAML mapping`, rel, { raw: text });
    const name = rel.replace(/\.yaml$/, "") as keyof typeof CURRENT_SCHEMA;
    if (Object.hasOwn(CURRENT_SCHEMA, name)) checkSchemaVersion(raw, CURRENT_SCHEMA[name], rel);
    const res = schema.safeParse(raw);
    if (!res.success) {
      throw new StoreError("invalid_file", `${rel} has values the app doesn't understand${firstIssue(res.error)}`, rel, {
        ...zodDetails(res.error),
        raw: text,
      });
    }
    return { data: res.data, etag: etagOf(text) };
  }

  const readDay = async (date: string) => readMd(dayKind, date, paths.day(date));
  const readWeek = async (week: string) => readMd(weekKind, week, paths.week(week));
  const listDays = () => listIds("days", DAY_FILE_RE, isValidDate);
  const listWeeks = () => listIds("weeks", WEEK_FILE_RE, isValidWeek);
  const readQuestPool = async (): Promise<QuestPool | null> => (await readYaml("quests.yaml", questPoolFileSchema))?.data ?? null;
  const readRewards = async (): Promise<RewardsFile | null> => (await readYaml("rewards.yaml", rewardsFileSchema))?.data ?? null;
  /** `purchases.yaml`; a missing file reads as empty, a broken one THROWS (never read a broken spend file as zero). */
  const readPurchases = async (): Promise<{ data: PurchasesFile; etag: string | null }> => {
    const r = await readYaml("purchases.yaml", purchasesFileSchema);
    return r ?? { data: purchasesFileSchema.parse({}), etag: null };
  };

  return {
    dataDir,
    paths,
    abs,

    readDay,
    /** Create-or-update a day file. The mutator edits a typed draft (frontmatter + owned sections). */
    updateDay: async (date: string, fn: (draft: DayDraft) => void | Promise<void>, options: WriteOptions = {}) =>
      updateMd(dayKind, date, paths.day(date), fn as unknown as (d: Raw) => void, options),
    listDays,

    readWeek,
    updateWeek: async (week: string, fn: (draft: WeekDraft) => void | Promise<void>, options: WriteOptions = {}) =>
      updateMd(weekKind, week, paths.week(week), fn as unknown as (d: Raw) => void, options),
    listWeeks,

    /** ETag of the last bytes this process wrote to `rel` (e.g. `days/2026-10-26.md`), if any. */
    lastWrittenEtag: (rel: string): string | undefined => lastWritten.get(rel),

    async readKb(name: KbName): Promise<TextRecord | null> {
      const rel = paths.kb(name);
      const text = await readText(abs(rel));
      return text === null ? null : { file: rel, etag: etagOf(text), content: text };
    },
    async writeKb(name: KbName, content: string, options: WriteOptions = {}): Promise<TextRecord> {
      const rel = paths.kb(name);
      const file = abs(rel);
      return withFileLock(file, async () => {
        const text = await readText(file);
        checkEtag(rel, text === null ? null : etagOf(text), options.expectedEtag);
        if (content !== text) await writeTracked(file, content);
        return { file: rel, etag: etagOf(content), content };
      });
    },

    readQuestPool,
    readRewards,
    readPurchases,
    readYaml,
    /**
     * Read-modify-write a YAML data file under its mutex. Only changed nodes/lines are rewritten, so
     * comments and formatting survive (M2 BUG-2); a full re-stringify is the fallback when the in-place
     * edit doesn't round-trip. Broken files are refused untouched. No-op updates don't touch disk.
     */
    /** The mutator may be async: it runs INSIDE the file lock (M6: the purchase re-reads earnings there). */
    async updateYaml<S extends z.ZodType>(rel: string, schema: S, fn: (raw: Raw) => Raw | void | Promise<Raw | void>): Promise<z.infer<S>> {
      const file = abs(rel);
      return withFileLock(file, async () => {
        const existing = await readYaml(rel, schema); // throws if quarantined
        const text = existing ? await readText(file) : null;
        const raw = (text ? (parseYamlText(text) as Raw | null) : null) ?? {};
        const before = clone(raw);
        const next = (await fn(raw)) ?? raw;
        const res = schema.safeParse(next);
        if (!res.success) throw new StoreError("invalid_update", `Update to ${rel} is invalid`, rel, zodDetails(res.error));
        if (text !== null && deepEqual(before, next)) return res.data;
        let out: string | null = null;
        if (text !== null && text.trim() !== "") {
          try {
            const candidate = editYamlText(text, diffOps(before, next));
            if (deepEqual(parseYamlText(candidate), next)) out = candidate;
          } catch {
            out = null;
          }
        }
        out ??= stringifyYaml(next);
        if (out !== text) await writeTracked(file, out);
        return res.data;
      });
    },

    /** Every day/week/yaml file that can't be read, as warnings (never throws for a broken file). */
    async scanBroken(): Promise<Warning[]> {
      const out: Warning[] = [];
      const attempt = async (fn: () => Promise<unknown>, file: string) => {
        try {
          await fn();
        } catch (e) {
          if (e instanceof StoreError) out.push({ file: e.file ?? file, code: e.code, message: e.message });
          else out.push({ file, code: "read_error", message: e instanceof Error ? e.message : String(e) });
        }
      };
      for (const d of await listDays()) await attempt(() => readDay(d), `days/${d}.md`);
      for (const w of await listWeeks()) await attempt(() => readWeek(w), `weeks/${w}.md`);
      await attempt(readQuestPool, "quests.yaml");
      await attempt(readRewards, "rewards.yaml");
      await attempt(readPurchases, "purchases.yaml");
      return out;
    },

    relative: (p: string) => relative(dataDir, p),
  };
}

/** Small join helper re-exported for init. */
export const dataPath = (dataDir: string, ...parts: string[]) => join(dataDir, ...parts);
