/**
 * Frontmatter + body-section handling for hand-editable Markdown files.
 *
 * - Frontmatter is read with gray-matter, but with the `yaml` package (core schema) as the engine,
 *   so `date: 2026-10-25` stays a string (js-yaml would turn it into a Date). A fresh options object
 *   is passed on every call, which also bypasses gray-matter's input-keyed result cache.
 * - The body is split into an ordered list of chunks (preamble + one chunk per `## ` heading).
 *   Only the content of the app-owned sections is ever replaced; every other byte is kept.
 */
import matter from "gray-matter";
import YAML from "yaml";

export class FrontmatterError extends Error {
  override name = "FrontmatterError";
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

function yamlParse(src: string): unknown {
  return YAML.parse(src.replace(/\r(?=\n|$)/g, ""), { schema: "core", merge: false, prettyErrors: true });
}

/** Parse YAML text (for the .yaml data files) with the same date-safe settings. */
export function parseYamlText(text: string): unknown {
  try {
    return yamlParse(text);
  } catch (e) {
    throw toFrontmatterError(e, 0);
  }
}

export function stringifyYaml(data: unknown): string {
  return YAML.stringify(data, { schema: "core", lineWidth: 0, aliasDuplicateObjects: false });
}

function toFrontmatterError(e: unknown, lineOffset: number): FrontmatterError {
  if (e instanceof YAML.YAMLError) {
    const line = e.linePos?.[0]?.line;
    const first = e.message.split("\n")[0] ?? "YAML error";
    return new FrontmatterError(first, line !== undefined ? line + lineOffset : undefined);
  }
  return new FrontmatterError(e instanceof Error ? e.message : String(e));
}

export function parseMarkdown(text: string): ParsedMarkdown {
  const hasFrontmatter = /^---[ \t]*\r?\n/.test(text);
  let parsed: { data: unknown; content: string };
  try {
    parsed = matter(text, {
      language: "yaml",
      engines: {
        yaml: {
          parse: (s: string) => yamlParse(s) as object,
          stringify: () => {
            throw new Error("not used");
          },
        },
      },
    });
  } catch (e) {
    // gray-matter hands the engine the text after the opening `---`, which starts with that
    // line's newline, so YAML line numbers already equal file line numbers.
    throw toFrontmatterError(e, 0);
  }
  const data = parsed.data;
  if (data === null || data === undefined) return { data: {}, body: parsed.content, hasFrontmatter };
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new FrontmatterError("Frontmatter must be a YAML mapping (key: value lines)", 2);
  }
  return { data: data as Record<string, unknown>, body: parsed.content, hasFrontmatter };
}

