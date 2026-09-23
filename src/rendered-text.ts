import type { TextRange } from "./text-ranges.ts";

interface NormalizedText {
  text: string;
  starts: number[];
  ends: number[];
}

function normalizeWithOffsets(value: string): NormalizedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const whitespace = /\s/u.test(value[index]);
    if (whitespace && text.endsWith(" ")) {
      ends[ends.length - 1] = index + 1;
      continue;
    }
    text += whitespace ? " " : value[index];
    starts.push(index);
    ends.push(index + 1);
  }
  return { text, starts, ends };
}

/** Finds a unique rendered phrase while allowing Markdown's whitespace folding.
 * Ambiguous repeats require the stored surrounding context. */
export function findRenderedTextRange(
  rendered: string,
  selectedText: string,
  prefix: string,
  suffix: string,
): TextRange | null {
  const normalized = normalizeWithOffsets(rendered);
  const needle = normalizeWithOffsets(selectedText).text.trim();
  if (!needle) return null;
  const occurrences: number[] = [];
  let cursor = 0;
  while (cursor <= normalized.text.length) {
    const index = normalized.text.indexOf(needle, cursor);
    if (index < 0) break;
    occurrences.push(index);
    cursor = index + needle.length;
  }
  const normalizedPrefix = normalizeWithOffsets(prefix).text;
  const normalizedSuffix = normalizeWithOffsets(suffix).text;
  const contextual = occurrences.filter((index) =>
    normalized.text.slice(0, index).endsWith(normalizedPrefix) &&
    normalized.text.slice(index + needle.length).startsWith(normalizedSuffix)
  );
  const found = occurrences.length === 1
    ? occurrences[0]
    : contextual.length === 1 ? contextual[0] : null;
  if (found === null) return null;
  return {
    from: normalized.starts[found],
    to: normalized.ends[found + needle.length - 1],
  };
}
