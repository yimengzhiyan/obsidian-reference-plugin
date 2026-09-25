import { debugLog, SMART_REFERENCE_DEBUG } from "./debug.ts";

// Obsidian's private Backlinks DOM: deliberately exclude global search and editors.
const PANE = ".backlink-pane";
const MATCH = ".search-result-file-match";
const HIDDEN = "smart-ref-hidden-backlink-metadata";

function reveal(root: Element): void {
  root.querySelectorAll(`span.${HIDDEN}`).forEach((span) => {
    span.replaceWith(...Array.from(span.childNodes));
  });
}

type MarkerType = "^sr-" | "%%ref:" | "<!--smart-ref-->";
const markerType = (text: string): MarkerType => text.startsWith("^") ? "^sr-"
  : text.startsWith("%%") ? "%%ref:" : "<!--smart-ref-->";
const markerMatches = (text: string) => Array.from(text.matchAll(
  /%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->|(?<![A-Za-z0-9_])\^sr-[0-9a-f]{8}(?![A-Za-z0-9_-])/g,
));
const skipReason = (row: Element) => !row.matches(MATCH) ? "not-backlink-row"
  : !row.closest(PANE) ? "outside-backlink-pane"
  : row.closest(".cm-editor") ? "inside-cm-editor" : null;

/** Serializable snapshots: browser console must not show later mutated live nodes. */
export function inspectBacklinkRow(row: Element) {
  const textNodes: Array<{ index: number; text: string; from: number; to: number; parentHTML: string; hiddenByPlugin: boolean }> = [];
  const commentNodes: Array<{ text: string; reason: string }> = [];
  let text = "";
  const walker = row.ownerDocument.createTreeWalker(row, 4 | 128 /* TEXT | COMMENT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 8) {
      commentNodes.push({ text: node.textContent ?? "", reason: "DOM comments are already invisible" });
      continue;
    }
    const from = text.length;
    text += node.textContent ?? "";
    textNodes.push({ index: textNodes.length, text: node.textContent ?? "", from, to: text.length,
      parentHTML: node.parentElement?.outerHTML ?? "", hiddenByPlugin: Boolean(node.parentElement?.closest(`.${HIDDEN}`)) });
  }
  const matches = markerMatches(text).map((match) => ({
    type: markerType(match[0]), text: match[0], from: match.index!, to: match.index! + match[0].length,
  }));
  const unmatchedMarkerCandidates = Array.from(text.matchAll(/\^sr-|%%ref:|(?:<!--|&lt;!--)smart-ref:/g))
    .filter((hint) => !matches.some((match) => hint.index! >= match.from && hint.index! < match.to))
    .map((hint) => ({ from: hint.index!, text: text.slice(hint.index!, hint.index! + 120),
      reason: "prefix-present-but-complete-pattern-not-matched" }));
  return {
    outerHTML: row.outerHTML,
    childNodes: Array.from(row.childNodes, (node) => ({
      nodeType: node.nodeType, nodeName: node.nodeName, text: node.textContent,
      outerHTML: node.nodeType === 1 ? (node as Element).outerHTML : null,
    })),
    textNodes, commentNodes, textContent: text, skipReason: skipReason(row),
    matchedMarkerTypes: [...new Set(matches.map((match) => match.type))],
    matches, unmatchedMarkerCandidates,
  };
}

function logBacklinkRow(row: Element, phase: string, hiddenMarkerCount?: number): void {
  if (!SMART_REFERENCE_DEBUG || !/\^sr-|%%ref:|smart-ref/.test(row.outerHTML)) return;
  debugLog(() => ["[Smart Reference] Backlinks row diagnostic", {
    phase, hiddenMarkerCount, ...inspectBacklinkRow(row),
  }]);
}

/** Hide only complete reserved markers, even when search-match spans split them. */
export function concealBacklinkMatch(snippet: Element): number {
  logBacklinkRow(snippet, "before-cleanup");
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
  const matches = markerMatches(text);
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
  logBacklinkRow(snippet, "after-cleanup", count);
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
