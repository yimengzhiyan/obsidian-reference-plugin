import type { TextRange } from "./text-ranges.ts";

const BLOCK_ID_AT_END = /(?:\s+)\^([A-Za-z0-9-]+)\s*$/;

export interface MarkdownBlock extends TextRange {
  text: string;
  blockId: string | null;
}

export interface BlockIdInsertion {
  content: string;
  block: MarkdownBlock;
  blockId: string;
  inserted: boolean;
}

export function findContainingBlock(
  content: string,
  selection: TextRange,
): MarkdownBlock | null {
  if (selection.from < 0 || selection.to <= selection.from || selection.to > content.length) {
    return null;
  }

  const startLine = content.lastIndexOf("\n", selection.from - 1) + 1;
  const selected = content.slice(selection.from, selection.to);
  if (selected.includes("\n\n")) return null;

  const lineEndIndex = content.indexOf("\n", selection.to);
  const currentLineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const currentLine = content.slice(startLine, currentLineEnd);

  // Obsidian block IDs for list items attach to the item line. The spike supports
  // a single-line list item and rejects selections that cross list items.
  if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(currentLine)) {
    if (selected.includes("\n")) return null;
    return makeBlock(content, startLine, currentLineEnd);
  }

  let from = startLine;
  while (from > 0) {
    const previousEnd = from - 1;
    const previousStart = content.lastIndexOf("\n", previousEnd - 1) + 1;
    if (content.slice(previousStart, previousEnd).trim() === "") break;
    from = previousStart;
  }

  let to = currentLineEnd;
  while (to < content.length) {
    const nextStart = to + 1;
    const nextEndIndex = content.indexOf("\n", nextStart);
    const nextEnd = nextEndIndex === -1 ? content.length : nextEndIndex;
    if (content.slice(nextStart, nextEnd).trim() === "") break;
    to = nextEnd;
  }

  return makeBlock(content, from, to);
}

export function ensureBlockId(
  content: string,
  selection: TextRange,
  createId: () => string,
): BlockIdInsertion | null {
  const block = findContainingBlock(content, selection);
  if (!block) return null;
  if (block.blockId) {
    return { content, block, blockId: block.blockId, inserted: false };
  }

  const blockId = createId();
  const updatedContent = `${content.slice(0, block.to)} ^${blockId}${content.slice(block.to)}`;
  return {
    content: updatedContent,
    block: { ...block, text: `${block.text} ^${blockId}`, blockId, to: block.to + blockId.length + 2 },
    blockId,
    inserted: true,
  };
}

export function findBlockById(content: string, blockId: string): MarkdownBlock | null {
  const escaped = blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)([^\\n]*\\^${escaped}\\s*)(?=\\n|$)`).exec(content);
  if (!match || match.index === undefined) return null;
  const idLineFrom = match.index + (match[0].startsWith("\n") ? 1 : 0);
  return findContainingBlock(content, { from: idLineFrom, to: idLineFrom + 1 });
}

function makeBlock(content: string, from: number, to: number): MarkdownBlock {
  const text = content.slice(from, to);
  return { from, to, text, blockId: BLOCK_ID_AT_END.exec(text)?.[1] ?? null };
}
