import { Editor, MarkdownView, Notice, TFile, type App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { locateReference, type LocateResult } from "./locator.ts";
import type { PreciseReference } from "./model.ts";
import { setPreciseHighlight } from "./highlight.ts";
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

    const location = locateReference(view.getViewData(), reference);
    console.debug("[Smart Reference] target locator", { refId: reference.refId, kind: location.kind });
    if (location.kind === "missing-block") return "missing-block";

    this.cancelHighlight();
    const applied = view.getMode() === "preview"
      ? await highlightReadingView(view, reference, location)
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
  const cm = getCodeMirrorView(view.editor);
  if (!cm) return null;
  cm.dispatch({
    effects: [
      setPreciseHighlight.of(location.range),
      EditorView.scrollIntoView(location.range.from, { y: "center" }),
    ],
  });
  return {
    kind: location.kind === "exact" ? "exact" : "block",
    cleanup: () => cm.dispatch({ effects: setPreciseHighlight.of(null) }),
  };
}

async function highlightReadingView(
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
    const escapedId = CSS.escape(reference.blockId);
    const idElement = preview.querySelector<HTMLElement>(`#${escapedId}, [data-block-id="${escapedId}"]`);
    if (!idElement) {
      console.debug("[Smart Reference] Reading View result", { refId: reference.refId, appliedKind: null, exactHighlightSuccess: false, fallbackReason: "block-id-element-missing" });
      return null;
    }
    const block = readingBlockForId(idElement);
    console.debug("[Smart Reference] Reading View target block", {
      refId: reference.refId,
      idElementTag: idElement.tagName,
      idElementClass: idElement.className,
      idElementText: idElement.textContent,
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

function readingBlockForId(idElement: HTMLElement): HTMLElement {
  const containingBlock = idElement.closest<HTMLElement>("p, li");
  if (containingBlock) return containingBlock;
  // Some renderers place the block-id anchor immediately after its paragraph.
  // Limit the fallback to adjacent semantic blocks, never an entire section.
  for (const sibling of [idElement.previousElementSibling, idElement.parentElement?.previousElementSibling]) {
    if (sibling instanceof HTMLElement && sibling.matches("p, li")) return sibling;
  }
  return idElement;
}

function wrapText(root: HTMLElement, reference: PreciseReference): RenderedWrapResult {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
    domRangeCreated: false,
    wrappingMethod: "splitText",
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
      // Split each Text node independently. A Range spanning Markdown-rendered
      // elements cannot safely be passed to surroundContents().
      if (segment.to < node.length) node.splitText(segment.to);
      const selected = segment.from > 0 ? node.splitText(segment.from) : node;
      const span = document.createElement("span");
      span.className = "smart-ref-reading-highlight";
      selected.parentNode?.insertBefore(span, selected);
      span.appendChild(selected);
      spans.push(span);
    }
  } catch (error) {
    console.debug("[Smart Reference] Reading View wrapping exception", { refId: reference.refId, error });
    unwrapTextSpans(root, spans);
    return { spans: [], fallbackReason: "text-node-wrapping-exception" };
  }
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
