import { Editor, MarkdownView, Notice, TFile, type App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { locateReference, type LocateResult } from "./locator.ts";
import type { PreciseReference } from "./model.ts";
import { setPreciseHighlight } from "./highlight.ts";

const HIGHLIGHT_DURATION_MS = 4_000;

export type NavigationResult =
  | "highlighted-exact"
  | "highlighted-block"
  | "missing-target"
  | "missing-block"
  | "unsupported-view";

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
    if (location.kind === "missing-block") return "missing-block";

    this.cancelHighlight();
    const cleanup = view.getMode() === "preview"
      ? await highlightReadingView(view, reference, location)
      : highlightEditingView(view, location);
    if (!cleanup) return "unsupported-view";

    this.clearHighlight = cleanup;
    this.highlightTimer = window.setTimeout(() => this.cancelHighlight(), HIGHLIGHT_DURATION_MS);
    return location.kind === "exact" ? "highlighted-exact" : "highlighted-block";
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
  if (result === "highlighted-block") {
    new Notice("Exact text changed or was ambiguous; highlighted the native fallback block.");
  } else if (result === "missing-target") {
    new Notice("Smart Reference target was moved or deleted; using native link fallback.");
  } else if (result === "missing-block") {
    new Notice("Smart Reference block no longer exists.");
  } else if (result === "unsupported-view") {
    new Notice("Target opened, but precise highlighting is unavailable in this view.");
  }
}

function highlightEditingView(view: MarkdownView, location: Exclude<LocateResult, { kind: "missing-block" }>): (() => void) | null {
  const cm = getCodeMirrorView(view.editor);
  if (!cm) return null;
  cm.dispatch({
    effects: [
      setPreciseHighlight.of(location.range),
      EditorView.scrollIntoView(location.range.from, { y: "center" }),
    ],
  });
  return () => cm.dispatch({ effects: setPreciseHighlight.of(null) });
}

async function highlightReadingView(
  view: MarkdownView,
  reference: PreciseReference,
  location: Exclude<LocateResult, { kind: "missing-block" }>,
): Promise<(() => void) | null> {
  await nextAnimationFrame();
  const preview = view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
  if (!preview) return null;
  const escapedId = CSS.escape(reference.blockId);
  const block = preview.querySelector<HTMLElement>(`#${escapedId}, [data-block-id="${escapedId}"]`);
  if (!block) return null;

  if (location.kind === "block-only") {
    block.classList.add("smart-ref-reading-highlight");
    block.scrollIntoView({ block: "center" });
    return () => block.classList.remove("smart-ref-reading-highlight");
  }

  const spans = wrapText(block, reference.selectedText, reference.prefix, reference.suffix);
  if (spans.length === 0) {
    block.classList.add("smart-ref-reading-highlight");
    block.scrollIntoView({ block: "center" });
    return () => block.classList.remove("smart-ref-reading-highlight");
  }
  spans[0].scrollIntoView({ block: "center" });
  return () => {
    for (const span of spans) span.replaceWith(...Array.from(span.childNodes));
    block.normalize();
  };
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
  const start = chooseOccurrence(combined, selectedText, prefix, suffix);
  if (start === -1) return [];
  const end = start + selectedText.length;
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

function chooseOccurrence(content: string, text: string, prefix: string, suffix: string): number {
  const matches: number[] = [];
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(text, from);
    if (index === -1) break;
    matches.push(index);
    from = index + Math.max(text.length, 1);
  }
  if (matches.length === 1) return matches[0];
  const contextual = matches.filter((index) =>
    content.slice(Math.max(0, index - prefix.length), index).endsWith(prefix) &&
    content.slice(index + text.length, index + text.length + suffix.length).startsWith(suffix)
  );
  return contextual.length === 1 ? contextual[0] : -1;
}

function getCodeMirrorView(editor: Editor): EditorView | null {
  // Obsidian publicly supports registering CM6 extensions, but currently does
  // not expose a public dispatch method on Editor. Keep this bridge isolated.
  return (editor as Editor & { cm?: EditorView }).cm ?? null;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