export function serializeMarkdown(data: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(data)}---\n${body}`;
}

// ---------------------------------------------------------------- comment-preserving frontmatter edits (M2 BUG-2)

export interface FrontmatterParts {
  /** Everything up to and including the opening `---` line (BOM included). */
  open: string;
  /** The raw YAML between the delimiters (each line with its own line ending). */
  yaml: string;
  /** The closing `---` line including its line ending (may lack one at EOF). */
  close: string;
  body: string;
}

const DELIM_RE = /^---[ \t]*\r?\n?$/;

/**
 * Split a file into its exact frontmatter bytes and body, or null when the file has no frontmatter
 * or the split disagrees with gray-matter's (then callers fall back to a full re-serialization).
 */
export function splitFrontmatter(text: string): FrontmatterParts | null {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = text.slice(bom.length).match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (!lines[0] || !DELIM_RE.test(lines[0])) return null;
  const end = lines.findIndex((l, i) => i > 0 && DELIM_RE.test(l));
  if (end < 0) return null;
  const parts: FrontmatterParts = {
    open: bom + lines[0],
    yaml: lines.slice(1, end).join(""),
    close: lines[end]!,
    body: lines.slice(end + 1).join(""),
  };
  try {
    if (parseMarkdown(text).body !== parts.body) return null;
  } catch {
    return null;
  }
  return parts;
}

export type YamlPath = (string | number)[];
export type YamlOp = { path: YamlPath; value: unknown } | { path: YamlPath; delete: true };

const YAML_OUT = { lineWidth: 0, flowCollectionPadding: false } as const;

/** Longest-common-subsequence line alignment: returns pairs [i, j] of equal lines a[i] === b[j]. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/** True when a collection holds at least one map or sequence (as a value, for maps). */
function hasCollectionItems(node: YAML.YAMLMap | YAML.YAMLSeq): boolean {
  return node.items.some((it: unknown) => YAML.isCollection(YAML.isPair(it) ? it.value : it));
}

/**
 * Apply path operations to YAML source while keeping comments, quoting, flow style and every
 * untouched line byte-for-byte. Strategy: edit a `yaml` Document, then line-diff its canonical
 * rendering before/after the edit and splice only the changed lines into the original text.
 * The original line ending (LF or CRLF) is kept. Throws when the source can't be parsed.
 */
export function editYamlText(src: string, ops: readonly YamlOp[]): string {
  const crlf = /\r\n/.test(src);
  const lf = src.replace(/\r\n/g, "\n");
  const doc = YAML.parseDocument(lf, { schema: "core", merge: false });
  if (doc.errors.length > 0) throw toFrontmatterError(doc.errors[0], 0);
  const canon0 = doc.toString(YAML_OUT);
  for (const op of ops) {
    if ("delete" in op) {
      if (doc.hasIn(op.path)) doc.deleteIn(op.path);
      continue;
    }
    const v = op.value;
    // M2 R-BUG-1: an *empty* flow collection (`quests: []`, the template default) that receives
    // maps/lists switches to block style, so app-created files stay readable by hand. Non-empty
    // hand-written flow collections keep their style; scalar lists (`mood: [calm]`) stay flow.
    if (op.path.length > 0 && v !== null && typeof v === "object") {
      const parent = doc.getIn(op.path.slice(0, -1), true);
      if (YAML.isCollection(parent) && parent.flow && parent.items.length === 0) parent.flow = false;
    }
    if (v !== null && typeof v === "object") {
      const prev = doc.getIn(op.path, true);
      const node = doc.createNode(v);
      if (YAML.isCollection(prev) && YAML.isCollection(node) && prev.flow) {
        node.flow = prev.items.length > 0 || !hasCollectionItems(node);
      }
      doc.setIn(op.path, node);
    } else {
      doc.setIn(op.path, v);
    }
  }
  const canon1 = doc.toString(YAML_OUT);
  const origLines = lf.split("\n");
  const c0 = canon0.split("\n");
  const c1 = canon1.split("\n");
  let out: string;
  if (origLines.length === c0.length) {
    // Line i of the canonical rendering corresponds to line i of the original (formatting changes
    // are intra-line). Unchanged canonical lines are emitted as the original bytes.
    const pairs = lcsPairs(c0, c1);
    const res: string[] = [];
    let j = 0;
    for (const [pi, pj] of pairs) {
      while (j < pj) res.push(c1[j++]!);
      res.push(origLines[pi]!);
      j = pj + 1;
    }
    while (j < c1.length) res.push(c1[j++]!);
    out = res.join("\n");
  } else {
    out = canon1;
  }
  if (out !== "" && !out.endsWith("\n")) out += "\n";
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

// ---------------------------------------------------------------- owned-section escaping (M2 BUG-3)
//
// Text typed into an owned section (Notes, Highlight, …) must never create a new `## ` section or open
// a code fence that swallows the following headings. On write, such lines get one extra leading
// backslash; on read, one is removed. The mapping is a bijection on lines, so what you save is exactly
// what you read back, and the file stays readable (`\## Ideas` renders as a literal "## Ideas").

const ESC_HEADING_RE = /^(\\*)(##[ \t])/;
const UNESC_HEADING_RE = /^\\(\\*##[ \t])/;
const ESC_FENCE_RE = /^([ \t]{0,3})(\\*)(`{3,}|~{3,})/;
const UNESC_FENCE_RE = /^([ \t]{0,3})\\(\\*(?:`{3,}|~{3,}))/;

export function escapeSectionText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (ESC_HEADING_RE.test(line)) return `\\${line}`;
      const f = ESC_FENCE_RE.exec(line);
      if (f) return `${f[1]}\\${line.slice(f[1]!.length)}`;
      return line;
    })
    .join("\n");
}

export function unescapeSectionText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (UNESC_HEADING_RE.test(line)) return line.slice(1);
      const f = UNESC_FENCE_RE.exec(line);
      if (f) return f[1]! + f[2]! + line.slice(f[0].length);
      return line;
    })
    .join("\n");
}

// ---------------------------------------------------------------- body sections

export interface BodyChunk {
  /** The raw heading line including its line ending, or "" for the preamble. */
  headingLine: string;
  /** Normalized heading name (lowercase, trimmed), or null for the preamble. */
  key: string | null;
  /** Raw content after the heading line, up to the next heading. */
  content: string;
}

const HEADING_RE = /^##[ \t]+(.*?)[ \t#]*\r?\n?$/;
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

export function normalizeHeading(h: string): string {
  return h.trim().toLowerCase();
}

