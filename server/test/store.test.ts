import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StoreError } from "../src/errors";
import { parseMarkdown } from "../src/markdown";
import { createStore } from "../src/store";
import { cleanupTempDirs, makeTempDataDir, sha256File } from "./helpers";

afterAll(cleanupTempDirs);

async function setup(files: Record<string, string> = {}) {
  const dir = await makeTempDataDir();
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), text);
  }
  return { dir, store: createStore({ dataDir: dir }) };
}

async function expectStoreError(p: Promise<unknown>, code: StoreError["code"]): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(StoreError);
    expect((e as StoreError).code).toBe(code);
    return e as StoreError;
  }
  throw new Error(`expected StoreError ${code}`);
}

const RICH = `---
date: 2026-10-25
energy: 3
mode: exam
backfilled: true
weather: rainy
quests:
  - id: 2026-10-25-1
    slot: 1
    title: Walk to the river
    why: Air.
    category: adventure
    difficulty: medium
    coins: 20
    status: open
    minutes: 30
    done_when: "photo taken"
---
Written before any heading.

## Highlight
old highlight

## Notes
川沿いを歩いた 🌿

---
still notes after a rule

## Prompt
What surprised you?
Keep me.

## Café review
Matcha 8/10

## Gratitude
tea
`;

describe("dates stay strings (architect-AC6)", () => {
  test("unquoted date reads back as a string", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-25\nenergy: 2\n---\n" });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.date).toBe("2026-10-25");
    expect(typeof rec!.day.date).toBe("string");
    const { data } = parseMarkdown("---\nat: 2026-10-25T08:12:03+05:00\n---\n");
    expect(data.at).toBe("2026-10-25T08:12:03+05:00");
  });
  test("parsing the same text twice gives independent objects (no gray-matter cache sharing)", () => {
    const t = "---\na: 1\n---\nx";
    const one = parseMarkdown(t);
    one.data.a = 99;
    expect(parseMarkdown(t).data.a).toBe(1);
  });
});

describe("round-trip preservation (architect-AC7, psychologist-AC9/AC11)", () => {
  test("evening update keeps unknown keys, preamble, extra sections and their order", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": RICH });
    await store.updateDay("2026-10-25", (d) => {
      d.highlight = "new highlight";
      d.satisfaction = 8;
    });
    const text = await readFile(join(dir, "days/2026-10-25.md"), "utf8");
    const { data, body } = parseMarkdown(text);
    expect(data.weather).toBe("rainy");
    expect(data.mode).toBe("exam");
    expect(data.backfilled).toBe(true);
    expect(data.satisfaction).toBe(8);
    const q = (data.quests as Record<string, unknown>[])[0]!;
    expect(q.minutes).toBe(30);
    expect(q.done_when).toBe("photo taken");
    // Key order of untouched keys is kept.
    expect(Object.keys(data).slice(0, 6)).toEqual(["date", "energy", "mode", "backfilled", "weather", "quests"]);
    // Body: only Highlight changed; everything else byte-identical and in order.
    const expectedBody = RICH.split("---\n").slice(2).join("---\n").replace("old highlight\n", "new highlight\n");
    expect(body).toBe(expectedBody);
    expect(body.indexOf("## Prompt")).toBeLessThan(body.indexOf("## Café review"));
    expect(body.indexOf("## Café review")).toBeLessThan(body.indexOf("## Gratitude"));
  });

  test("notes with Japanese, emoji, blank lines and --- survive byte-identical", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": RICH });
    const before = parseMarkdown(RICH).body;
    await store.updateDay("2026-10-25", (d) => {
      d.energy = 4;
    });
    const after = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8")).body;
    expect(after).toBe(before);
    const rec = await store.readDay("2026-10-25");
    expect(rec!.notes).toBe("川沿いを歩いた 🌿\n\n---\nstill notes after a rule");
    expect(rec!.extraSections).toEqual(["Prompt", "Café review"]);
  });

  test("heading match is case-insensitive and trims whitespace", async () => {
    const { dir, store } = await setup({
      "days/2026-10-25.md": "---\ndate: 2026-10-25\n---\n##   highlight  \nhi\n\n## NOTES\nn\n\n## gratitude\ng\n",
    });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.highlight).toBe("hi");
    expect(rec!.notes).toBe("n");
    await store.updateDay("2026-10-25", (d) => {
      d.notes = "changed";
    });
    const text = await readFile(join(dir, "days/2026-10-25.md"), "utf8");
    expect(text).toContain("##   highlight  \nhi\n");
    expect(text).toContain("## NOTES\nchanged\n");
    expect(text.match(/## /g)!.length).toBe(3);
  });

  test("saving twice produces no further change (psychologist R6)", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": RICH });
    await store.updateDay("2026-10-25", (d) => {
      d.notes = "rewritten";
      d.gratitude = "sun";
    });
    const first = await readFile(join(dir, "days/2026-10-25.md"), "utf8");
    const res = await store.updateDay("2026-10-25", (d) => {
      d.notes = "rewritten";
      d.gratitude = "sun";
    });
    expect(res.changed).toBe(false);
    expect(await readFile(join(dir, "days/2026-10-25.md"), "utf8")).toBe(first);
  });

  test("a file with no psychology fields gets none written (psychologist-AC11)", async () => {
    const { dir, store } = await setup();
    await store.updateDay("2026-10-25", (d) => {
      d.energy = 2;
    });
    const { data } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    for (const k of ["mode", "backfilled", "prompt_id"]) expect(k in data).toBe(false);
  });
});

