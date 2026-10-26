/**
 * `kb/insights.md` parsing and byte-preserving line edits (architecture.md §2.7, sprint M4 goal 7/13).
 * PURE: no I/O.
 *
 * Format: `- [i-0001] Text. (evidence: 2026-10-12, 2026-10-19)`. Lines that don't match are kept verbatim
 * and counted in `unparsed_lines` (blank lines, headings and blockquotes aren't counted).
 * Edits touch only the target line: every other byte (CRLF, comments, hand bullets) stays identical.
 */
import { INSIGHT_LIMITS } from "./domain";

export const ITEM_RE = /^- \[(i-\d{4})\] (.+?)(?: \(evidence: ([0-9, -]+)\))?$/;
export const INSIGHT_ID_RE = /^i-\d{4}$/;

export interface InsightItem {
  id: string;
  text: string;
  evidence: string[];
  /** 0-based index into `lines`. */
  line: number;
}

export interface ParsedInsights {
  /** Lines including their terminators (`\n`, `\r\n` or none for the last line). */
  lines: string[];
  items: InsightItem[];
  unparsed_lines: number;
  eol: "\n" | "\r\n";
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f\u2028\u2029]+/g;
/** Soft hyphen, zero-width, bidi embeddings/overrides, word joiners/invisible operators, BOM. */
export const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * The one sanitiser for every insight op text, including the user's accept-time override (architect-AC6):
 * control chars and newlines → one space, URLs → `[link removed]`, `<`/`>` removed, spaces collapsed, trimmed,
 * then capped at `max` chars. Returns "" when nothing is left (the caller drops the op).
 */
export function sanitizeOpText(s: string, max: number = INSIGHT_LIMITS.opText): string {
  // Invisible / bidi characters are removed (not spaced) BEFORE anything else, so "ig\u00ADnore" can't slip
  // past the suspicious-op test and "a\u202Eb" can't spoof the rendering (architect-AC18, tester M4 LOW-5).
  let t = s.replace(INVISIBLE_RE, "").replace(CONTROL_RE, " ").replace(URL_RE, "[link removed]").replace(/[<>]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > max) t = t.slice(0, max).trimEnd();
  return t;
}

/** Split keeping line terminators, so joining gives back the exact bytes. */
export function splitLinesKeep(text: string): string[] {
  if (text === "") return [];
  const out = text.match(/[^\n]*\n|[^\n]+$/g);
  return out ?? [];
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, "");
}

export function parseInsights(text: string | null | undefined): ParsedInsights {
  const src = text ?? "";
  const lines = splitLinesKeep(src);
  const items: InsightItem[] = [];
  let unparsed = 0;
  let inComment = false;
  lines.forEach((raw, i) => {
    const l = stripEol(raw);
    const t = l.trim();
    // Obsidian %% comments %% may span lines; their content is never an item.
    const toggles = (t.match(/%%/g) ?? []).length;
    if (inComment || t.startsWith("%%")) {
      if (toggles % 2 === 1) inComment = !inComment;
      return;
    }
    if (t === "" || t.startsWith("#") || t.startsWith(">") || t === "---") return;
    const m = ITEM_RE.exec(l);
    if (m) {
      items.push({
        id: m[1]!,
        text: m[2]!,
        evidence: (m[3] ?? "")
          .split(",")
          .map((d) => d.trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        line: i,
      });
    } else {
      unparsed++;
    }
  });
  const crlf = /\r\n/.test(src) && !/(^|[^\r])\n/.test(src);
  return { lines, items, unparsed_lines: unparsed, eol: crlf ? "\r\n" : "\n" };
}

export function formatItem(id: string, text: string, evidence: readonly string[]): string {
  const ev = [...new Set(evidence)].sort();
  return `- [${id}] ${text}${ev.length ? ` (evidence: ${ev.join(", ")})` : ""}`;
}

export function idNumber(id: string): number {
  const m = /^i-(\d{4})$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function formatId(n: number): string {
  return `i-${String(n).padStart(4, "0")}`;
}

/** At the cap, `add` ops are refused and the prompt switches to consolidation mode (§2.7). */
export function atCap(p: ParsedInsights): boolean {
  const chars = p.items.reduce((n, it) => n + it.text.length, 0);
  return p.items.length >= INSIGHT_LIMITS.capBullets || chars >= INSIGHT_LIMITS.capChars;
}

export type LineOp =
  | { op: "add"; id: string; text: string; evidence: readonly string[] }
  | { op: "edit"; id: string; text: string; evidence: readonly string[] }
  | { op: "remove"; id: string };

/**
 * Apply ops to the raw text, touching only the target lines. `add` goes after the last bullet line
 * (any `- `/`* ` line), or at the end. Throws if an edit/remove target is missing (callers check first).
 */
export function applyLineOps(text: string, ops: readonly LineOp[]): string {
  let p = parseInsights(text);
  let lines = [...p.lines];
  for (const op of ops) {
    p = parseInsights(lines.join(""));
    lines = [...p.lines];
    if (op.op === "add") {
      let at = -1;
      lines.forEach((l, i) => {
        if (/^\s*[-*] /.test(stripEol(l))) at = i;
      });
      const insertAt = at >= 0 ? at + 1 : lines.length;
      // The line before the insertion point needs a terminator.
      const prev = insertAt - 1;
      if (prev >= 0 && !/\n$/.test(lines[prev]!)) lines[prev] = lines[prev]! + p.eol;
      lines.splice(insertAt, 0, formatItem(op.id, op.text, op.evidence) + p.eol);
      continue;
    }
    const item = p.items.find((it) => it.id === op.id);
    if (!item) throw new Error(`insight ${op.id} not found`);
    const raw = lines[item.line]!;
    const term = /\r\n$/.test(raw) ? "\r\n" : /\n$/.test(raw) ? "\n" : "";
    if (op.op === "edit") lines[item.line] = formatItem(op.id, op.text, op.evidence) + term;
    else lines.splice(item.line, 1);
  }
  return lines.join("");
}
