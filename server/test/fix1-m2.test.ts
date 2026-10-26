/**
 * M2 fix round 1: regression tests for docs/test-reports/2026-10-26-M2.md BUG-1 … BUG-5 (+ AC17).
 * Temp DATA_DIRs only; never ~/quest-data.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createStore } from "../src/store";
import { editYamlText, escapeSectionText, getSection, splitSections, unescapeSectionText } from "../src/markdown";
import { STATUS } from "../../web/src/lib/theme/vocab";
import { emptyForm, rebaseForm, saveBody, type EveningForm } from "../../web/src/lib/eveningForm";
import { cleanupTempDirs, GIT_TEST_ENV, makeTempDataDir, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

const NOW = "2026-10-26T21:00:00+05:00";
const DATE = "2026-10-26";

async function git(dir: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...GIT_TEST_ENV } });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
}

type T = Awaited<ReturnType<typeof makeTestApp>>;
const put = (t: T, body: unknown, ifMatch: string) =>
  req(t.app, `/api/days/${DATE}/evening`, {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": ifMatch },
    body: JSON.stringify(body),
  });
const dayPath = (t: T) => join(t.dataDir, `days/${DATE}.md`);
const readDayFile = (t: T) => readFile(dayPath(t), "utf8");

/** Frontmatter block (between and including the delimiters). */
function frontmatter(text: string): string {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error("no frontmatter");
  return m[0];
}
/** Lines present in `b` but not in `a` (and vice versa): a cheap line diff. */
function lineDiff(a: string, b: string): { removed: string[]; added: string[] } {
  const al = a.split(/\r?\n/);
  const bl = b.split(/\r?\n/);
  return { removed: al.filter((l) => !bl.includes(l)), added: bl.filter((l) => !al.includes(l)) };
}

const HAND_DAY = `---
# my hand comment
schema: 1
date: ${DATE}
energy: 3 # felt ok
satisfaction: 6
mood: [calm, tea]
my_custom_key: {nested: true}
quests:
  - {id: ${DATE}-1, slot: 1, title: Walk, category: body, difficulty: easy, coins: 10, status: failed, feedback: null}
  - {id: ${DATE}-2, slot: 2, title: Read, category: mind, difficulty: easy, coins: 10, status: open, feedback: null}
  - {id: ${DATE}-3, slot: 3, title: Tea, category: care, difficulty: medium, coins: 20, status: open, feedback: null}
---
Before any heading.

## Highlight
Tea with Maomao

## Notes
Old notes

## Dream log
flying
`;

// ---------------------------------------------------------------- BUG-1

