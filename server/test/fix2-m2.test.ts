/**
 * M2 fix round 2: regression tests for docs/test-reports/2026-10-26-M2-retest1.md R-BUG-1 … R-BUG-3.
 * Temp DATA_DIRs only; never ~/quest-data.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGit } from "../src/git";
import { editYamlText } from "../src/markdown";
import { emptyForm, rebaseForm, type EveningForm } from "../../web/src/lib/eveningForm";
import { cleanupTempDirs, GIT_TEST_ENV, makeTempDataDir, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

const NOW = "2026-10-26T10:00:00+05:00";
const DATE = "2026-10-26";

async function git(dir: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...GIT_TEST_ENV } });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
}

const maxLine = (text: string) => Math.max(...text.split("\n").map((l) => l.length));

// ---------------------------------------------------------------- R-BUG-1

describe("R-BUG-1: new/empty sequences are written block-style", () => {
  test("editYamlText: maps appended to an empty flow `[]` → block style", () => {
    const out = editYamlText("schema: 1\nquests: []\nrejected: []\n", [
      { path: ["quests", 0], value: { id: "a", title: "T", checkpoints: [{ text: "x", done: false }] } },
      { path: ["quests", 1], value: { id: "b", title: "U" } },
    ]);
    expect(out).toBe(
      "schema: 1\nquests:\n  - id: a\n    title: T\n    checkpoints:\n      - text: x\n        done: false\n  - id: b\n    title: U\nrejected: []\n",
    );
  });

  test("editYamlText: replacing an empty flow `[]` whole with maps → block style", () => {
    const out = editYamlText("quests: []\n", [{ path: ["quests"], value: [{ id: "a" }, { id: "b" }] }]);
    expect(out).toBe("quests:\n  - id: a\n  - id: b\n");
  });

  test("editYamlText: a hand-written non-empty flow sequence keeps its style (BUG-2 still holds)", () => {
    const out = editYamlText("quests: [{id: a, status: open}]\n", [{ path: ["quests", 0, "status"], value: "done" }]);
    expect(out).toBe("quests: [{id: a, status: done}]\n");
    const grown = editYamlText("mood: [calm]\n", [{ path: ["mood", 1], value: "tea" }]);
    expect(grown).toBe("mood: [calm, tea]\n");
  });

  test("editYamlText: a scalar list replacing `[]` stays a short flow line", () => {
    expect(editYamlText("mood: []\n", [{ path: ["mood"], value: ["calm", "tea"] }])).toBe("mood: [calm, tea]\n");
    expect(editYamlText("mood: []\n", [{ path: ["mood", 0], value: "calm" }])).toBe("mood: [calm]\n");
  });

  for (const energy of [2, 3, 4]) {
    test(`check-in (energy ${energy}) on a new day file → \`quests:\\n  - id:\` block style, short lines`, async () => {
      const t = await makeTestApp({ now: NOW });
      expect((await req(t.app, "/api/today")).status).toBe(200);
      const res = await req(t.app, "/api/today/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ energy }),
      });
      expect([200, 202]).toContain(res.status);
      const text = await readFile(join(t.dataDir, `days/${DATE}.md`), "utf8");
      expect(text).toMatch(/\nquests:\n {2}- id: 2026-10-26-1\n/);
      expect(text).not.toMatch(/quests: \[\{/);
      // The longest line is a quest's `why:` sentence, never a whole quest list.
      expect(maxLine(text)).toBeLessThan(300);
      const weeks = await readdir(join(t.dataDir, "weeks"));
      for (const w of weeks) expect(maxLine(await readFile(join(t.dataDir, "weeks", w), "utf8"))).toBeLessThan(300);

      // Later edits on the block-style file stay minimal: marking quest 1 done changes only its status lines.
      const before = text.split("\n");
      const patch = await req(t.app, `/api/quests/${DATE}-1`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      expect(patch.status).toBe(200);
      const after = (await readFile(join(t.dataDir, `days/${DATE}.md`), "utf8")).split("\n");
      expect(after.length).toBe(before.length);
      const diff = after.filter((l, i) => l !== before[i]);
      expect(diff.length).toBeLessThanOrEqual(2); // status + completed_at
      expect(diff.some((l) => /^ {4}status: done$/.test(l))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------- R-BUG-2

describe("R-BUG-2: no `hand_edit` reason without a hand edit", () => {
  test("git: a reason whose files aren't staged is dropped from the message", async () => {
    const dir = await makeTempDataDir();
    await git(dir, "init", "-q");
    const g = createGit({ dataDir: dir, enabled: true, debounceMs: 60_000, env: GIT_TEST_ENV });
    await mkdir(join(dir, "days"));
    await mkdir(join(dir, "weeks"));
    await writeFile(join(dir, "days/2026-10-26.md"), "day\n");
    await writeFile(join(dir, "weeks/2026-W44.md"), "week\n");
    g.touch({ kind: "init" });
    await g.flush();
    await writeFile(join(dir, "weeks/2026-W44.md"), "week 2\n");
    g.touch({ kind: "boss", ref: "2026-W44", detail: "checkpoint" }, ["weeks/2026-W44.md"]);
    g.touch({ kind: "day", ref: "2026-10-26", detail: "hand_edit" }, ["days/2026-10-26.md"]);
    await g.flush();
    expect(await git(dir, "log", "-1", "--format=%s")).toBe("qj: boss 2026-W44 checkpoint");
    // Only unrelated (hand) changes staged → a neutral message, never a false reason.
    await writeFile(join(dir, "notes.md"), "mine\n");
    g.touch({ kind: "day", ref: "2026-10-26", detail: "hand_edit" }, ["days/2026-10-26.md"]);
    await g.flush();
    expect(await git(dir, "log", "-1", "--format=%s")).toBe("qj: hand edits");
    g.close();
  });

  test("API: a bad If-Match against an app-written file → 412, fast, no hand_edit commit", async () => {
    const t = await makeTestApp({ env: { GIT_ENABLED: "true" }, now: NOW });
    await t.git.flush(); // let the init commit land first, so it can't absorb the evening write
    const put = (body: unknown, ifMatch: string) =>
      req(t.app, `/api/days/${DATE}/evening`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": ifMatch },
        body: JSON.stringify(body),
      });
    expect((await put({ satisfaction: 7 }, "*")).status).toBe(200);
    for (const bad of ["deadbeef", "*"]) {
      const t0 = Date.now();
      const r = await put({ notes: "x" }, bad);
      expect(r.status).toBe(412);
      expect(Date.now() - t0).toBeLessThan(2_000);
    }
    await t.git.flush();
    const log = await git(t.dataDir, "log", "--format=%s");
    expect(log).not.toContain("hand_edit");
    expect(t.git.status().last_error).toBeNull();
    expect(log).toContain("evening");
    t.git.close();
  });

  test("API: a real hand edit still gets its `hand_edit` snapshot commit (BUG-1 still holds)", async () => {
    const t = await makeTestApp({ env: { GIT_ENABLED: "true" }, now: NOW });
    const first = await req(t.app, `/api/days/${DATE}/evening`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "*" },
      body: JSON.stringify({ highlight: "Tea" }),
    });
    const etag = first.headers.get("etag")!;
    await t.git.flush();
    const file = join(t.dataDir, `days/${DATE}.md`);
    await writeFile(file, (await readFile(file, "utf8")).replace("Tea", "Tea (hand)"));
    const stale = await req(t.app, `/api/days/${DATE}/evening`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": etag },
      body: JSON.stringify({ notes: "n" }),
    });
    expect(stale.status).toBe(412);
    expect(await git(t.dataDir, "log", "-1", "--format=%s")).toBe(`qj: day ${DATE} hand_edit`);
    t.git.close();
  });
});

// ---------------------------------------------------------------- R-BUG-3

describe("R-BUG-3: the stale panel lists only real conflicts", () => {
  const loaded: EveningForm = { ...emptyForm(), satisfaction: 7, highlight: "Tea with Maomao", notes: "Line one\n## Gratitude\nsneaky" };

  test("tester repro: hand-edited Highlight, app-edited Notes → no conflicts, Highlight reported as updated", () => {
    const disk: EveningForm = { ...loaded, highlight: "Tea with Maomao (edited in Obsidian)" };
    const form: EveningForm = { ...loaded, notes: "phone notes" };
    const r = rebaseForm(form, loaded, disk);
    expect(r.conflicts).toEqual([]);
    expect(r.updated).toEqual(["highlight"]);
    expect(r.form.highlight).toBe(disk.highlight);
    expect(r.form.notes).toBe("phone notes");
  });

  test("same field edited in both places, differently → conflict (and not 'updated')", () => {
    const disk: EveningForm = { ...loaded, notes: "disk notes" };
    const form: EveningForm = { ...loaded, notes: "phone notes" };
    const r = rebaseForm(form, loaded, disk);
    expect(r.conflicts).toEqual(["notes"]);
    expect(r.updated).toEqual([]);
    expect(r.form.notes).toBe("phone notes");
  });

  test("nothing changed on disk (e.g. a stale ETag only) → no conflicts, nothing updated", () => {
    const r = rebaseForm({ ...loaded, notes: "phone" }, loaded, { ...loaded });
    expect(r.conflicts).toEqual([]);
    expect(r.updated).toEqual([]);
  });

  test("Evening.svelte uses rebaseForm's lists, not a form-vs-disk diff", async () => {
    const src = await readFile(join(import.meta.dir, "../../web/src/routes/Evening.svelte"), "utf8");
    expect(src).toContain("staleFields = rebased.conflicts");
    expect(src).toContain("staleUpdated = rebased.updated");
  });
});
