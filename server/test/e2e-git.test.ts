/** End-to-end write path with a real git repo (architect-AC18, BACKLOG SHOULD). */
import { afterAll, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDirs, GIT_TEST_ENV, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

async function git(dir: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...GIT_TEST_ENV } });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
}

const put = (t: Awaited<ReturnType<typeof makeTestApp>>, date: string, body: unknown, ifMatch?: string) =>
  req(t.app, `/api/days/${date}/evening`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) },
    body: JSON.stringify(body),
  });

describe("PUT evening → disk → git", () => {
  test("sanitized message, (+hand edits), 412 and 428", async () => {
    const t = await makeTestApp({ env: { GIT_ENABLED: "true" }, now: "2026-10-26T21:00:00+05:00" });
    await t.git.flush();
    expect(await git(t.dataDir, "log", "-1", "--format=%s")).toBe("qj: init");

    // missing If-Match → 428, nothing written
    expect((await put(t, "2026-10-26", { satisfaction: 7 })).status).toBe(428);

    const res = await put(t, "2026-10-26", { satisfaction: 7, notes: "secret thoughts; rm -rf /", mood: ["calm"] }, "*");
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag")!;
    const text = await readFile(join(t.dataDir, "days/2026-10-26.md"), "utf8");
    expect(text).toContain("satisfaction: 7");
    expect(text).toContain("secret thoughts");

    // a hand edit to another file while the commit is pending
    await writeFile(join(t.dataDir, "kb/profile.md"), "# Me\nhand edit\n");
    await t.git.flush();
    const msg = await git(t.dataDir, "log", "-1", "--format=%s");
    expect(msg).toBe("qj: evening 2026-10-26 (+hand edits)");
    expect(msg).not.toContain("secret");
    expect(await git(t.dataDir, "status", "--porcelain")).toBe("");

    // stale If-Match → 412, file unchanged
    const stale = await put(t, "2026-10-26", { satisfaction: 2 }, '"0123456789abcdef"');
    expect(stale.status).toBe(412);
    expect(await readFile(join(t.dataDir, "days/2026-10-26.md"), "utf8")).toBe(text);

    // no-op save → no new commit
    const head = await git(t.dataDir, "rev-parse", "HEAD");
    expect((await put(t, "2026-10-26", { satisfaction: 7, notes: "secret thoughts; rm -rf /", mood: ["calm"] }, etag)).status).toBe(200);
    await t.git.flush();
    expect(await git(t.dataDir, "rev-parse", "HEAD")).toBe(head);
  });
});
