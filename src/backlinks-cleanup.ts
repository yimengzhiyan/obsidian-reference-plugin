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

type HiddenTextRange = { from: number; to: number };

function hiddenTextRanges(text: string): HiddenTextRange[] {
  const ranges: HiddenTextRange[] = [];
  const wikiLinks = Array.from(text.matchAll(/\[\[([\s\S]*?)\]\]/g));

  for (const match of wikiLinks) {
    const linktext = match[1];
    const aliasSeparator = findUnescapedAliasSeparator(linktext);
    if (aliasSeparator < 0) continue;
    const target = linktext.slice(0, aliasSeparator).replace(/[\u200B\uFEFF\r\n]/g, "");
    if (!/#\^sr-[a-z0-9]+$/.test(target)) continue;
    const from = match.index!;
    ranges.push({ from, to: from + 2 + aliasSeparator + 1 });
    ranges.push({ from: from + match[0].length - 2, to: from + match[0].length });
  }

  for (const match of text.matchAll(/%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/g)) {
    ranges.push({ from: match.index!, to: match.index! + match[0].length });
  }

  for (const match of text.matchAll(/(?<![A-Za-z0-9_])\^sr-[a-z0-9]+(?![A-Za-z0-9_-])/g)) {
    const from = match.index!;
    if (wikiLinks.some((link) => from >= link.index! && from < link.index! + link[0].length)) continue;
    ranges.push({ from, to: from + match[0].length });
  }

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to);
}

function findUnescapedAliasSeparator(linktext: string): number {
  for (let index = 0; index < linktext.length; index += 1) {
    if (linktext[index] !== "|") continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && linktext[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}
const skipReason = (row: Element) => !row.matches(MATCH) ? "not-backlink-row"
  : !row.closest(PANE) ? "outside-backlink-pane"
  : row.closest(".cm-editor") ? "inside-cm-editor" : null;

/** Hide only complete reserved markers, even when search-match spans split them. */
export function concealBacklinkMatch(snippet: Element): number {
  if (skipReason(snippet)) return 0;
  const doc = snippet.ownerDocument;
  const walker = doc.createTreeWalker(snippet, 4 /* SHOW_TEXT */);
  const nodes: Array<{ node: Text; from: number; to: number }> = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const from = text.length;
    text += node.textContent ?? "";
    nodes.push({ node: node as Text, from, to: text.length });
  }
  const ranges = hiddenTextRanges(text);
  let count = 0;
  // Work backwards so splitting a Text node cannot invalidate earlier offsets.
  for (const { from: start, to: end } of ranges.reverse()) {
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

export type BacklinksCleanup = (() => void) & { refresh(reason?: string): void };

/** A stable discovery observer owns one cleanup observer per current pane element. */
export function startBacklinksCleanup(root: HTMLElement): BacklinksCleanup {
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  const panes = new Map<Element, BacklinksCleanup>();
  let stopped = false;
  const attachPane = (pane: Element, reason: string): BacklinksCleanup => {
    let disposed = false;
    const clean = (trigger = "pane-mutation") => {
      if (disposed || stopped || !root.contains(pane)) return;
      const rows = Array.from(pane.querySelectorAll(MATCH))
        .filter((row) => row.closest(PANE) === pane);
      let hiddenMarkerCount = 0;
      for (const row of rows) {
        reveal(row);
        hiddenMarkerCount += concealBacklinkMatch(row);
      }
      observer.takeRecords();
      debugLog(() => ["[Smart Reference] Backlinks cleanup", {
        reason: trigger, target: pane, matchedBacklinkRows: rows.length, hiddenMarkerCount,
      }]);
    };
    const observer = new Observer(() => clean());
    observer.observe(pane, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "hidden", "style"],
    });
    debugLog(() => ["[Smart Reference] Backlinks observer attached", { target: pane, reason }]);
    clean(reason);
    const stop = () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      reveal(pane);
      debugLog(() => ["[Smart Reference] Backlinks observer disconnected", { target: pane }]);
    };
    return Object.assign(stop, { refresh: clean });
  };
  const reconcile = (reason: string, refreshExisting: boolean) => {
    if (stopped) return;
    const current = new Set(root.querySelectorAll(PANE));
    if (root.matches(PANE)) current.add(root);
    for (const [pane, cleanup] of panes) {
      if (!current.has(pane)) {
        cleanup();
        panes.delete(pane);
      }
    }
    for (const pane of current) {
      const existing = panes.get(pane);
      if (!existing) panes.set(pane, attachPane(pane, reason));
      else if (refreshExisting) existing.refresh(reason);
    }
    // Discovery never reapplies cleanup to unchanged panes for plugin-generated
    // mutations. Their own observers handle content; this avoids feedback loops.
    discovery.takeRecords();
  };
  const discovery = new Observer(() => reconcile("pane-dom-recreated", false));
  discovery.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  reconcile("initial-render", true);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    discovery.disconnect();
    for (const cleanup of panes.values()) cleanup();
    panes.clear();
  };
  return Object.assign(stop, { refresh: (reason = "workspace-refresh") => reconcile(reason, true) });
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
    refresh(reason = "workspace-refresh"): void {
      if (stopped) return;
      debugLog(() => ["[Smart Reference] Backlinks workspace refresh", { event: reason }]);
      for (const { cleanup } of documents.values()) cleanup.refresh(reason);
    },
    destroy(): void {
      stopped = true;
      for (const doc of documents.keys()) detach(doc);
    },
  };
}
