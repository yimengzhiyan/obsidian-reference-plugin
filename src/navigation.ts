import { Component, Editor, MarkdownRenderer, MarkdownView, Notice, TFile, type App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { toEditorHighlightRange } from "./editor-range.ts";
import { findBlockById } from "./blocks.ts";
import { findRenderedBlockIndex, sourceBlockMarkdown } from "./reading-container.ts";
import { locateReference, type LocateResult } from "./locator.ts";
import type { PreciseReference } from "./model.ts";
import { preciseHighlightField, setPreciseHighlight } from "./highlight.ts";
import { findRenderedTextRange, mapTextRangeToSegments } from "./rendered-text.ts";
import { classifyHighlightResult, type NavigationResult } from "./navigation-result.ts";

const HIGHLIGHT_DURATION_MS = 4_000;

type AppliedHighlight = { kind: "exact" | "block"; cleanup: () => void };
type RenderedWrapResult = { spans: HTMLElement[]; fallbackReason: string | null };

export class SmartReferenceNavigator {
  private clearHighlight: (() => void) | null = null;
  private highlightTimer: number | null = null;

  constructor(private readonly app: App) {}

  hasTarget(reference: PreciseReference): boolean {
    return this.app.vault.getAbstractFileByPath(reference.targetFile) instanceof TFile;
  }

  async navigate(reference: PreciseReference): Promise<NavigationResult> {
    const file = this.app.vault.getAbstractFileByPath(reference.targetFile);
    if (!(file instanceof TFile)) return "missing-target";

    await this.app.workspace.getLeaf(false).openFile(file);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path) return "unsupported-view";

    const mode = view.getMode();
    console.debug("[Smart Reference] target view", { mode, targetPath: file.path });
    const currentText = mode === "source" ? view.editor.getValue() : view.getViewData();
    const location = locateReference(currentText, reference);
    if (mode === "source") {
      console.debug("[Smart Reference] Editor locator", {
        mode,
        targetPath: file.path,
        refId: reference.refId,
        kind: location.kind,
        range: location.kind === "missing-block" ? null : location.range,
        selectedText: reference.selectedText,
        startOffset: reference.startOffset,
        endOffset: reference.endOffset,
        currentTextLength: currentText.length,
        locatedText: location.kind === "missing-block" ? null : currentText.slice(location.range.from, location.range.to),
        prefix: reference.prefix,
        suffix: reference.suffix,
      });
    }
    console.debug("[Smart Reference] target locator", { refId: reference.refId, kind: location.kind });
    if (location.kind === "missing-block") return "missing-block";

    this.cancelHighlight();
    const applied = mode === "preview"
      ? await highlightReadingView(this.app, view, reference, location)
      : highlightEditingView(view, location);
    if (!applied) return "unsupported-view";

    this.clearHighlight = applied.cleanup;
    this.highlightTimer = window.setTimeout(() => this.cancelHighlight(), HIGHLIGHT_DURATION_MS);
    const result = classifyHighlightResult(location.kind, applied.kind);
    console.debug("[Smart Reference] highlight applied", {
      refId: reference.refId,
      locatorKind: location.kind,
      appliedKind: applied.kind,
      result,
    });
    return result;
  }

  unload(): void {
    this.cancelHighlight();
  }

  private cancelHighlight(): void {
    if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
    this.highlightTimer = null;
    this.clearHighlight?.();
    this.clearHighlight = null;
  }
}

export function getEditorSourceOffset(view: MarkdownView, node: Node): number | null {
  const cm = getCodeMirrorView(view.editor);
  if (!cm || !cm.contentDOM.contains(node)) return null;
  try {
    return cm.posAtDOM(node);
  } catch {
    return null;
  }
}

export function showNavigationResult(result: NavigationResult): void {
  if (result === "missing-target") {
    new Notice("Smart Reference target was moved or deleted; using native link fallback.");
  } else if (result === "missing-block") {
    new Notice("Smart Reference block no longer exists.");
  } else if (result === "unsupported-view") {
    new Notice("Target opened, but precise highlighting is unavailable in this view.");
  }
}

