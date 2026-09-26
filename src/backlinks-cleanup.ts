import { debugLog } from "./debug.ts";

// Obsidian's private Backlinks DOM: scope cleanup to actual pane result rows.
const PANE = ".backlink-pane";
const MATCH = ".search-result-file-match";
const MATCHED_TEXT = ".search-result-file-matched-text";
const HIDDEN = "smart-ref-hidden-backlink-metadata";

function reveal(root: Element): void {
  root.querySelectorAll(`span.${HIDDEN}`).forEach((span) => {
    span.replaceWith(...Array.from(span.childNodes));
  });
}

type HiddenTextRange = { from: number; to: number };

type WikiLinkMatch = { from: number; to: number; linktext: string };

function wikiLinkMatches(text: string): WikiLinkMatch[] {
  return Array.from(text.matchAll(/\[\[([\s\S]*?)\]\]/g), (match) => ({
    from: match.index!,
    to: match.index! + match[0].length,
    linktext: match[1],
  }));
}

function smartReferenceLinkRanges(text: string): HiddenTextRange[] {
  const ranges: HiddenTextRange[] = [];
  for (const match of wikiLinkMatches(text)) {
    const { linktext } = match;
    const aliasSeparator = findUnescapedAliasSeparator(linktext);
    if (aliasSeparator < 0) continue;
    const target = linktext.slice(0, aliasSeparator).replace(/[\u200B\uFEFF\r\n]/g, "");
    if (!/#\^sr-[a-z0-9]+$/.test(target)) continue;
    ranges.push({ from: match.from, to: match.from + 2 + aliasSeparator + 1 });
    ranges.push({ from: match.to - 2, to: match.to });
  }
  return ranges;
}

function metadataRanges(text: string): HiddenTextRange[] {
  const ranges: HiddenTextRange[] = [];
  const wikiLinks = wikiLinkMatches(text);

  for (const match of text.matchAll(/%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/g)) {
    ranges.push({ from: match.index!, to: match.index! + match[0].length });
  }

  for (const match of text.matchAll(/(?<![A-Za-z0-9_])\^sr-[a-z0-9]+(?![A-Za-z0-9_-])/g)) {
    const from = match.index!;
    if (wikiLinks.some((link) => from >= link.from && from < link.to)) continue;
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
  : null;

function concealRanges(root: Element, ranges: HiddenTextRange[]): number {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const nodes: Array<{ node: Text; from: number; to: number }> = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const from = text.length;
    text += node.textContent ?? "";
    nodes.push({ node: node as Text, from, to: text.length });
  }
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

type ConcealBacklinkResult = { hiddenMarkerCount: number; replacements: number };

/** Hide reserved metadata and collapse raw Smart Reference links to their aliases. */
function concealBacklinkMatchWithResult(row: Element): ConcealBacklinkResult {
  if (skipReason(row)) return { hiddenMarkerCount: 0, replacements: 0 };
  let hiddenMarkerCount = 0;
  let replacements = 0;
  const matchedTextSpans = Array.from(row.querySelectorAll(MATCHED_TEXT))
    .filter((span) => span.closest(MATCH) === row);
  for (const span of matchedTextSpans) {
    const textContent = span.textContent ?? "";
    const ranges = smartReferenceLinkRanges(textContent);
    for (let index = 0; index < ranges.length; index += 2) {
      const hidden = concealRanges(span, ranges.slice(index, index + 2));
      hiddenMarkerCount += hidden;
      if (hidden > 0) replacements += 1;
    }
  }
  // Metadata may be rendered in sibling spans outside the matched-text span.
  // Scan the row for those complete reserved tokens only; Wiki Link display
  // conversion remains strictly scoped to .search-result-file-matched-text.
  hiddenMarkerCount += concealRanges(row, metadataRanges(row.textContent ?? ""));
  return { hiddenMarkerCount, replacements };
}

export function concealBacklinkMatch(row: Element): number {
  return concealBacklinkMatchWithResult(row).hiddenMarkerCount;
}

export interface BacklinksRefreshContext {
  openedFilePath?: string | null;
  currentMarkdownViewMode?: string | null;
}

export type BacklinksCleanup = (() => void) & {
  refresh(reason?: string, context?: BacklinksRefreshContext): void;
};

function triggerSource(trigger: string): string {
  const source = trigger.replace(/-(?:frame|settled)$/, "");
  if (source === "file-open") return "file-open";
  if (source === "active-leaf-change") return "active-leaf-change";
  if (source.startsWith("markdown-view-mode-change:")) return "mode-switch";
  if (source === "pane-mutation") return "mutation";
  if (source === "row-pointerover" || source === "row-focusin") return "pointer/focus";
  return source;
}

/** A stable discovery observer owns one cleanup observer per current pane element. */
export function startBacklinksCleanup(root: HTMLElement): BacklinksCleanup {
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  const panes = new Map<Element, BacklinksCleanup>();
  let stopped = false;
  const attachPane = (
    pane: Element,
    reason: string,
    context?: BacklinksRefreshContext,
  ): BacklinksCleanup => {
    const view = pane.ownerDocument.defaultView!;
    let disposed = false;
    let cleanupRuns = 0;
    let replacementsAfterModeSwitch = 0;
    let replacementsAfterPointerFocus = 0;
    type FrameHandle = { id: number; kind: "animation-frame" | "timeout" };
    type PendingCleanup = {
      reason: string;
      context?: BacklinksRefreshContext;
      replacementCount: number;
    };
    let pendingFrame: FrameHandle | null = null;
    let pendingSettledFrame: FrameHandle | null = null;
    let pendingCleanup: PendingCleanup | null = null;
    type ProcessedContentState = { rowText: string; matchedText: string[] };
    const processedContent = new WeakMap<Element, ProcessedContentState>();
    const requestFrame = (callback: () => void): FrameHandle => typeof view.requestAnimationFrame === "function"
      ? { id: view.requestAnimationFrame(() => callback()), kind: "animation-frame" }
      : { id: view.setTimeout(callback, 0), kind: "timeout" };
    const cancelFrame = (handle: FrameHandle | null) => {
      if (!handle) return;
      if (handle.kind === "animation-frame") view.cancelAnimationFrame(handle.id);
      else view.clearTimeout(handle.id);
    };
    const clean = (trigger = "pane-mutation", context?: BacklinksRefreshContext) => {
      if (disposed || stopped || !root.contains(pane)) return null;
      cleanupRuns += 1;
      const rows = Array.from(pane.querySelectorAll(MATCH))
        .filter((row) => row.closest(PANE) === pane);
      let hiddenMarkerCount = 0;
      let matchedElements = 0;
      let replacements = 0;
      let cacheHits = 0;
      let cacheMisses = 0;
      let textChangedRows = 0;
      let replacementExecutions = 0;
      for (const row of rows) {
        const matchedTextSpans = Array.from(row.querySelectorAll(MATCHED_TEXT))
          .filter((span) => span.closest(MATCH) === row);
        matchedElements += matchedTextSpans.length;
        const contentState: ProcessedContentState = {
          rowText: row.textContent ?? "",
          matchedText: matchedTextSpans.map((span) => span.textContent ?? ""),
        };
        const previousState = processedContent.get(row);
        const textChanged = previousState !== undefined && (
          previousState.rowText !== contentState.rowText
          || previousState.matchedText.length !== contentState.matchedText.length
          || previousState.matchedText.some((text, index) => text !== contentState.matchedText[index])
        );
        const wrappers = Array.from(row.querySelectorAll<HTMLElement>(`.${HIDDEN}`));
        const wrappersIntact = wrappers.every((wrapper) => wrapper.hidden
          && wrapper.style.getPropertyValue("display") === "none"
          && wrapper.style.getPropertyPriority("display") === "important");
        if (textChanged || !wrappersIntact) reveal(row);
        const result = concealBacklinkMatchWithResult(row);
        hiddenMarkerCount += result.hiddenMarkerCount;
        replacements += result.replacements;
        if (result.replacements > 0) replacementExecutions += 1;
        const cacheHit = previousState !== undefined
          && !textChanged
          && wrappersIntact
          && result.hiddenMarkerCount === 0;
        if (cacheHit) cacheHits += 1;
        else cacheMisses += 1;
        if (textChanged) textChangedRows += 1;
        processedContent.set(row, {
          rowText: row.textContent ?? "",
          matchedText: matchedTextSpans.map((span) => span.textContent ?? ""),
        });
        debugLog(() => ["[Smart Reference] Backlinks cache", {
          reason: trigger,
          row,
          cacheHit,
          cacheMiss: !cacheHit,
          textChanged,
          replacementExecuted: result.replacements > 0,
        }]);
      }
      observer.takeRecords();
      const cleanupTriggerSource = triggerSource(trigger);
      if (cleanupTriggerSource === "mode-switch") {
        replacementsAfterModeSwitch += replacements;
      }
      if (cleanupTriggerSource === "pointer/focus") {
        replacementsAfterPointerFocus += replacements;
      }
      debugLog(() => ["[Smart Reference] Backlinks cleanup", {
        reason: trigger,
        cleanupTriggerSource,
        target: pane,
        cleanupRuns,
        matchedBacklinkRows: rows.length,
        matchedElements,
        replacements,
        replacementsAfterModeSwitch,
        replacementsAfterPointerFocus,
        cacheHits,
        cacheMisses,
        textChangedRows,
        replacementExecutions,
        hiddenMarkerCount,
        openedFilePath: context?.openedFilePath ?? null,
        currentMarkdownViewMode: context?.currentMarkdownViewMode ?? null,
      }]);
      return { replacements };
    };
    const scheduleSettledCleanup = (
      trigger: string,
      context: BacklinksRefreshContext | undefined,
      replacementCount: number,
    ) => {
      cancelFrame(pendingFrame);
      cancelFrame(pendingSettledFrame);
      pendingSettledFrame = null;
      const scheduled: PendingCleanup = { reason: trigger, context, replacementCount };
      pendingCleanup = scheduled;
      pendingFrame = requestFrame(() => {
        if (pendingCleanup !== scheduled) return;
        pendingFrame = null;
        const frameResult = clean(`${scheduled.reason}-frame`, scheduled.context);
        scheduled.replacementCount += frameResult?.replacements ?? 0;
        pendingSettledFrame = requestFrame(() => {
          if (pendingCleanup !== scheduled) return;
          pendingSettledFrame = null;
          const result = clean(`${scheduled.reason}-settled`, scheduled.context);
          scheduled.replacementCount += result?.replacements ?? 0;
          if (triggerSource(scheduled.reason) === "file-open") {
            debugLog(() => ["[Smart Reference] Backlinks file-open settled", {
              openedFilePath: scheduled.context?.openedFilePath ?? null,
              currentMarkdownViewMode: scheduled.context?.currentMarkdownViewMode ?? null,
              cleanupScheduled: true,
              replacementCount: scheduled.replacementCount,
            }]);
          }
          pendingCleanup = null;
        });
      });
    };
    const refresh = (trigger = "workspace-refresh", context?: BacklinksRefreshContext) => {
      const continuation = trigger === "pane-mutation" ? pendingCleanup : null;
      const effectiveTrigger = continuation
        ? continuation.reason
        : trigger;
      const effectiveContext = continuation
        ? continuation.context
        : context;
      const previousReplacementCount = continuation
        ? continuation.replacementCount
        : 0;
      const result = clean(effectiveTrigger, effectiveContext);
      scheduleSettledCleanup(
        effectiveTrigger,
        effectiveContext,
        previousReplacementCount + (result?.replacements ?? 0),
      );
    };
    const observer = new Observer(() => refresh("pane-mutation"));
    observer.observe(pane, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "hidden", "style"],
    });
    debugLog(() => ["[Smart Reference] Backlinks observer attached", { target: pane, reason }]);
    refresh(reason, context);
    const stop = () => {
      if (disposed) return;
      disposed = true;
      cancelFrame(pendingFrame);
      cancelFrame(pendingSettledFrame);
      observer.disconnect();
      reveal(pane);
      debugLog(() => ["[Smart Reference] Backlinks observer disconnected", { target: pane }]);
    };
    return Object.assign(stop, { refresh });
  };
  const refreshFromInteraction = (event: Event) => {
    const view = root.ownerDocument.defaultView;
    if (!view || !(event.target instanceof view.Element)) return;
    const row = event.target.closest(MATCH);
    const pane = row?.closest(PANE);
    if (!row || !pane || !root.contains(pane)) return;
    const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
    if (relatedTarget instanceof view.Node && row.contains(relatedTarget)) return;
    const cleanup = panes.get(pane);
    if (cleanup) cleanup.refresh(`row-${event.type}`);
  };
  const reconcile = (
    reason: string,
    refreshExisting: boolean,
    context?: BacklinksRefreshContext,
  ) => {
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
      if (!existing) panes.set(pane, attachPane(pane, reason, context));
      else if (refreshExisting) existing.refresh(reason, context);
    }
    // Discovery never reapplies cleanup to unchanged panes for plugin-generated
    // mutations. Their own observers handle content; this avoids feedback loops.
    discovery.takeRecords();
  };
  const discovery = new Observer(() => reconcile("pane-dom-recreated", false));
  discovery.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  root.addEventListener("pointerover", refreshFromInteraction, true);
  root.addEventListener("focusin", refreshFromInteraction, true);
  reconcile("initial-render", true);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    discovery.disconnect();
    root.removeEventListener("pointerover", refreshFromInteraction, true);
    root.removeEventListener("focusin", refreshFromInteraction, true);
    for (const cleanup of panes.values()) cleanup();
    panes.clear();
  };
  return Object.assign(stop, {
    refresh: (reason = "workspace-refresh", context?: BacklinksRefreshContext) =>
      reconcile(reason, true, context),
  });
}