describe("owned sections (architect-AC8)", () => {
  test("new file gets Highlight, Notes, Gratitude in order", async () => {
    const { dir, store } = await setup();
    const res = await store.updateDay("2026-10-25", (d) => {
      d.energy = 3;
    });
    const text = await readFile(join(dir, "days/2026-10-25.md"), "utf8");
    expect(parseMarkdown(text).body).toBe("## Highlight\n\n## Notes\n\n## Gratitude\n");
    expect(res.record.highlight).toBe("");
  });
  test("a hand-made file without sections gets them appended after existing text", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": "just some words\n" });
    await store.updateDay("2026-10-25", (d) => {
      d.gratitude = "friends";
    });
    const { body, data } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    expect(data.date).toBe("2026-10-25");
    expect(body).toBe("just some words\n\n## Highlight\n\n## Notes\n\n## Gratitude\nfriends\n");
  });
  test("a missing middle section is inserted in canonical position", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-25\n---\n## Highlight\nh\n\n## Mine\nm\n\n## Gratitude\ng\n" });
    await store.updateDay("2026-10-25", (d) => {
      d.notes = "n";
    });
    const { body } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    expect(body).toBe("## Highlight\nh\n\n## Notes\nn\n\n## Mine\nm\n\n## Gratitude\ng\n");
  });
  test("headings inside fenced code are not sections", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "## Notes\n```\n## Gratitude\n```\n" });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.notes).toBe("```\n## Gratitude\n```");
    expect(rec!.gratitude).toBe("");
  });
});