function highlightEditingView(view: MarkdownView, location: Exclude<LocateResult, { kind: "missing-block" }>): AppliedHighlight | null {
  const mode = view.getMode();
  const targetPath = view.file?.path ?? null;
  const report = (range: { from: number; to: number } | null, success: boolean, reason: string | null) =>
    console.debug("[Smart Reference] Editor highlight", {
      mode, targetPath, from: range?.from ?? null, to: range?.to ?? null,
      locatorKind: location.kind, success, decorationApplied: success, reason,
    });
  const cm = getCodeMirrorView(view.editor);
  if (!cm) {
    report(null, false, "codemirror-view-unavailable");
    return null;
  }
  const range = toEditorHighlightRange(location.range, view.editor.getValue().length,
    (offset) => view.editor.offsetToPos(offset), cm.state.doc);
  if (!range) {
    report(null, false, "invalid-editor-range");
    return null;
  }
  try {
    const effects: StateEffect<unknown>[] = [];
    if (!cm.state.field(preciseHighlightField, false)) {
      effects.push(StateEffect.appendConfig.of(preciseHighlightField));
    }
    effects.push(setPreciseHighlight.of(range), EditorView.scrollIntoView(range.from, { y: "center" }));
    console.debug("[Smart Reference] Editor decoration input", {
      targetPath,
      locatorRange: location.range,
      codeMirrorRange: range,
      decoratedText: cm.state.doc.sliceString(range.from, range.to),
      codeMirrorTextLength: cm.state.doc.length,
    });
    cm.dispatch({ effects });
    const decorations = cm.state.field(preciseHighlightField, false);
    let applied = false;
    decorations?.between(range.from, range.to, (from, to) => {
      if (from === range.from && to === range.to) applied = true;
    });
    report(range, applied, applied ? null : "decoration-not-applied");
    if (!applied) return null;
    return {
      kind: location.kind === "exact" ? "exact" : "block",
      cleanup: () => cm.dispatch({ effects: setPreciseHighlight.of(null) }),
    };
  } catch (error) {
    report(range, false, "decoration-dispatch-failed");
    console.debug("[Smart Reference] Editor highlight exception", { targetPath, error });
    return null;
  }
}

async function highlightReadingView(
  app: App,
  view: MarkdownView,
  reference: PreciseReference,
  location: Exclude<LocateResult, { kind: "missing-block" }>,
): Promise<AppliedHighlight | null> {
  console.debug("[Smart Reference] Reading View reference", {
    refId: reference.refId,
    blockId: reference.blockId,
    selectedText: reference.selectedText,
    prefix: reference.prefix,
    suffix: reference.suffix,
    locatorKind: location.kind,
  });
  try {
    await nextAnimationFrame();
    const preview = view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
    if (!preview) {
      console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: null, exactHighlightSuccess: false, fallbackReason: "preview-missing" });
      return null;
    }
    const sourceBlock = findBlockById(view.getViewData(), reference.blockId);
    const block = sourceBlock ? await findReadingContainer(app, view, preview, sourceBlock.text) : null;
    console.debug("[Smart Reference] Reading View container", {
      refId: reference.refId,
      renderedContainerFound: block !== null,
      sourceBlockFrom: sourceBlock?.from ?? null,
      sourceBlockTo: sourceBlock?.to ?? null,
    });
    if (!block) {
      console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: null, exactHighlightSuccess: false, fallbackReason: "rendered-container-missing-or-ambiguous" });
      return null;
    }
    console.debug("[Smart Reference] Reading View target block", {
      refId: reference.refId,
      blockTag: block.tagName,
      blockClass: block.className,
      textContent: block.textContent,
      innerText: block.innerText,
    });

    if (location.kind === "block-only") {
      block.classList.add("smart-ref-reading-highlight");
      block.scrollIntoView({ block: "center" });
      console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: "block", exactHighlightSuccess: false, fallbackReason: "source-locator-block-only" });
      return { kind: "block", cleanup: () => block.classList.remove("smart-ref-reading-highlight") };
    }

    const { spans, fallbackReason } = wrapText(block, reference);
    if (spans.length === 0) {
      block.classList.add("smart-ref-reading-highlight");
      block.scrollIntoView({ block: "center" });
      console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: "block", exactHighlightSuccess: false, fallbackReason });
      return { kind: "block", cleanup: () => block.classList.remove("smart-ref-reading-highlight") };
    }
    spans[0].scrollIntoView({ block: "center" });
    console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: "exact", exactHighlightSuccess: true, fallbackReason: null, wrappedSpanCount: spans.length });
    return { kind: "exact", cleanup: () => {
      unwrapTextSpans(block, spans);
    } };
  } catch (error) {
    console.debug("[Smart Reference] Reading View exception", { refId: reference.refId, error });
    throw error;
  }
}

/** Render the current source block to compare complete visible block text, not
 * the selected substring. No block ID or private Obsidian DOM mapping is used. */
