/**
 * A tiny, text-only Markdown preview for profile.md (designer-AC14, architect-AC8). It produces plain blocks that
 * the template renders with text interpolation: no HTML is ever built from the file (part of it may be
 * AI-drafted), no links are made clickable, nothing is interpreted beyond headings, bullets and paragraphs.
 */
export type NoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'para'; text: string };

export function noteBlocks(md: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'para', text: para.join(' ') });
    para = [];
  };
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (h) {
      flush();
      out.push({ kind: 'heading', text: h[1]!.trim() });
    } else if (li) {
      flush();
      const last = out.at(-1);
      if (last?.kind === 'list') last.items.push(li[1]!);
      else out.push({ kind: 'list', items: [li[1]!] });
    } else if (q) {
      flush();
      out.push({ kind: 'quote', text: q[1]! });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

/** True when the preview has nothing but headings (an untouched template). */
export function onlyHeadings(blocks: readonly NoteBlock[]): boolean {
  return blocks.every((b) => b.kind === 'heading');
}