export interface MarkdownViewModeSource {
  containerEl: HTMLElement;
  getMode(): string;
}

export interface MarkdownViewModeChange {
  view: MarkdownViewModeSource;
  from: string;
  to: string;
  trigger: string;
}

/** Observe public getMode() changes without depending on private Obsidian events. */
export function createMarkdownViewModeWatcher(
  onChange: (change: MarkdownViewModeChange) => void,
) {
  type Record = { container: HTMLElement; mode: string; observer: MutationObserver };
  const records = new Map<MarkdownViewModeSource, Record>();
  let stopped = false;
  const check = (view: MarkdownViewModeSource, trigger: string) => {
    const record = records.get(view);
    if (!record) return;
    const mode = view.getMode();
    if (mode === record.mode) return;
    const from = record.mode;
    record.mode = mode;
    onChange({ view, from, to: mode, trigger });
  };
  const attach = (view: MarkdownViewModeSource) => {
    const Observer = view.containerEl.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(() => check(view, "view-dom-mutation"));
    records.set(view, { container: view.containerEl, mode: view.getMode(), observer });
    observer.observe(view.containerEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  };
  return {
    sync(views: Iterable<MarkdownViewModeSource>, trigger = "workspace-sync"): void {
      if (stopped) return;
      const current = new Set(views);
      for (const [view, record] of records) {
        if (!current.has(view) || record.container !== view.containerEl) {
          record.observer.disconnect();
          records.delete(view);
        }
      }
      for (const view of current) {
        if (!records.has(view)) attach(view);
        else check(view, trigger);
      }
    },
    destroy(): void {
      stopped = true;
      for (const record of records.values()) record.observer.disconnect();
      records.clear();
    },
  };
}


/** Delay a file-open cleanup until the same-leaf view has rendered for two frames. */
export function scheduleBacklinksCleanupAfterRender(
  doc: Document,
  context: BacklinksRefreshContext,
  cleanup: () => void,
): () => void {
  const view = doc.defaultView;
  if (!view) {
    cleanup();
    return () => undefined;
  }
  type FrameHandle = { id: number; kind: "animation-frame" | "timeout" };
  const requestFrame = (callback: () => void): FrameHandle => typeof view.requestAnimationFrame === "function"
    ? { id: view.requestAnimationFrame(() => callback()), kind: "animation-frame" }
    : { id: view.setTimeout(callback, 0), kind: "timeout" };
  const cancelFrame = (handle: FrameHandle | null) => {
    if (!handle) return;
    if (handle.kind === "animation-frame") view.cancelAnimationFrame(handle.id);
    else view.clearTimeout(handle.id);
  };
  let cancelled = false;
  let firstFrame: FrameHandle | null = null;
  let settledFrame: FrameHandle | null = null;
  debugLog(() => ["[Smart Reference] Backlinks file-open scheduled", {
    openedFilePath: context.openedFilePath ?? null,
    currentMarkdownViewMode: context.currentMarkdownViewMode ?? null,
    cleanupScheduled: true,
  }]);
  firstFrame = requestFrame(() => {
    firstFrame = null;
    settledFrame = requestFrame(() => {
      settledFrame = null;
      if (!cancelled) cleanup();
    });
  });
  return () => {
    cancelled = true;
    cancelFrame(firstFrame);
    cancelFrame(settledFrame);
  };
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
    refresh(reason = "workspace-refresh", context?: BacklinksRefreshContext): void {
      if (stopped) return;
      debugLog(() => ["[Smart Reference] Backlinks workspace refresh", {
        event: reason,
        openedFilePath: context?.openedFilePath ?? null,
        currentMarkdownViewMode: context?.currentMarkdownViewMode ?? null,
      }]);
      for (const { cleanup } of documents.values()) cleanup.refresh(reason, context);
    },
    destroy(): void {
      stopped = true;
      for (const doc of documents.keys()) detach(doc);
    },
  };
}