describe("quarantine (architect-AC9/AC10, psychologist-AC10)", () => {
  test("broken YAML: read throws unparseable_file with line, write refused, bytes identical", async () => {
    const broken = "---\ndate: 2026-10-25\nquests: [\n---\n## Notes\nmy words\n";
    const { dir, store } = await setup({ "days/2026-10-25.md": broken });
    const path = join(dir, "days/2026-10-25.md");
    const hash = await sha256File(path);
    const err = await expectStoreError(store.readDay("2026-10-25"), "unparseable_file");
    expect(err.status).toBe(422);
    expect(err.details?.raw).toBe(broken);
    expect(typeof err.details?.line).toBe("number");
    await expectStoreError(store.updateDay("2026-10-25", (d) => void (d.energy = 1)), "unparseable_file");
    expect(await sha256File(path)).toBe(hash);
    expect((await readdir(join(dir, "days"))).length).toBe(1);
  });
  test("energy 7 → invalid_file with issue paths", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-25\nenergy: 7\n---\n" });
    const err = await expectStoreError(store.readDay("2026-10-25"), "invalid_file");
    expect(JSON.stringify(err.details?.issues)).toContain("energy");
  });
  test("out-of-range values are never clamped", async () => {
    for (const fm of ["satisfaction: 11", "energy: 0"]) {
      const { store } = await setup({ "days/2026-10-25.md": `---\ndate: 2026-10-25\n${fm}\n---\n` });
      await expectStoreError(store.readDay("2026-10-25"), "invalid_file");
    }
  });
  test("missing data stays null / [] (never 0)", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-25\n---\n" });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.energy).toBeNull();
    expect(rec!.day.satisfaction).toBeNull();
    expect(rec!.day.mood).toEqual([]);
    expect(rec!.day.quests).toEqual([]);
  });
  test("date mismatch with the file name is invalid", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-24\n---\n" });
    await expectStoreError(store.readDay("2026-10-25"), "invalid_file");
  });
  test("schema > current is newer_schema and read-only", async () => {
    const text = "---\nschema: 2\ndate: 2026-10-25\n---\n";
    const { dir, store } = await setup({ "days/2026-10-25.md": text });
    await expectStoreError(store.readDay("2026-10-25"), "newer_schema");
    await expectStoreError(store.updateDay("2026-10-25", () => {}), "newer_schema");
    expect(await readFile(join(dir, "days/2026-10-25.md"), "utf8")).toBe(text);
  });
  test("missing schema is treated as 1", async () => {
    const { store } = await setup({ "days/2026-10-25.md": "---\ndate: 2026-10-25\n---\n" });
    expect((await store.readDay("2026-10-25"))!.day.schema).toBe(1);
  });
});

describe("aliases and ids (architect-AC10/AC12, psychologist-AC1/AC2)", () => {
  const legacy = `---
date: 2026-10-25
quests:
  - title: Old style
    category: outside
    difficulty: easy
    status: failed
  - title: Second
    category: rest
    difficulty: hard
    status: done
---
`;
  test("failed → let_go and category aliases in memory; a plain read doesn't modify the file", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": legacy });
    const path = join(dir, "days/2026-10-25.md");
    const hash = await sha256File(path);
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.quests[0]!.status).toBe("let_go");
    expect(rec!.day.quests[0]!.category).toBe("adventure");
    expect(rec!.day.quests[1]!.category).toBe("care");
    expect(rec!.day.quests.map((q) => q.id)).toEqual(["2026-10-25-1", "2026-10-25-2"]);
    expect(rec!.day.quests[1]!.coins).toBe(35);
    expect(await sha256File(path)).toBe(hash);
  });
  test("an unrelated save leaves hand-written aliases alone (M2 BUG-2, PROVISIONAL)", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": legacy });
    await store.updateDay("2026-10-25", (d) => void (d.energy = 3));
    const { data } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    const qs = data.quests as Record<string, unknown>[];
    expect(data.energy).toBe(3);
    expect(qs[0]!.status).toBe("failed");
    expect(qs[0]!.id).toBeUndefined();
    expect((await store.readDay("2026-10-25"))!.day.quests[0]!.status).toBe("let_go");
  });
  test("touching a quest writes its computed id and coins down; its other aliases stay", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": legacy });
    await store.updateDay("2026-10-25", (d) => void (d.quests[0]!.feedback = "down"));
    const { data } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    const qs = data.quests as Record<string, unknown>[];
    expect(qs[0]!.id).toBe("2026-10-25-1");
    expect(qs[0]!.feedback).toBe("down");
    expect(qs[0]!.status).toBe("failed");
    expect(qs[1]!.id).toBeUndefined();
  });
  test("missing id picks the next free suffix", async () => {
    const { store } = await setup({
      "days/2026-10-25.md": "---\ndate: 2026-10-25\nquests:\n  - {id: 2026-10-25-1, title: A, category: body, difficulty: easy}\n  - {slot: 1, title: B, category: mind, difficulty: easy}\n---\n",
    });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.quests.map((q) => q.id)).toEqual(["2026-10-25-1", "2026-10-25-1b"]);
  });
  test("duplicate ids → invalid_file", async () => {
    const { store } = await setup({
      "days/2026-10-25.md": "---\ndate: 2026-10-25\nquests:\n  - {id: x, title: A, category: body, difficulty: easy}\n  - {id: x, title: B, category: mind, difficulty: easy}\n---\n",
    });
    await expectStoreError(store.readDay("2026-10-25"), "invalid_file");
  });
  test("status: failed doesn't quarantine; adventure round-trips", async () => {
    const { store } = await setup({
      "days/2026-10-25.md": "---\ndate: 2026-10-25\nquests:\n  - {title: A, category: adventure, difficulty: easy, status: failed, reason: no_time}\n---\n",
    });
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.quests[0]!.category).toBe("adventure");
    expect(rec!.day.quests[0]!.reason).toBe("no_time");
  });
});

