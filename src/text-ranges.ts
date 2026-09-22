export interface TextRange {
  from: number;
  to: number;
}

export type TextRangeSearchResult =
  | { kind: "not-found" }
  | { kind: "multiple"; count: number }
  | { kind: "unique"; range: TextRange };

export function findUniqueTextRange(
  content: string,
  text: string,
): TextRangeSearchResult {
  const ranges: TextRange[] = [];
  let searchFrom = 0;

  while (searchFrom <= content.length) {
    const from = content.indexOf(text, searchFrom);
    if (from === -1) break;
    ranges.push({ from, to: from + text.length });
    searchFrom = from + Math.max(text.length, 1);
  }

  if (ranges.length === 0) return { kind: "not-found" };
  if (ranges.length > 1) return { kind: "multiple", count: ranges.length };
  return { kind: "unique", range: ranges[0] };
}
