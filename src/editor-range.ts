import type { TextRange } from "./text-ranges.ts";

/** Obsidian positions are zero-based; CodeMirror document lines are one-based.
 * Convert recovered source offsets rather than reusing stale stored offsets. */
export function toEditorHighlightRange(
  range: TextRange,
  sourceLength: number,
  offsetToPos: (offset: number) => { line: number; ch: number },
  doc: { lines: number; line: (number: number) => { from: number; length: number } },
): TextRange | null {
  if (!Number.isInteger(range.from) || !Number.isInteger(range.to) ||
      range.from < 0 || range.to <= range.from || range.to > sourceLength) return null;
  const convert = (offset: number): number | null => {
    const pos = offsetToPos(offset);
    if (!Number.isInteger(pos.line) || !Number.isInteger(pos.ch) ||
        pos.line < 0 || pos.line >= doc.lines || pos.ch < 0) return null;
    const line = doc.line(pos.line + 1);
    return pos.ch <= line.length ? line.from + pos.ch : null;
  };
  const from = convert(range.from);
  const to = convert(range.to);
  return from !== null && to !== null && from < to ? { from, to } : null;
}