describe("derived values are never stored (psychologist-AC13)", () => {
  test("no streak / coins_total keys after a write", async () => {
    const { dir, store } = await setup();
    await store.updateDay("2026-10-25", (d) => {
      d.energy = 3;
      d.quests.push({ id: "2026-10-25-1", slot: 1, title: "T", why: "", category: "body", difficulty: "easy", coins: 10, status: "done", feedback: null, source: "pool", completed_at: null });
    });
    const { data } = parseMarkdown(await readFile(join(dir, "days/2026-10-25.md"), "utf8"));
    expect("streak" in data).toBe(false);
    expect("coins_total" in data).toBe(false);
    expect("coins" in data).toBe(false);
  });
});

describe("atomic writes + mutex (architect-AC11)", () => {
  test("20 concurrent field updates: no lost update, no tmp files", async () => {
    const { dir, store } = await setup();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.updateDay("2026-10-25", (d) => {
          d.mood = [...d.mood, `tag${i}`];
        }),
      ),
    );
    const rec = await store.readDay("2026-10-25");
    expect(rec!.day.mood.length).toBe(20);
    expect(new Set(rec!.day.mood).size).toBe(20);
    expect(await readdir(join(dir, "days"))).toEqual(["2026-10-25.md"]);
  });
  test("a mutator that throws leaves the file untouched", async () => {
    const { dir, store } = await setup({ "days/2026-10-25.md": RICH });
    const hash = await sha256File(join(dir, "days/2026-10-25.md"));
    await expect(store.updateDay("2026-10-25", () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expectStoreError(store.updateDay("2026-10-25", (d) => void (d.energy = 9)), "invalid_update");
    expect(await sha256File(join(dir, "days/2026-10-25.md"))).toBe(hash);
  });
  test("etag precondition", async () => {
    const { store } = await setup({ "days/2026-10-25.md": RICH });
    const rec = await store.readDay("2026-10-25");
    await expectStoreError(store.updateDay("2026-10-25", (d) => void (d.notes = "x"), { expectedEtag: "deadbeefdeadbeef" }), "stale");
    await expectStoreError(store.updateDay("2026-10-25", (d) => void (d.notes = "x"), { expectedEtag: "*" }), "stale");
    const ok = await store.updateDay("2026-10-25", (d) => void (d.notes = "x"), { expectedEtag: rec!.etag });
    expect(ok.record.notes).toBe("x");
    const created = await store.updateDay("2026-10-26", (d) => void (d.notes = "y"), { expectedEtag: "*" });
    expect(created.record.notes).toBe("y");
  });
});

