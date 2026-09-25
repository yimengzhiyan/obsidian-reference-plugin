import { debugLog } from "./debug.ts";

// Obsidian's private Backlinks DOM: deliberately exclude global search and editors.
const PANE = ".backlink-pane";
const MATCH = ".search-result-file-match";
const HIDDEN = "smart-ref-hidden-backlink-metadata";
const CLICKABLE = "a, [href], [data-href], [role='link'], button, .internal-link";
const SMART_REFERENCE_EVIDENCE = /\^sr-[a-z0-9]+|%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/;

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

function describeTextOwners(row: Element): Array<Record<string, unknown>> {
  const walker = row.ownerDocument.createTreeWalker(row, 4 /* SHOW_TEXT */);
  const owners: Array<Record<string, unknown>> = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    owners.push({
      text: node.textContent,
      containsGeneratedBlockId: /\^sr-[a-z0-9]+/.test(node.textContent ?? ""),
      parentTag: parent?.tagName ?? null,
      parentClass: parent?.className ?? null,
      parentOuterHTML: parent?.outerHTML ?? null,
      ancestorChain: describeAncestorChain(parent, row),
    });
  }
  return owners;
}

function describeAncestorChain(element: Element | null, row: Element): Array<Record<string, unknown>> {
  const chain: Array<Record<string, unknown>> = [];
  for (let current = element; current; current = current.parentElement) {
    chain.push({
      tagName: current.tagName,
      className: current.className,
      id: current.id || null,
      role: current.getAttribute("role"),
      href: current.getAttribute("href"),
      dataHref: current.getAttribute("data-href"),
    });
    if (current === row) break;
  }
  return chain;
}

function describeChildElements(row: Element): Array<Record<string, unknown>> {
  return Array.from(row.querySelectorAll<HTMLElement>("*")).map((element) => ({
    tagName: element.tagName,
    className: element.className,
    id: element.id || null,
    text: element.textContent,
    outerHTML: element.outerHTML,
  }));
}

function describeClickableElements(row: Element): Array<Record<string, unknown>> {
  const elements = Array.from(row.querySelectorAll<HTMLElement>(CLICKABLE));
  if (row.matches(CLICKABLE)) elements.unshift(row as HTMLElement);
  return elements.map((element) => {
    const href = element.getAttribute("href");
    const dataHref = element.getAttribute("data-href");
    const text = element.textContent ?? "";
    return {
      tagName: element.tagName,
      className: element.className,
      role: element.getAttribute("role"),
      href,
      dataHref,
      text,
      containsSmartReference: SMART_REFERENCE_EVIDENCE.test(`${href ?? ""} ${dataHref ?? ""} ${text}`),
      outerHTML: element.outerHTML,
    };
  });
}

function describeMutation(record: MutationRecord): Record<string, unknown> {
  const target = record.target.nodeType === 1
    ? record.target as Element
    : record.target.parentElement;
  return {
    type: record.type,
    targetTag: target?.tagName ?? null,
    targetClass: target?.className ?? null,
    targetOuterHTML: target?.outerHTML ?? null,
    addedNodes: Array.from(record.addedNodes, (node) => node.nodeType === 1 ? (node as Element).outerHTML : node.textContent),
    removedNodes: Array.from(record.removedNodes, (node) => node.nodeType === 1 ? (node as Element).outerHTML : node.textContent),
  };
}

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
    const postCleanupSnapshots = new WeakMap<Element, string>();
    const clean = (trigger = "pane-mutation") => {
      if (disposed || stopped || !root.contains(pane)) return;
      const rows = Array.from(pane.querySelectorAll(MATCH))
        .filter((row) => row.closest(PANE) === pane);
      let hiddenMarkerCount = 0;
      for (const row of rows) {
        const hasSmartReference = SMART_REFERENCE_EVIDENCE.test(row.textContent ?? "");
        if (hasSmartReference) {
          debugLog(() => {
            const previousPostCleanupOuterHTML = postCleanupSnapshots.get(row) ?? null;
            const beforeOuterHTML = row.outerHTML;
            const hasHiddenWrappers = row.querySelector(`.${HIDDEN}`) !== null;
            const textNodeOwners = describeTextOwners(row);
            return ["[Smart Reference] Backlinks row before cleanup", {
              reason: trigger,
              row,
              beforeOuterHTML,
              previousPostCleanupOuterHTML,
              rowIdentitySeenBefore: previousPostCleanupOuterHTML !== null,
              newRowAfterObserverMutation: trigger === "pane-mutation" && previousPostCleanupOuterHTML === null,
              contentChangedAfterPreviousCleanup: previousPostCleanupOuterHTML !== null && beforeOuterHTML !== previousPostCleanupOuterHTML,
              rawContentRestored: previousPostCleanupOuterHTML !== null && !hasHiddenWrappers,
              childElements: describeChildElements(row),
              textNodeOwners,
              smartReferenceTextNodes: textNodeOwners
                .filter((owner) => owner.containsGeneratedBlockId === true),
              clickableElements: describeClickableElements(row),
            }];
          });
        }
        reveal(row);
        const rowHiddenMarkerCount = concealBacklinkMatch(row);
        hiddenMarkerCount += rowHiddenMarkerCount;
        if (hasSmartReference) {
          debugLog(() => {
            const afterOuterHTML = row.outerHTML;
            const textNodeOwners = describeTextOwners(row);
            postCleanupSnapshots.set(row, afterOuterHTML);
            return ["[Smart Reference] Backlinks row after cleanup", {
              reason: trigger,
              row,
              afterOuterHTML,
              rowHiddenMarkerCount,
              childElements: describeChildElements(row),
              textNodeOwners,
              smartReferenceTextNodes: textNodeOwners
                .filter((owner) => owner.containsGeneratedBlockId === true),
              clickableElements: describeClickableElements(row),
            }];
          });
        }
      }
      observer.takeRecords();
      debugLog(() => ["[Smart Reference] Backlinks cleanup", {
        reason: trigger, target: pane, matchedBacklinkRows: rows.length, hiddenMarkerCount,
      }]);
    };
    const observer = new Observer((records) => {
      debugLog(() => ["[Smart Reference] Backlinks observer triggered", {
        target: pane,
        mutations: records.map(describeMutation),
      }]);
      clean();
    });
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
