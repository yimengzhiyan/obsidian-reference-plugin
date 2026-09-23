/** Block IDs belong to source Markdown, not the rendered DOM. */
export function sourceBlockMarkdown(source: string): string {
  return source.replace(/\s+\^[A-Za-z0-9-]+\s*$/, "");
}

/** Full block equality prevents a substring in another paragraph from winning.
 * Duplicate visible blocks are ambiguous and must not select an arbitrary one. */
export function findRenderedBlockIndex(expected: string, candidates: readonly string[]): number | null {
  const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
  const needle = normalize(expected);
  if (!needle) return null;
  const matches = candidates.flatMap((text, index) => normalize(text) === needle ? [index] : []);
  return matches.length === 1 ? matches[0] : null;
}