describe("BUG-1: re-save after 412 never overwrites hand edits in untouched fields", () => {
  test("pure: saveBody sends only changed fields; a no-change re-seal sends just the rating", () => {
    const loaded: EveningForm = { satisfaction: 7, mood: ["calm"], highlight: "Tea", notes: "n", gratitude: "" };
    expect(saveBody({ ...loaded, notes: "new" }, loaded)).toEqual({ notes: "new" });
    expect(saveBody({ ...loaded, mood: ["calm", "proud"] }, loaded)).toEqual({ mood: ["calm", "proud"] });
    expect(saveBody({ ...loaded }, loaded)).toEqual({ satisfaction: 7 });
    expect(saveBody({ ...emptyForm(), satisfaction: null }, emptyForm())).toEqual({ satisfaction: null });
  });

  test("pure: rebaseForm adopts on-disk values for untouched fields, keeps the user's edits, reports conflicts", () => {
    const loaded: EveningForm = { satisfaction: 7, mood: ["calm"], highlight: "Tea", notes: "old", gratitude: "" };
    const form: EveningForm = { ...loaded, notes: "my phone text" };
    const disk: EveningForm = { ...loaded, highlight: "Tea (edited in Obsidian)", notes: "hand notes" };
    const r = rebaseForm(form, loaded, disk);
    expect(r.form).toEqual({ ...disk, notes: "my phone text" });
    expect(r.conflicts).toEqual(["notes"]);
    // After the rebase the next save sends only the user's field.
    expect(saveBody(r.form, disk)).toEqual({ notes: "my phone text" });
    // An edit that equals the disk value isn't a conflict.
    expect(rebaseForm({ ...loaded, highlight: disk.highlight }, loaded, disk).conflicts).toEqual([]);
  });

  test("API + git: the tester's repro keeps the hand-edited highlight, and the hand edit reaches git history", async () => {
    const t = await makeTestApp({ env: { GIT_ENABLED: "true" }, now: NOW });
    const first = await put(t, { satisfaction: 7, highlight: "Tea with Maomao", notes: "old" }, "*");
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;
    await t.git.flush();

    // 2. hand edit in "Obsidian"
    const text = await readDayFile(t);
    await writeFile(dayPath(t), text.replace("Tea with Maomao", "Tea with Maomao (edited in Obsidian)"));

    // 3. the app changed only Notes, with the old ETag → 412
    const stale = await put(t, { notes: "phone notes" }, etag);
    expect(stale.status).toBe(412);
    const err = (await stale.json()) as { error: { code: string; details?: { current_etag?: string } } };
    expect(err.error.code).toBe("stale");

    // the hand-edited version is committed before any re-save can replace it
    const hist = await git(t.dataDir, "log", "-p", "-S", "edited in Obsidian", "--format=%s");
    expect(hist).toContain("qj: day 2026-10-26 hand_edit");
    expect(await git(t.dataDir, "status", "--porcelain")).toBe("");

    // 4. the client re-sends only the changed field with the new ETag
    const fresh = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag") ?? `"${err.error.details?.current_etag}"`;
    const again = await put(t, { notes: "phone notes" }, fresh);
    expect(again.status).toBe(200);
    const after = await readDayFile(t);
    expect(after).toContain("Tea with Maomao (edited in Obsidian)");
    expect(after).toContain("phone notes");
    t.git.close();
  });
});

// ---------------------------------------------------------------- BUG-2 / AC17

