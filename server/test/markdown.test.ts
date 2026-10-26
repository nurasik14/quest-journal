import { describe, expect, test } from "bun:test";
import { applySections, getSection, parseMarkdown, serializeMarkdown, splitSections } from "../src/markdown";

const OWNED = ["Highlight", "Notes", "Gratitude"] as const;

describe("markdown sections", () => {
  test("split + join is lossless", () => {
    const body = "pre\n\n## A\na\n### sub\nx\n## B\nb";
    const chunks = splitSections(body);
    expect(chunks.map((c) => c.key)).toEqual([null, "a", "b"]);
    expect(chunks.map((c) => c.headingLine + c.content).join("")).toBe(body);
  });
  test("CRLF files keep their line endings in untouched sections", () => {
    const body = "## Highlight\r\nhi\r\n\r\n## Mine\r\nkeep\r\n\r\n## Notes\r\nold\r\n\r\n## Gratitude\r\n";
    const out = applySections(body, OWNED, { Notes: "new" });
    expect(out).toContain("## Mine\r\nkeep\r\n\r\n");
    expect(out).toContain("## Highlight\r\nhi\r\n\r\n");
    expect(getSection(splitSections(out), "notes")).toBe("new");
  });
  test("heading at EOF without newline", () => {
    const out = applySections("## Highlight\nx\n\n## Notes\n\n## Gratitude", OWNED, { Gratitude: "g" });
    expect(out).toBe("## Highlight\nx\n\n## Notes\n\n## Gratitude\ng\n");
  });
  test("text without trailing newline gets one before an appended heading", () => {
    expect(applySections("words", OWNED, {})).toBe("words\n\n## Highlight\n\n## Notes\n\n## Gratitude\n");
  });
  test("empty value clears a section", () => {
    const out = applySections("## Highlight\nx\n\n## Notes\nn\n\n## Gratitude\ng\n", OWNED, { Notes: "" });
    expect(out).toBe("## Highlight\nx\n\n## Notes\n\n## Gratitude\ng\n");
  });
  test("### headings and #-only lines are not owned sections", () => {
    const chunks = splitSections("## Notes\n### Notes\n# Notes\n");
    expect(chunks.filter((c) => c.key === "notes").length).toBe(1);
  });
});

describe("frontmatter", () => {
  test("serialize → parse round-trip keeps strings that look like other types", () => {
    const data = { date: "2026-10-25", n: "null", yes: "yes", num: "10", t: "a: b", long: "x".repeat(200) };
    const text = serializeMarkdown(data, "## Notes\n");
    expect(parseMarkdown(text).data).toEqual(data);
    expect(text.split("\n").some((l) => l.length > 200)).toBe(true); // no line wrapping
  });
  test("CRLF frontmatter parses cleanly", () => {
    expect(parseMarkdown("---\r\nenergy: 2\r\n---\r\nbody").data).toEqual({ energy: 2 });
  });
  test("non-mapping frontmatter is an error", () => {
    expect(() => parseMarkdown("---\n- a\n---\n")).toThrow();
  });
  test("file without frontmatter", () => {
    expect(parseMarkdown("## Notes\nx\n")).toEqual({ data: {}, body: "## Notes\nx\n", hasFrontmatter: false });
  });
});
