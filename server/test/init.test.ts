import { afterAll, describe, expect, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGit } from "../src/git";
import { INSIGHTS_TEMPLATE, initDataRepo, PROFILE_TEMPLATE } from "../src/init";
import { createStore } from "../src/store";
import { cleanupTempDirs, GIT_TEST_ENV, makeTempDataDir, SEED_DIR, sha256File } from "./helpers";

afterAll(cleanupTempDirs);

async function gitLog(dir: string): Promise<string[]> {
  const p = Bun.spawn(["git", "-C", dir, "log", "--format=%s"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...GIT_TEST_ENV } });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.split("\n").filter(Boolean);
}

describe("data-repo init (architect-AC14/AC15, psychologist-AC5..AC8)", () => {
  test("creates layout, templates, copies seeds byte-for-byte, git inits", async () => {
    const root = await makeTempDataDir();
    const dir = join(root, "nested", "quest-data-test");
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV });
    const res = await initDataRepo({ dataDir: dir, seedDir: SEED_DIR, git });
    await git.flush();
    for (const d of ["days", "weeks", "kb", "kb/proposals", ".git"]) expect((await stat(join(dir, d))).isDirectory()).toBe(true);
    expect(await readFile(join(dir, "kb/profile.md"), "utf8")).toBe(PROFILE_TEMPLATE);
    expect(await readFile(join(dir, "kb/insights.md"), "utf8")).toBe(INSIGHTS_TEMPLATE);
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain("*.swp");
    for (const f of ["quests.yaml", "rewards.yaml"]) expect(await sha256File(join(dir, f))).toBe(await sha256File(join(SEED_DIR, f)));
    expect(res.warnings).toEqual([]);
    expect(await gitLog(dir)).toEqual(["qj: init"]);
  });

  test("seeded insights has no bullets and profile makes no claims", () => {
    expect(INSIGHTS_TEMPLATE.split("\n").filter((l) => l.startsWith("- ")).length).toBe(0);
    expect(PROFILE_TEMPLATE.split("\n").filter((l) => l.startsWith("- ")).length).toBe(0);
    expect(PROFILE_TEMPLATE).not.toMatch(/introvert|extravert|anxious|personality:/i);
  });

  test("seeds parse without warnings: 48 daily (6 per category, each with an easy), 10 bosses, key prices", async () => {
    const dir = await makeTempDataDir();
    await initDataRepo({ dataDir: dir, seedDir: SEED_DIR });
    const store = createStore({ dataDir: dir });
    const pool = (await store.readQuestPool())!;
    expect(pool.daily.length).toBe(48);
    const byCat = new Map<string, typeof pool.daily>();
    for (const q of pool.daily) byCat.set(q.category, [...(byCat.get(q.category) ?? []), q]);
    expect(byCat.size).toBe(8);
    for (const [, qs] of byCat) {
      expect(qs.length).toBe(6);
      expect(qs.some((q) => q.difficulty === "easy")).toBe(true);
    }
    expect(pool.boss.length).toBeGreaterThanOrEqual(4);
    expect(pool.boss.every((b) => (b.checkpoints?.length ?? 0) === 4)).toBe(true);
    const rewards = (await store.readRewards())!;
    const price = (id: string) => rewards.items.find((r) => r.id === id)?.price;
    expect(price("treat")).toBe(50);
    expect(price("cafe-meal")).toBe(150);
    expect(price("manga-volume")).toBe(350);
    expect(await store.scanBroken()).toEqual([]);
  });

  test("idempotent, never overwrites user edits, doesn't re-init git", async () => {
    const dir = await makeTempDataDir();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV });
    await initDataRepo({ dataDir: dir, seedDir: SEED_DIR, git });
    await git.flush();
    const rewards = (await readFile(join(dir, "rewards.yaml"), "utf8")).replace("price: 350", "price: 400");
    await writeFile(join(dir, "rewards.yaml"), rewards);
    await writeFile(join(dir, "kb/profile.md"), "# Me\nmine\n");
    const h1 = await sha256File(join(dir, "rewards.yaml"));
    const h2 = await sha256File(join(dir, "kb/profile.md"));
    const headBefore = await readFile(join(dir, ".git/HEAD"), "utf8");
    const res = await initDataRepo({ dataDir: dir, seedDir: SEED_DIR, git });
    await git.flush();
    expect(res.created).toEqual([]);
    expect(await sha256File(join(dir, "rewards.yaml"))).toBe(h1);
    expect(await sha256File(join(dir, "kb/profile.md"))).toBe(h2);
    expect(await readFile(join(dir, ".git/HEAD"), "utf8")).toBe(headBefore);
    expect((await gitLog(dir)).length).toBe(1);
  });

  test("missing seed dir produces a warning, not a crash", async () => {
    const dir = await makeTempDataDir();
    const res = await initDataRepo({ dataDir: dir, seedDir: join(dir, "nope") });
    expect(res.warnings.length).toBe(2);
  });

  test("refuses ~/quest-data under tests", async () => {
    const { homedir } = await import("node:os");
    await expect(initDataRepo({ dataDir: join(homedir(), "quest-data"), seedDir: SEED_DIR })).rejects.toThrow(/temp DATA_DIR/);
  });
});