async function findReadingContainer(
  app: App,
  view: MarkdownView,
  preview: HTMLElement,
  sourceBlock: string,
): Promise<HTMLElement | null> {
  const detached = preview.ownerDocument.createElement("div");
  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(app, sourceBlockMarkdown(sourceBlock), detached, view.file?.path ?? "", component);
    const expectedText = detached.textContent ?? "";
    // Reading View may finish rendering after openFile resolves.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const all = Array.from(preview.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, pre"))
        .filter((element) => !element.closest(".internal-embed"));
      // A loose list may wrap its text in a paragraph. Prefer that paragraph
      // instead of treating its containing li as a second identical block.
      const candidates = all.filter((element) => !all.some((child) =>
        child !== element && element.contains(child) &&
        findRenderedBlockIndex(element.textContent ?? "", [child.textContent ?? ""]) === 0
      ));
      const index = findRenderedBlockIndex(expectedText, candidates.map((element) => element.textContent ?? ""));
      if (index !== null) return candidates[index];
      await nextAnimationFrame();
    }
    return null;
  } finally {
    component.unload();
  }
}

function wrapText(root: HTMLElement, reference: PreciseReference): RenderedWrapResult {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let combined = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    combined += node.data;
  }
  console.debug("[Smart Reference] Reading View text nodes", {
    refId: reference.refId,
    count: nodes.length,
    nodes: nodes.map((node, index) => ({ index, textContent: node.textContent })),
  });
  const found = findRenderedTextRange(combined, reference.selectedText, reference.prefix, reference.suffix);
  const normalizedSelectedText = reference.selectedText.replace(/\s+/gu, " ").trim();
  const normalizedRenderedText = combined.replace(/\s+/gu, " ");
  const candidateStarts: number[] = [];
  if (normalizedSelectedText) {
    let cursor = 0;
    while (cursor <= normalizedRenderedText.length) {
      const index = normalizedRenderedText.indexOf(normalizedSelectedText, cursor);
      if (index < 0) break;
      candidateStarts.push(index);
      cursor = index + normalizedSelectedText.length;
    }
  }
  console.debug("[Smart Reference] Reading View match", {
    refId: reference.refId,
    normalizedSelectedText,
    normalizedRenderedText,
    candidateStarts,
    matchedStart: found?.from ?? null,
    matchedEnd: found?.to ?? null,
    positionUnit: "UTF-16 offset in concatenated DOM text nodes",
    wrappingMethod: "per-text-node DOM Range",
  });
  if (!found) {
    const fallbackReason = nodes.length === 0 ? "no-text-nodes"
      : !normalizedSelectedText ? "empty-selected-text"
      : candidateStarts.length === 0 ? "rendered-text-no-match"
      : "rendered-text-ambiguous-match";
    return { spans: [], fallbackReason };
  }
  const spans: HTMLElement[] = [];
  const segments = mapTextRangeToSegments(nodes.map((node) => node.data), found);
  console.debug("[Smart Reference] Reading View segments", { refId: reference.refId, segments });
  if (segments.length === 0) return { spans, fallbackReason: "matched-range-has-no-text-segments" };
  try {
    for (const segment of segments) {
      const node = nodes[segment.nodeIndex];
      // Each Range stays within one Text node, preserving surrounding markup.
      const range = root.ownerDocument.createRange();
      range.setStart(node, segment.from);
      range.setEnd(node, segment.to);
      const span = root.ownerDocument.createElement("span");
      span.className = "smart-ref-reading-highlight";
      range.surroundContents(span);
      spans.push(span);
    }
  } catch (error) {
    console.debug("[Smart Reference] Reading View wrapping exception", { refId: reference.refId, error });
    unwrapTextSpans(root, spans);
    return { spans: [], fallbackReason: "text-node-wrapping-exception" };
  }
  console.debug("[Smart Reference] Reading View ranges", { refId: reference.refId, domRangeCreated: spans.length > 0, count: spans.length });
  return { spans, fallbackReason: null };
}

function unwrapTextSpans(root: HTMLElement, spans: HTMLElement[]): void {
  for (const span of spans) span.replaceWith(...Array.from(span.childNodes));
  root.normalize();
}

function getCodeMirrorView(editor: Editor): EditorView | null {
  // Obsidian publicly supports registering CM6 extensions, but currently does
  // not expose a public dispatch method on Editor. Keep this bridge isolated.
  return (editor as Editor & { cm?: EditorView }).cm ?? null;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
