import { findBlockById } from "./blocks.ts";
import type { PreciseReference } from "./model.ts";
import type { TextRange } from "./text-ranges.ts";

export type LocateResult =
  | { kind: "exact"; range: TextRange }
  | { kind: "block-only"; range: TextRange }
  | { kind: "missing-block" };

export function locateReference(content: string, reference: PreciseReference): LocateResult {
  const block = findBlockById(content, reference.blockId);
  if (!block) return { kind: "missing-block" };

  const stored = content.slice(reference.startOffset, reference.endOffset);
  if (
    stored === reference.selectedText &&
    reference.startOffset >= block.from &&
    reference.endOffset <= block.to
  ) {
    return { kind: "exact", range: { from: reference.startOffset, to: reference.endOffset } };
  }

  const occurrences: number[] = [];
  let cursor = 0;
  while (cursor <= block.text.length) {
    const index = block.text.indexOf(reference.selectedText, cursor);
    if (index === -1) break;
    occurrences.push(index);
    cursor = index + Math.max(reference.selectedText.length, 1);
  }

  if (occurrences.length === 1) {
    const from = block.from + occurrences[0];
    return { kind: "exact", range: { from, to: from + reference.selectedText.length } };
  }

  const contextual = occurrences.filter((offset) => {
    const before = block.text.slice(Math.max(0, offset - reference.prefix.length), offset);
    const after = block.text.slice(
      offset + reference.selectedText.length,
      offset + reference.selectedText.length + reference.suffix.length,
    );
    return before.endsWith(reference.prefix) && after.startsWith(reference.suffix);
  });

  if (contextual.length === 1) {
    const from = block.from + contextual[0];
    return { kind: "exact", range: { from, to: from + reference.selectedText.length } };
  }

  return { kind: "block-only", range: { from: block.from, to: block.to } };
}