describe("week files, kb, yaml, scans (architect-AC13, psychologist-AC12)", () => {
  const WEEK = `---
week: 2026-W43
boss:
  title: Yonkoma Week
  category: creative
  type: make
  shrunk: false
  checkpoints:
    - {text: one, done: true}
    - {text: two, done: true}
    - {text: three, done: false}
    - {text: four}
  status: open
---
## Review
went ok

## Extra
keep
`;
  test("week boss with 4 checkpoints round-trips; id and coins computed", async () => {
    const { dir, store } = await setup({ "weeks/2026-W43.md": WEEK });
    const rec = await store.readWeek("2026-W43");
    expect(rec!.week.boss!.id).toBe("2026-W43-boss");
    expect(rec!.week.boss!.coins).toBe(100);
    expect(rec!.week.boss!.checkpoints!.filter((c) => c.done).length).toBe(2);
    expect(rec!.review).toBe("went ok");
    await store.updateWeek("2026-W43", (w) => void (w.review = "better"));
    const text = await readFile(join(dir, "weeks/2026-W43.md"), "utf8");
    expect(text).toContain("## Review\nbetter\n\n## Extra\nkeep\n");
    const again = await store.readWeek("2026-W43");
    expect(again!.week.boss!.checkpoints!.length).toBe(4);
    expect(again!.week.boss!.type).toBe("make");
  });
  test("new week file", async () => {
    const { store } = await setup();
    const res = await store.updateWeek("2026-W44", () => {});
    expect(res.record.week.boss).toBeNull();
    expect(res.record.review).toBe("");
  });
  test("kb read/write with etag", async () => {
    const { store } = await setup({ "kb/profile.md": "# Profile\n" });
    const p = await store.readKb("profile");
    expect(p!.content).toBe("# Profile\n");
    await expectStoreError(store.writeKb("profile", "x", { expectedEtag: "nope" }), "stale");
    const w = await store.writeKb("profile", "# Profile\nme\n", { expectedEtag: p!.etag });
    expect((await store.readKb("profile"))!.etag).toBe(w.etag);
    expect(await store.readKb("insights")).toBeNull();
  });
  test("directory scans ignore editor temp files", async () => {
    const { store } = await setup({
      "days/2026-10-25.md": "x",
      "days/2026-10-24.md~": "x",
      "days/.2026-10-23.md.swp": "x",
      "days/.#2026-10-22.md": "x",
      "days/2026-10-21.md.tmp-abc": "x",
      "days/2026-02-30.md": "x",
      "days/notes.md": "x",
      "weeks/2026-W43.md": "",
      "weeks/2026-W43.md.swp": "",
    });
    expect(await store.listDays()).toEqual(["2026-10-25"]);
    expect(await store.listWeeks()).toEqual(["2026-W43"]);
  });
  test("path traversal is impossible", async () => {
    const { store } = await setup();
    await expectStoreError(store.readDay("../etc/passwd"), "bad_request");
    await expectStoreError(store.readDay("2026-10-25/../../x"), "bad_request");
    await expectStoreError(store.readWeek("../2026-W43"), "bad_request");
    expect(() => store.abs("../outside")).toThrow(StoreError);
  });
  test("both yaml shapes are accepted", async () => {
    const { store } = await setup({
      "quests.yaml": "schema: 1\ndaily:\n  - {title: A, category: outside, difficulty: easy}\nboss:\n  - {title: B, category: creative}\n",
      "rewards.yaml": "schema: 1\nitems:\n  - {id: treat, name: Sweet treat, price: 30, cooldown_days: 0}\n",
    });
    const pool = await store.readQuestPool();
    expect(pool!.daily[0]!.category).toBe("adventure");
    expect(pool!.boss.length).toBe(1);
    const rewards = await store.readRewards();
    expect(rewards!.items[0]!.title).toBe("Sweet treat");
  });
  test("broken yaml files are quarantined and reported by scanBroken", async () => {
    const { store } = await setup({
      "rewards.yaml": "rewards: [\n",
      "days/2026-10-25.md": "---\nenergy: 9\n---\n",
      "days/2026-10-24.md": "---\ndate: 2026-10-24\n---\n",
    });
    await expectStoreError(store.readRewards(), "unparseable_file");
    const broken = await store.scanBroken();
    expect(broken.map((w) => `${w.file}:${w.code}`).sort()).toEqual(["days/2026-10-25.md:invalid_file", "rewards.yaml:unparseable_file"]);
  });
  test("updateYaml writes atomically and refuses broken files", async () => {
    const { dir, store } = await setup({ "rewards.yaml": "rewards: [\n" });
    const { rewardsFileSchema } = await import("../src/schemas");
    await expectStoreError(store.updateYaml("rewards.yaml", rewardsFileSchema, (r) => r), "unparseable_file");
    expect(await readFile(join(dir, "rewards.yaml"), "utf8")).toBe("rewards: [\n");
    const res = await store.updateYaml("purchases.yaml", (await import("zod")).z.looseObject({}), (r) => ({ ...r, schema: 1, purchases: [] }));
    expect(res).toEqual({ schema: 1, purchases: [] });
  });
});
