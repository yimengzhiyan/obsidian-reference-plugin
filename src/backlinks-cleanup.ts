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

/** Keep observing the stable UI root while Obsidian replaces panes and results. */
export type BacklinksCleanup = (() => void) & { refresh(): void };

export function startBacklinksCleanup(root: HTMLElement): BacklinksCleanup {
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  let stopped = false;
  let panes = new Set<Element>();
  const clean = (reason: string): void => {
    if (stopped) return;
    const currentPanes = new Set(root.querySelectorAll(PANE));
    if (root.matches(PANE)) currentPanes.add(root);
    for (const pane of panes) {
      if (!currentPanes.has(pane)) reveal(pane);
    }
    panes = currentPanes;
    const rows = new Set<Element>();
    for (const pane of panes) pane.querySelectorAll(MATCH).forEach((row) => rows.add(row));
    let markersHidden = 0;
    for (const row of rows) {
      // Reconcile the current DOM, not cached row identities from before navigation.
      reveal(row);
      markersHidden += concealBacklinkMatch(row);
    }
    debugLog(() => ["[Smart Reference] Backlinks cleanup", {
      reason, panesFound: panes.size, matchedBacklinkRows: rows.size, hiddenMarkerCount: markersHidden,
      rootConnected: root.isConnected,
    }]);
    // All writes above are synchronous. Discard only the records produced by this
    // cleanup; remain subscribed to subsequent renders, including other observers.
    observer.takeRecords();
  };
  const observer = new Observer((records) => {
    if (stopped) return;
    debugLog(() => ["[Smart Reference] Backlinks observer triggered", {
      mutationCount: records.length,
    }]);
    // A refresh may rebuild any ancestor of a row. Re-read the current panes rather
    // than guessing affected rows from the old nodes in the mutation records.
    clean("render-mutation");
  });
  observer.observe(root, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["class", "hidden", "style"],
  });
  clean("initial-render");
  const stop = () => {
    stopped = true;
    observer.disconnect();
    for (const pane of panes) reveal(pane);
    reveal(root);
    panes.clear();
  };
  return Object.assign(stop, { refresh: () => clean("workspace-refresh") });
}


/** Backlinks may live in a workspace document other than the main editor window. */
export function createBacklinksCleanupManager() {
  const documents = new Map<Document, { root: HTMLElement; cleanup: BacklinksCleanup }>();
  let stopped = false;
  const detach = (doc: Document) => {
    documents.get(doc)?.cleanup();
    documents.delete(doc);
  };
  return {
    attach(doc: Document): void {
      if (stopped || !doc.defaultView || !doc.documentElement) return;
      const root = doc.documentElement;
      if (documents.get(doc)?.root === root) return;
      detach(doc);
      // Observe above body so a rebuilt workspace/body cannot orphan the observer.
      documents.set(doc, { root, cleanup: startBacklinksCleanup(root) });
    },
    detach,
    refresh(): void {
      if (stopped) return;
      for (const { cleanup } of documents.values()) cleanup.refresh();
    },
    destroy(): void {
      stopped = true;
      for (const doc of documents.keys()) detach(doc);
    },
  };
}
