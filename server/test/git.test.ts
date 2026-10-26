import { afterAll, describe, expect, test } from "bun:test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createGit, formatReason, type GitRunner } from "../src/git";
import { cleanupTempDirs, GIT_TEST_ENV, makeTempDataDir } from "./helpers";

afterAll(cleanupTempDirs);

async function sh(dir: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...GIT_TEST_ENV } });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out;
}

async function repo() {
  const dir = await makeTempDataDir();
  await sh(dir, "init", "-q");
  return dir;
}

describe("git auto-commit (architect-AC16/AC17, psychologist-AC15)", () => {
  test("3 touches inside the debounce window → exactly 1 commit with unique reasons", async () => {
    const dir = await repo();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 50, env: GIT_TEST_ENV });
    await mkdir(join(dir, "days"));
    await writeFile(join(dir, "days/2026-10-25.md"), "a");
    git.touch({ kind: "checkin", ref: "2026-10-25" }, ["days/2026-10-25.md"]);
    git.touch({ kind: "quest", ref: "2026-10-25-2", detail: "done" }, ["days/2026-10-25.md"]);
    git.touch({ kind: "checkin", ref: "2026-10-25" }, ["days/2026-10-25.md"]);
    await Bun.sleep(150);
    await git.flush();
    const log = (await sh(dir, "log", "--format=%s")).trim().split("\n");
    expect(log).toEqual(["qj: checkin 2026-10-25, quest 2026-10-25-2 done"]);
    expect(git.status().last_commit_at).not.toBeNull();
    expect(git.status().last_error).toBeNull();
  });

  test("flush commits immediately; nothing to commit is a no-op", async () => {
    const dir = await repo();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 60_000, env: GIT_TEST_ENV });
    await writeFile(join(dir, "x.md"), "1");
    git.touch({ kind: "day", ref: "2026-10-25" }, ["x.md"]);
    await git.flush();
    git.touch({ kind: "day", ref: "2026-10-25" });
    await git.flush();
    expect((await sh(dir, "log", "--format=%s")).trim().split("\n").length).toBe(1);
    git.close();
  });

  test("hand edits are flagged", async () => {
    const dir = await repo();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV });
    await writeFile(join(dir, "a.md"), "1");
    await writeFile(join(dir, "b.md"), "hand");
    git.touch({ kind: "evening", ref: "2026-10-25" }, ["a.md"]);
    await git.flush();
    expect((await sh(dir, "log", "--format=%s")).trim()).toBe("qj: evening 2026-10-25 (+hand edits)");
  });

  test("identity fallback only when the repo has no user.email", async () => {
    const dir = await repo();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV });
    await writeFile(join(dir, "a.md"), "1");
    git.touch({ kind: "day" });
    await git.flush();
    expect((await sh(dir, "log", "--format=%an <%ae>")).trim()).toBe("Quest Journal <quest-journal@localhost>");

    await sh(dir, "config", "user.email", "someone@example.test");
    await sh(dir, "config", "user.name", "Someone");
    await writeFile(join(dir, "a.md"), "2");
    git.touch({ kind: "day" });
    await git.flush();
    expect((await sh(dir, "log", "-1", "--format=%an <%ae>")).trim()).toBe("Someone <someone@example.test>");
  });

  test("a failing commit is recorded, never thrown, and retried on next touch", async () => {
    const dir = await repo();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV, log: () => {} });
    await writeFile(join(dir, "a.md"), "1");
    await writeFile(join(dir, ".git/index.lock"), "");
    git.touch({ kind: "day", ref: "2026-10-25" });
    await git.flush();
    expect(git.status().last_error).toContain("failed");
    const { rm } = await import("node:fs/promises");
    await rm(join(dir, ".git/index.lock"));
    git.touch({ kind: "quest", ref: "2026-10-25-1" });
    await git.flush();
    expect(git.status().last_error).toBeNull();
    expect((await sh(dir, "log", "--format=%s")).trim()).toBe("qj: day 2026-10-25, quest 2026-10-25-1");
  });

  test("GIT_ENABLED=false spawns no git process; no push is ever run", async () => {
    const calls: string[][] = [];
    const runner: GitRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: "a.md\0", stderr: "" };
    };
    const off = createGit({ dataDir: "/nonexistent", enabled: false, runner });
    off.touch({ kind: "day" });
    await off.flush();
    await off.init();
    expect(calls).toEqual([]);

    const on = createGit({ dataDir: "/nonexistent", enabled: true, debounceMs: 0, runner });
    on.touch({ kind: "day", ref: "2026-10-25" });
    await on.flush();
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) for (const bad of ["push", "pull", "merge", "rebase", "fetch"]) expect(c).not.toContain(bad);
  });

  test("commit messages carry only codes and ids, never free text", async () => {
    const calls: string[][] = [];
    const runner: GitRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: args[0] === "diff" ? "a.md\0" : "", stderr: "" };
    };
    const git = createGit({ dataDir: "/x", enabled: true, debounceMs: 0, runner });
    git.touch({ kind: "quest", ref: "Walk to the river and sketch", detail: "I felt sad today" });
    git.touch({ kind: "evening", ref: "2026-10-25", detail: "done" });
    // @ts-expect-error unknown kinds are rejected at compile time and sanitized at runtime
    git.touch({ kind: "my secret note" });
    await git.flush();
    const commit = calls.find((c) => c.includes("commit"))!;
    const msg = commit[commit.indexOf("-m") + 1]!;
    expect(msg).toBe("qj: quest, evening 2026-10-25 done, change");
    expect(formatReason({ kind: "day", ref: "2026-10-25" })).toBe("day 2026-10-25");
  });

  test("a write whose touch lands while add -A runs is adopted, not mislabelled (M4)", async () => {
    const dir = await repo();
    const { defaultGitRunner } = await import("../src/git");
    const real = defaultGitRunner(dir, GIT_TEST_ENV);
    let injected = false;
    // eslint-disable-next-line prefer-const
    let git: ReturnType<typeof createGit>;
    const runner: GitRunner = async (args) => {
      if (args[0] === "add" && !injected) {
        injected = true;
        await writeFile(join(dir, "kb-proposal.yaml"), "x");
        const r = await real(args);
        git.touch({ kind: "reflect", ref: "2026-10-25" }, ["kb-proposal.yaml"]);
        return r;
      }
      return real(args);
    };
    git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, env: GIT_TEST_ENV, runner });
    await writeFile(join(dir, "day.md"), "1");
    git.touch({ kind: "evening", ref: "2026-10-25" }, ["day.md"]);
    await Bun.sleep(50);
    await git.flush();
    await git.flush();
    expect((await sh(dir, "log", "--format=%s")).trim()).toBe("qj: evening 2026-10-25, reflect 2026-10-25");
  });
});
