import { debugLog } from "./debug.ts";

// Obsidian's private Backlinks DOM: deliberately exclude global search and editors.
const PANE = ".backlink-pane";
const MATCH = ".search-result-file-match";
const HIDDEN = "smart-ref-hidden-backlink-metadata";

function reveal(root: Element): void {
  root.querySelectorAll(`span.${HIDDEN}`).forEach((span) => {
    span.replaceWith(...Array.from(span.childNodes));
  });
}

/** Hide only complete reserved markers, even when search-match spans split them. */
export function concealBacklinkMatch(snippet: Element): number {
  if (!snippet.matches(MATCH) || !snippet.closest(PANE) || snippet.closest(".cm-editor")) return 0;
  const doc = snippet.ownerDocument;
  const walker = doc.createTreeWalker(snippet, 4 /* SHOW_TEXT */);
  const nodes: Array<{ node: Text; from: number; to: number }> = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const from = text.length;
    text += node.textContent ?? "";
    nodes.push({ node: node as Text, from, to: text.length });
  }
  const matches = Array.from(text.matchAll(/%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->|(?<![A-Za-z0-9_])\^sr-[0-9a-f]{8}(?![A-Za-z0-9_-])/g));
  let count = 0;
  // Work backwards so splitting a Text node cannot invalidate earlier offsets.
  for (const match of matches.reverse()) {
    const start = match.index!;
    const end = start + match[0].length;
    let hidden = false;
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
      hidden = true;
    }
    if (hidden) count++;
  }
  return count;
}

/** Observe rendering inside one pane; keep original text and native handlers. */
function observePane(pane: Element): () => void {
  const Observer = pane.ownerDocument.defaultView!.MutationObserver;
  const collect = (node: Node, rows: Set<Element>, descendants = false): void => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element) return;
    const row = element.closest(MATCH);
    if (row && pane.contains(row)) rows.add(row);
    if (descendants) element.querySelectorAll(MATCH).forEach((match) => rows.add(match));
  };
  const clean = (rows: Set<Element>, reason: string): void => {
    observer.disconnect();
    let matchedNodesCount = 0;
    let hiddenMarkerCount = 0;
    try {
      for (const row of rows) {
        if (!pane.contains(row)) continue;
        matchedNodesCount++;
        // Reused rows may contain changed or now ordinary text.
        reveal(row);
        hiddenMarkerCount += concealBacklinkMatch(row);
      }
      debugLog(() => ["[Smart Reference] Backlinks cleanup", {
        reason, matchedNodesCount, hiddenMarkerCount,
      }]);
    } finally {
      observer.observe(pane, {
        childList: true, characterData: true, subtree: true,
        attributes: true, attributeFilter: ["class"],
      });
    }
  };
  const observer = new Observer((records) => {
    const rows = new Set<Element>();
    for (const record of records) {
      collect(record.target, rows);
      record.addedNodes.forEach((node) => collect(node, rows, true));
    }
    clean(rows, "pane-mutation");
  });
  clean(new Set(pane.querySelectorAll(MATCH)), "pane-attached");
  return () => {
    observer.disconnect();
    reveal(pane);
  };
}

/** Discover panes opened/replaced after startup; content observation stays pane-local. */
export function startBacklinksCleanup(root: HTMLElement): () => void {
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  const panes = new Map<Element, () => void>();
  const discover = (node: Node): void => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const candidates = Array.from(element.querySelectorAll(PANE));
    if (element.matches(PANE)) candidates.unshift(element);
    for (const pane of candidates) {
      if (root.contains(pane) && !panes.has(pane)) panes.set(pane, observePane(pane));
    }
  };
  const discovery = new Observer((records) => {
    for (const [pane, stop] of panes) {
      if (!root.contains(pane) || !pane.matches(PANE)) {
        stop();
        panes.delete(pane);
      }
    }
    for (const record of records) {
      if (record.type === "attributes") discover(record.target);
      record.addedNodes.forEach(discover);
    }
  });
  discover(root);
  discovery.observe(root, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  return () => {
    discovery.disconnect();
    for (const stop of panes.values()) stop();
    panes.clear();
  };
}
