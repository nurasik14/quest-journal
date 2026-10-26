/**
 * Serves the built SPA (`web/dist`) for every non-/api GET (architect-AC4/AC5).
 * - Only regular files inside `webDist` are ever served (decoded path + resolve + prefix check).
 * - Paths without a file extension fall back to index.html (client-side routes).
 * - Cache policy (architect-AC10): hashed /assets/* are immutable; index.html, sw.js and manifest.webmanifest are
 *   no-cache (revalidated every load, so a deploy is never pinned by a stale service worker); the rest 1 h.
 */
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Context } from "hono";

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Files that must be revalidated on every load (the service worker and the install manifest). */
export const NO_CACHE_FILES = new Set(["/sw.js", "/manifest.webmanifest"]);

/** The Cache-Control a static path gets (pure; table-tested). */
export function cacheControlFor(path: string): string {
  if (path === "/" || path === "/index.html" || NO_CACHE_FILES.has(path)) return "no-cache";
  if (path.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

const TYPES: Record<string, string> = {
  ".webmanifest": "application/manifest+json",
  ".js": "text/javascript; charset=utf-8",
};

export function createSpaHandler(webDist: string) {
  const root = resolve(webDist);
  const indexPath = resolve(root, "index.html");

  const notFound = (c: Context) => c.text("Not found", 404);

  async function sendIndex(c: Context) {
    if (!(await isFile(indexPath))) return c.text("The web app isn't built yet. Run `bun run build`.", 503);
    return new Response(Bun.file(indexPath), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  return async (c: Context) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return notFound(c);
    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return notFound(c);
    }
    if (path.includes("\0") || path.includes("\\")) return notFound(c);
    if (path === "/" || path === "/index.html") return sendIndex(c);

    const abs = resolve(root, `.${path}`);
    if (!abs.startsWith(root + sep)) return notFound(c);
    // Dotfiles (e.g. .gitignore) are never served.
    if (abs.slice(root.length).split(sep).some((seg) => seg.startsWith("."))) return notFound(c);

    if (await isFile(abs)) {
      const headers: Record<string, string> = { "Cache-Control": cacheControlFor(path) };
      const type = TYPES[extname(path)];
      if (type) headers["Content-Type"] = type;
      // The worker may control the whole origin even though it lives at /sw.js.
      if (path === "/sw.js") headers["Service-Worker-Allowed"] = "/";
      return new Response(Bun.file(abs), { headers });
    }
    // A missing file with an extension is a real 404; everything else is a client route.
    if (extname(path) !== "") return notFound(c);
    return sendIndex(c);
  };
}
