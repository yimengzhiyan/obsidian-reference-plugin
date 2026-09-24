import { debugLog } from "./debug.ts";

// Obsidian's private Backlinks DOM: deliberately exclude global search and editors.
const BACKLINKS = '.backlink-pane, .embedded-backlinks, [data-type="backlink"]';
const SNIPPET = ".search-result-file-matched-text";
const HIDDEN = "smart-ref-hidden-backlink-metadata";

function reveal(root: Element): void {
  root.querySelectorAll(`span.${HIDDEN}`).forEach((span) => {
    span.replaceWith(...Array.from(span.childNodes));
  });
}

/** Hide only complete reserved markers, even when search-match spans split them. */
export function concealBacklinkSnippet(snippet: Element): number {
  if (!snippet.matches(SNIPPET) || !snippet.closest(BACKLINKS) || snippet.closest(".cm-editor")) return 0;
  const doc = snippet.ownerDocument;
  const walker = doc.createTreeWalker(snippet, 4 /* SHOW_TEXT */);
  const nodes: Array<{ node: Text; from: number; to: number }> = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const from = text.length;
    text += node.textContent ?? "";
    nodes.push({ node: node as Text, from, to: text.length });
  }
  const matches = Array.from(text.matchAll(/%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/g));
  let count = 0;
  // Work backwards so splitting a Text node cannot invalidate earlier offsets.
  for (const match of matches.reverse()) {
    const start = match.index!;
    const end = start + match[0].length;
    for (const { node, from, to } of [...nodes].reverse()) {
      if (to <= start || from >= end || node.parentElement?.closest(`.${HIDDEN}`)) continue;
      const localStart = Math.max(start, from) - from;
      const localEnd = Math.min(end, to) - from;
      if (localEnd < node.length) node.splitText(localEnd);
      const part = localStart ? node.splitText(localStart) : node;
      const span = doc.createElement("span");
      span.className = HIDDEN;
      span.hidden = true;
      span.style.setProperty("display", "none", "important");
      part.parentNode!.insertBefore(span, part);
      span.appendChild(part);
      count++;
    }
  }
  return count;
}

/** Presentation only. Preserve textContent, links, attributes and native handlers. */
export function startBacklinksCleanup(root: HTMLElement): () => void {
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  let stopped = false;
  const collect = (node: Node, snippets: Set<Element>, descendants = false): void => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element) return;
    const parent = element.closest(SNIPPET);
    if (parent) snippets.add(parent);
    if (descendants) element.querySelectorAll(SNIPPET).forEach((snippet) => snippets.add(snippet));
  };
  const clean = (snippets: Set<Element>): void => {
    observer.disconnect();
    let count = 0;
    try {
      for (const snippet of snippets) {
        if (root.contains(snippet)) {
          // Obsidian may reuse nodes when a result changes; never retain stale hiding.
          reveal(snippet);
          count += concealBacklinkSnippet(snippet);
        }
      }
      if (count) debugLog(() => ["[Smart Reference] Backlinks metadata hidden", { hiddenSpanCount: count }]);
    } finally {
      if (!stopped) observer.observe(root, { childList: true, characterData: true, subtree: true });
    }
  };
  const observer = new Observer((records) => {
    const snippets = new Set<Element>();
    for (const record of records) {
      collect(record.target, snippets);
      record.addedNodes.forEach((node) => collect(node, snippets, true));
    }
    clean(snippets);
  });
  clean(new Set(root.querySelectorAll(SNIPPET)));
  return () => {
    stopped = true;
    observer.disconnect();
    reveal(root);
  };
}