describe("BUG-2 / AC17: a real change edits only that field or section", () => {
  test("section-only change leaves the frontmatter bytes identical (comments, flow style, `failed`)", async () => {
    const t = await makeTestApp({ now: NOW });
    await writeFile(dayPath(t), HAND_DAY);
    const etag = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag")!;
    const res = await put(t, { notes: "new notes" }, etag);
    expect(res.status).toBe(200);
    const out = await readDayFile(t);
    expect(frontmatter(out)).toBe(frontmatter(HAND_DAY));
    expect(lineDiff(HAND_DAY, out)).toEqual({ removed: ["Old notes"], added: ["new notes"] });
  });

  test("frontmatter change rewrites only that YAML line; comments and other lines kept byte-for-byte", async () => {
    const t = await makeTestApp({ now: NOW });
    await writeFile(dayPath(t), HAND_DAY);
    const etag = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag")!;
    expect((await put(t, { satisfaction: 8 }, etag)).status).toBe(200);
    const out = await readDayFile(t);
    expect(lineDiff(HAND_DAY, out)).toEqual({ removed: ["satisfaction: 6"], added: ["satisfaction: 8"] });
  });

  test("PATCH feedback edits one quest's line only; the read-side `failed` alias stays on disk", async () => {
    const t = await makeTestApp({ now: NOW });
    await writeFile(dayPath(t), HAND_DAY);
    const res = await req(t.app, `/api/quests/${DATE}-2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: "down" }),
    });
    expect(res.status).toBe(200);
    const out = await readDayFile(t);
    const d = lineDiff(HAND_DAY, out);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]).toContain("title: Read");
    expect(d.added).toEqual([d.removed[0]!.replace("feedback: null", "feedback: down")]);
    expect(out).toContain("# my hand comment");
    expect(out).toContain("energy: 3 # felt ok");
    expect(out).toContain("status: failed");
  });

  test("tester repro: `energy: 4 # tester comment` survives a highlight-only and a feedback change", async () => {
    const t = await makeTestApp({ now: NOW });
    const hand = HAND_DAY.replace("energy: 3 # felt ok", "# top comment\nenergy: 4 # tester comment");
    await writeFile(dayPath(t), hand);
    const etag = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag")!;
    expect((await put(t, { highlight: "new hl" }, etag)).status).toBe(200);
    await req(t.app, `/api/quests/${DATE}-3`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const out = await readDayFile(t);
    expect(out).toContain("# top comment\nenergy: 4 # tester comment");
    expect(out).toContain("# my hand comment");
    expect(out).toContain("new hl");
    expect(out).toMatch(/title: Tea, .*status: done/);
  });

  test("CRLF hand file: a real change keeps CRLF everywhere and the comments", async () => {
    const t = await makeTestApp({ now: NOW });
    const crlf = HAND_DAY.replace(/\n/g, "\r\n");
    await writeFile(dayPath(t), crlf);
    const etag = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag")!;
    expect((await put(t, { notes: "crlf notes\nline two", satisfaction: 9 }, etag)).status).toBe(200);
    const out = await readDayFile(t);
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).toContain("# my hand comment\r\n");
    expect(out).toContain("satisfaction: 9\r\n");
    expect(out).toContain("crlf notes\r\nline two\r\n");
    expect(lineDiff(crlf, out).removed.sort()).toEqual(["Old notes", "satisfaction: 6"]);
  });

  test("unknown keys, preamble and extra sections survive; the result re-reads as expected", async () => {
    const t = await makeTestApp({ now: NOW });
    await writeFile(dayPath(t), HAND_DAY);
    const etag = (await req(t.app, `/api/day/${DATE}`)).headers.get("etag")!;
    await put(t, { mood: ["calm", "proud"], gratitude: "rain" }, etag);
    const out = await readDayFile(t);
    expect(out).toContain("my_custom_key: {nested: true}");
    expect(out).toContain("mood: [calm, proud]");
    expect(out).toContain("Before any heading.");
    expect(out).toContain("## Dream log\nflying");
    const rec = await t.store.readDay(DATE);
    expect(rec!.gratitude).toBe("rain");
    expect(rec!.day.quests[0]!.status).toBe("let_go");
  });

  test("editYamlText: unit cases (append key, nested set, delete, flow array keeps flow)", () => {
    const src = "# c\na: 1 # one\nlist: [x, y]\nm:\n  k: v # kv\n";
    expect(editYamlText(src, [{ path: ["a"], value: 2 }])).toBe("# c\na: 2 # one\nlist: [x, y]\nm:\n  k: v # kv\n");
    expect(editYamlText(src, [{ path: ["list"], value: ["x", "y", "z"] }])).toBe("# c\na: 1 # one\nlist: [x, y, z]\nm:\n  k: v # kv\n");
    expect(editYamlText(src, [{ path: ["m", "k"], delete: true }, { path: ["new"], value: "n" }])).toContain("# c\na: 1 # one\nlist: [x, y]\n");
    expect(() => editYamlText("a: [oops\n", [{ path: ["a"], value: 1 }])).toThrow();
  });

  test("updateYaml keeps comments and untouched lines", async () => {
    const dir = await makeTempDataDir();
    const store = createStore({ dataDir: dir });
    const src = "# my rewards\nschema: 1\nrewards: [] # none yet\nextra: keep # mine\n";
    await writeFile(join(dir, "x.yaml"), src);
    const { z } = await import("zod");
    await store.updateYaml("x.yaml", z.looseObject({}), (raw) => void (raw.extra = "changed"));
    expect(await readFile(join(dir, "x.yaml"), "utf8")).toBe("# my rewards\nschema: 1\nrewards: [] # none yet\nextra: changed # mine\n");
  });
});

// ---------------------------------------------------------------- BUG-3

describe("BUG-3: `## ` / fence lines typed into owned sections never split sections", () => {
  test("tester repro 1: notes containing `## Gratitude` round-trip; gratitude stays separate", async () => {
    const t = await makeTestApp({ now: NOW });
    const notes = "Line one\n\n## Gratitude\nsneaky";
    expect((await put(t, { notes, gratitude: "tea" }, "*")).status).toBe(200);
    const day = (await (await req(t.app, `/api/day/${DATE}`)).json()) as { notes: string; gratitude: string; extra_sections: string[] };
    expect(day.notes).toBe(notes);
    expect(day.gratitude).toBe("tea");
    expect(day.extra_sections).toEqual([]);
    const text = await readDayFile(t);
    expect(text.match(/^## Gratitude$/gm)).toHaveLength(1);
    expect(text).toContain("\\## Gratitude");
  });

  test("tester repro 2: `## Ideas` inside notes doesn't become an extra section", async () => {
    const t = await makeTestApp({ now: NOW });
    const notes = "Para\n## Ideas\nidea text";
    await put(t, { notes }, "*");
    const rec = await t.store.readDay(DATE);
    expect(rec!.notes).toBe(notes);
    expect(rec!.extraSections).toEqual([]);
  });

  test("an unclosed code fence in notes can't swallow the following headings", async () => {
    const t = await makeTestApp({ now: NOW });
    await put(t, { highlight: "```\nunclosed", notes: "~~~ tilde", gratitude: "g" }, "*");
    const rec = await t.store.readDay(DATE);
    expect(rec!.highlight).toBe("```\nunclosed");
    expect(rec!.notes).toBe("~~~ tilde");
    expect(rec!.gratitude).toBe("g");
  });

  test("escape/unescape is a line bijection (backslashes, indented fences, ### untouched)", () => {
    const cases = ["## a", "\\## a", "\\\\## a", "##\tb", "### fine", "# fine", "##nospace", "  ```js", " \\~~~", "plain", "", "a\n## b\n\\## c\n```"];
    for (const c of cases) expect(unescapeSectionText(escapeSectionText(c))).toBe(c);
    expect(escapeSectionText("### fine\n# fine\n##nospace")).toBe("### fine\n# fine\n##nospace");
    const body = `## Notes\n${escapeSectionText("x\n## Gratitude\n```")}\n\n## Gratitude\nreal\n`;
    expect(getSection(splitSections(body), "Gratitude")).toBe("real");
    expect(getSection(splitSections(body), "Notes")).toBe("x\n## Gratitude\n```");
  });

  test("an identical re-save of escaped text is a byte-identical no-op", async () => {
    const t = await makeTestApp({ now: NOW });
    const r1 = await put(t, { notes: "a\n## b" }, "*");
    const before = await readDayFile(t);
    const r2 = await put(t, { notes: "a\n## b" }, r1.headers.get("etag")!);
    expect(r2.status).toBe(200);
    expect(r2.headers.get("etag")).toBe(r1.headers.get("etag"));
    expect(await readDayFile(t)).toBe(before);
  });
});

// ---------------------------------------------------------------- BUG-4 / BUG-5

describe("BUG-4/5: copy and tap target", () => {
  test("the let-go note doesn't repeat the bold status label", () => {
    for (const s of [STATUS.let_go, STATUS.failed]) {
      expect(s.note.startsWith(s.label)).toBe(false);
      expect(s.note).toBe("No penalty, and that tells the apothecary something.");
    }
  });
  test("the Today footer 'Evening ledger' link has a ≥44 px target", async () => {
    const src = await readFile(resolve(import.meta.dir, "../../web/src/routes/Today.svelte"), "utf8");
    expect(src).toContain('<a class="footer-link" href="/evening">');
    expect(src).toMatch(/\.footer-link \{[^}]*min-height: 44px/);
  });
});