/** Split a body into a preamble chunk + one chunk per level-2 heading (ignoring fenced code). */
export function splitSections(body: string): BodyChunk[] {
  const lines = body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const chunks: BodyChunk[] = [{ headingLine: "", key: null, content: "" }];
  let fence: string | null = null;
  for (const line of lines) {
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1]!;
      if (fence === null) fence = marker[0]!.repeat(3);
      else if (marker.startsWith(fence)) fence = null;
    }
    const hm = fence === null && !fm ? HEADING_RE.exec(line) : null;
    if (hm) {
      chunks.push({ headingLine: line, key: normalizeHeading(hm[1] ?? ""), content: "" });
    } else {
      chunks[chunks.length - 1]!.content += line;
    }
  }
  return chunks;
}

export function joinSections(chunks: BodyChunk[]): string {
  return chunks.map((c) => c.headingLine + c.content).join("");
}

/** Text of a section as shown in the UI: leading blank lines and trailing whitespace removed. */
export function sectionText(content: string): string {
  return content.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "");
}

/** Owned-section text as shown in the UI (unescaped, see escapeSectionText). */
export function getSection(chunks: BodyChunk[], name: string): string | null {
  const key = normalizeHeading(name);
  const c = chunks.find((ch) => ch.key === key);
  return c ? unescapeSectionText(sectionText(c.content).replace(/\r\n/g, "\n")) : null;
}

function ownedContent(text: string, isLast: boolean, eol: string): string {
  const t = escapeSectionText(text.replace(/\r\n/g, "\n").replace(/\s+$/, ""));
  const s = isLast ? (t ? `${t}\n` : "") : t ? `${t}\n\n` : "\n";
  return eol === "\n" ? s : s.replace(/\n/g, eol);
}

function ensureEndsWithNewline(chunk: BodyChunk, eol: string): void {
  const whole = chunk.headingLine + chunk.content;
  if (whole.length > 0 && !whole.endsWith("\n")) chunk.content += eol;
}

/**
 * Make sure the `owned` sections exist (all of them with `ensureAll`, else only those receiving text),
 * inserting missing ones in canonical order next to their owned neighbours, or at the end), then replace the content of those listed in `values`.
 * Non-owned chunks are never modified, except that a newline may be appended to the chunk directly
 * before an inserted heading when it doesn't already end with one.
 */
export function applySections(
  body: string,
  owned: readonly string[],
  values: Readonly<Record<string, string | undefined>>,
  eol: "\n" | "\r\n" = "\n",
  /** Insert every missing owned section (new files). Otherwise only those that receive text (M2 AC17). */
  ensureAll = true,
): string {
  const chunks = splitSections(body);
  const ownedKeys = owned.map(normalizeHeading);
  const fresh = new Set<BodyChunk>();
  const valueFor = (name: string) =>
    Object.entries(values).find(([k]) => normalizeHeading(k) === normalizeHeading(name))?.[1];

  for (let i = 0; i < owned.length; i++) {
    const key = ownedKeys[i]!;
    if (chunks.some((c) => c.key === key)) continue;
    if (!ensureAll && !(valueFor(owned[i]!) ?? "").trim()) continue;
    const chunk: BodyChunk = { headingLine: `## ${owned[i]}${eol}`, key, content: eol };
    // After the closest preceding owned section that exists, else before the next one, else at end.
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) {
      const idx = chunks.findIndex((c) => c.key === ownedKeys[j]);
      if (idx >= 0) at = idx + 1;
    }
    for (let j = i + 1; j < owned.length && at < 0; j++) {
      const idx = chunks.findIndex((c) => c.key === ownedKeys[j]);
      if (idx >= 0) at = idx;
    }
    if (at < 0) at = chunks.length;
    const prev = chunks[at - 1];
    if (prev && prev.headingLine.length + prev.content.length > 0) {
      // Only whitespace is ever appended: a heading needs its own line, plus a blank line before it.
      ensureEndsWithNewline(prev, eol);
      const whole = (prev.headingLine + prev.content).replace(/\r\n/g, "\n");
      if (!whole.endsWith("\n\n")) prev.content += eol;
    }
    chunks.splice(at, 0, chunk);
    fresh.add(chunk);
  }
  const last = chunks[chunks.length - 1]!;
  if (fresh.has(last)) last.content = "";

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const key = normalizeHeading(name);
    const idx = chunks.findIndex((c) => c.key === key);
    if (idx < 0) continue;
    const chunk = chunks[idx]!;
    const current = unescapeSectionText(sectionText(chunk.content).replace(/\r\n/g, "\n"));
    if (current === value.replace(/\r\n/g, "\n").replace(/\s+$/, "")) continue;
    if (!chunk.headingLine.endsWith("\n")) chunk.headingLine += eol;
    chunk.content = ownedContent(value, idx === chunks.length - 1, eol);
  }
  return joinSections(chunks);
}
