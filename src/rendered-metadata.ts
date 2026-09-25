const HIDDEN_BLOCK_ID = "smart-ref-hidden-rendered-block-id";
const GENERATED_BLOCK_ID = /(?<![#A-Za-z0-9_])\^sr-[a-z0-9]+(?![A-Za-z0-9_-])/g;
const SOURCE_BLOCK_ID = /(?<!\S)\^sr-[a-z0-9]+(?=[ \t]*\r?$)/gm;

/** Hide generated source block IDs without removing them from Markdown or textContent. */
export function concealRenderedSmartReferenceBlockIds(root: HTMLElement, source: string): number {
  const sourceIds = new Set(Array.from(source.matchAll(SOURCE_BLOCK_ID), (match) => match[0]));
  const useRenderedFallback = source.length === 0;
  if (sourceIds.size === 0 && !useRenderedFallback) return 0;

  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }

  let count = 0;
  for (const node of nodes.reverse()) {
    if (node.parentElement?.closest(`.${HIDDEN_BLOCK_ID}`)) continue;
    const matches = Array.from(node.data.matchAll(GENERATED_BLOCK_ID))
      .filter((match) => useRenderedFallback || sourceIds.has(match[0]));
    for (const match of matches.reverse()) {
      const start = match.index!;
      const end = start + match[0].length;
      if (end < node.length) node.splitText(end);
      const part = start ? node.splitText(start) : node;
      const span = root.ownerDocument.createElement("span");
      span.className = HIDDEN_BLOCK_ID;
      span.hidden = true;
      span.style.setProperty("display", "none", "important");
      part.parentNode!.insertBefore(span, part);
      span.appendChild(part);
      count += 1;
    }
  }
  return count;
}
