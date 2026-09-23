import { Editor, MarkdownView, Notice, TFile, type App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { locateReference, type LocateResult } from "./locator.ts";
import type { PreciseReference } from "./model.ts";
import { setPreciseHighlight } from "./highlight.ts";
import { findRenderedTextRange } from "./rendered-text.ts";
import { classifyHighlightResult, type NavigationResult } from "./navigation-result.ts";

const HIGHLIGHT_DURATION_MS = 4_000;

type AppliedHighlight = { kind: "exact" | "block"; cleanup: () => void };

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
  await nextAnimationFrame();
  const preview = view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
  if (!preview) return null;
  const escapedId = CSS.escape(reference.blockId);
  const idElement = preview.querySelector<HTMLElement>(`#${escapedId}, [data-block-id="${escapedId}"]`);
  if (!idElement) return null;
  const block = idElement.closest<HTMLElement>("p, li") ?? idElement;

  if (location.kind === "block-only") {
    block.classList.add("smart-ref-reading-highlight");
    block.scrollIntoView({ block: "center" });
    return { kind: "block", cleanup: () => block.classList.remove("smart-ref-reading-highlight") };
  }

  const spans = wrapText(block, reference.selectedText, reference.prefix, reference.suffix);
  if (spans.length === 0) {
    console.debug("[Smart Reference] rendered exact text unavailable; using block highlight", {
      refId: reference.refId,
      selectedText: reference.selectedText,
      renderedText: block.textContent,
    });
    block.classList.add("smart-ref-reading-highlight");
    block.scrollIntoView({ block: "center" });
    return { kind: "block", cleanup: () => block.classList.remove("smart-ref-reading-highlight") };
  }
  spans[0].scrollIntoView({ block: "center" });
  return { kind: "exact", cleanup: () => {
    for (const span of spans) span.replaceWith(...Array.from(span.childNodes));
    block.normalize();
  } };
}

function wrapText(root: HTMLElement, selectedText: string, prefix: string, suffix: string): HTMLElement[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let combined = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    combined += node.data;
  }
  const found = findRenderedTextRange(combined, selectedText, prefix, suffix);
  if (!found) return [];
  const { from: start, to: end } = found;
  const spans: HTMLElement[] = [];
  let cursor = 0;

  for (const node of nodes) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.data.length;
    cursor = nodeEnd;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (from >= to) continue;
    const range = document.createRange();
    range.setStart(node, from - nodeStart);
    range.setEnd(node, to - nodeStart);
    const span = document.createElement("span");
    span.className = "smart-ref-reading-highlight";
    range.surroundContents(span);
    spans.push(span);
  }
  return spans;
}

function getCodeMirrorView(editor: Editor): EditorView | null {
  // Obsidian publicly supports registering CM6 extensions, but currently does
  // not expose a public dispatch method on Editor. Keep this bridge isolated.
  return (editor as Editor & { cm?: EditorView }).cm ?? null;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
