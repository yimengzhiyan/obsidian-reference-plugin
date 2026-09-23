import {
  Editor,
  FuzzyMatch,
  FuzzySuggestModal,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { ensureBlockId } from "./src/blocks.ts";
import { preciseHighlightField } from "./src/highlight.ts";
import {
  annotateRenderedSmartReferences,
  buildSmartReferenceLink,
  resolveLivePreviewReference,
} from "./src/links.ts";
import {
  getEditorSourceOffset,
  showNavigationResult,
  SmartReferenceNavigator,
} from "./src/navigation.ts";
import type { PendingReference, PreciseReference } from "./src/model.ts";
import { ReferenceStore } from "./src/reference-store.ts";
import { resolveSelectionContext } from "./src/selection-context.ts";
import { SingleSettlement } from "./src/single-settlement.ts";
import { findUniqueTextRange } from "./src/text-ranges.ts";

const CONTEXT_LENGTH = 32;

export default class ReferencePlugin extends Plugin {
  private store!: ReferenceStore;
  private navigator!: SmartReferenceNavigator;
  private selectionTargetPath: string | null = null;
  private selectionTargetLeaf: WorkspaceLeaf | null = null;
  private selectionStatus: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.store = new ReferenceStore(this);
    this.navigator = new SmartReferenceNavigator(this.app);
    await this.store.load();
    this.registerEditorExtension(preciseHighlightField);
    this.registerDomEvent(document, "keydown", (event) => void this.handleSelectionKey(event), {
      capture: true,
    });
    this.registerDomEvent(document, "click", (event) => void this.handleSmartReferenceClick(event), {
      capture: true,
    });
    this.registerMarkdownPostProcessor((element, context) => {
      const firstLink = element.querySelector<HTMLElement>("a[href], a.internal-link");
      if (!firstLink) return;
      const section = context.getSectionInfo(element) ?? context.getSectionInfo(firstLink);
      // HTML comments may survive rendering even when section source is unavailable.
      annotateRenderedSmartReferences(element, section?.text ?? "", (path) =>
        this.app.metadataCache.getFirstLinkpathDest(path, context.sourcePath)?.path ?? path
      );
      if (!section) {
        console.debug("[Smart Reference] Reading View annotation: DOM comments only; section unavailable", {
          sourcePath: context.sourcePath,
        });
        return;
      }
      if (section.text.includes("<!--smart-ref:") || section.text.includes("%%ref:")) {
        console.debug("[Smart Reference] Reading View link annotation", {
          sourcePath: context.sourcePath,
          lineStart: section.lineStart,
          lineEnd: section.lineEnd,
          annotated: element.querySelectorAll("a[data-smart-ref-id]").length,
        });
      }
    });

    this.addCommand({
      id: "create-smart-reference",
      name: "Create Smart Reference (precise text spike)",
      editorCallback: (editor, view) => void this.startReference(editor, view),
    });
    this.addCommand({
      id: "cancel-smart-reference",
      name: "Cancel Smart Reference",
      callback: () => void this.cancelReference(),
    });
    this.addCommand({
      id: "highlight-last-precise-reference",
      name: "Jump to and highlight last precise reference (spike)",
      callback: () => void this.highlightLastReference(),
    });

    if (this.store.pending) {
      new Notice("An unfinished Smart Reference is available; use Cancel Smart Reference to remove it.");
    }
  }

  onunload(): void {
    this.navigator.unload();
    this.exitSelectionMode();
  }

  private async startReference(editor: Editor, view: MarkdownView | MarkdownFileInfo): Promise<void> {
    if (!view.file) {
      new Notice("Smart Reference requires an active Markdown file.");
      return;
    }
    if (this.store.pending) {
      new Notice("Finish or cancel the active Smart Reference first.");
      return;
    }

    const id = crypto.randomUUID();
    const placeholder = `%%smart-ref:${id}%%`;
    editor.replaceRange(placeholder, editor.getCursor());
    await this.store.setPending({ id, sourcePath: view.file.path, placeholder });

    new TargetNoteModal(this, view.file.path, (file) => {
      if (file) void this.selectTarget(file);
      else void this.cancelReference();
    }).open();
  }

  private async selectTarget(file: TFile): Promise<void> {
    const pending = this.store.pending;
    if (!pending) return;
    await this.store.updatePendingTarget(file.path);
    const targetLeaf = this.app.workspace.getLeaf(false);
    await targetLeaf.openFile(file);
    this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
    if (!(targetLeaf.view instanceof MarkdownView)) {
      console.debug("[Smart Reference] Target leaf did not resolve to MarkdownView", {
        expectedTargetPath: file.path,
        viewType: targetLeaf.view.getViewType(),
      });
      new Notice("Target note opened without an editable Markdown view. Cancel and try again.");
      return;
    }
    this.enterSelectionMode(file.path, targetLeaf);
  }

  private enterSelectionMode(targetPath: string, targetLeaf: WorkspaceLeaf): void {
    this.selectionTargetPath = targetPath;
    this.selectionTargetLeaf = targetLeaf;
    this.selectionStatus = this.addStatusBarItem();
    this.selectionStatus.setText("Smart Reference: select text, Enter to confirm, Esc to cancel");
    new Notice("Select text in the target note, then press Enter. Esc cancels.", 5_000);
  }

  private exitSelectionMode(): void {
    this.selectionTargetPath = null;
    this.selectionTargetLeaf = null;
    this.selectionStatus?.remove();
    this.selectionStatus = null;
  }

  private async handleSelectionKey(event: KeyboardEvent): Promise<void> {
    if (!this.selectionTargetPath || (event.key !== "Enter" && event.key !== "Escape")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") await this.cancelReference();
    else await this.confirmSelection();
  }

  private async confirmSelection(): Promise<void> {
    const pending = this.store.pending;
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const retainedView = this.selectionTargetLeaf?.view instanceof MarkdownView
      ? this.selectionTargetLeaf.view
      : null;
    const context = resolveSelectionContext(
      pending !== null,
      this.selectionTargetPath,
      activeView?.file?.path ?? null,
      retainedView?.file?.path ?? null,
    );
    if (context.kind !== "ready") {
      this.reportSelectionContextFailure(context, activeView, retainedView);
      return;
    }
    const view = context.source === "active" ? activeView : retainedView;
    if (!pending || !view?.file) return;

    const editor = view.editor;
    const selectedText = editor.getSelection();
    if (!selectedText) {
      new Notice("Select non-empty text before pressing Enter.");
      return;
    }

    const selection = editor.listSelections()[0];
    const anchor = editor.posToOffset(selection.anchor);
    const head = editor.posToOffset(selection.head);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const content = editor.getValue();
    const ensured = ensureBlockId(content, { from, to }, createBlockId);
    if (!ensured) {
      new Notice("The spike currently supports selections within one paragraph or one list item.");
      return;
    }

    if (ensured.inserted) {
      const insertionOffset = ensured.block.to - ensured.blockId.length - 2;
      editor.replaceRange(` ^${ensured.blockId}`, editor.offsetToPos(insertionOffset));
    }

    const reference: PreciseReference = {
      refId: pending.id,
      targetFile: view.file.path,
      blockId: ensured.blockId,
      selectedText,
      startOffset: from,
      endOffset: to,
      prefix: content.slice(Math.max(ensured.block.from, from - CONTEXT_LENGTH), from),
      suffix: content.slice(to, Math.min(ensured.block.to, to + CONTEXT_LENGTH)),
    };
    const replaced = await this.replacePendingPlaceholder(pending, buildPreciseLink(view.file, reference));
    if (!replaced) return;

    await this.store.addReference(reference);
    this.exitSelectionMode();
    const sourceFile = this.app.vault.getAbstractFileByPath(pending.sourcePath);
    if (sourceFile instanceof TFile) await this.app.workspace.getLeaf(false).openFile(sourceFile);
    new Notice("Precise reference created. Use the highlight spike command to validate navigation.");
  }

  private reportSelectionContextFailure(
    context: Exclude<ReturnType<typeof resolveSelectionContext>, { kind: "ready" }>,
    activeView: MarkdownView | null,
    retainedView: MarkdownView | null,
  ): void {
    console.debug("[Smart Reference] Selection confirmation context failure", {
      reason: context.kind,
      expectedTargetPath: this.selectionTargetPath,
      activeTargetPath: activeView?.file?.path ?? null,
      retainedTargetPath: retainedView?.file?.path ?? null,
      pendingOperationId: this.store.pending?.id ?? null,
    });

    if (context.kind === "missing-pending") {
      new Notice("Smart Reference operation state is missing. Cancel and start again.");
    } else if (context.kind === "missing-expected-target") {
      new Notice("Smart Reference target state is missing. Cancel and start again.");
    } else if (context.kind === "no-markdown-view") {
      new Notice("No active Markdown editor is available for the selected target.");
    } else {
      new Notice("The active note is not the selected Smart Reference target.");
    }
  }

  private async replacePendingPlaceholder(pending: PendingReference, replacement: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(pending.sourcePath);
    if (!(file instanceof TFile)) {
      new Notice(`Source note not found: ${pending.sourcePath}`);
      return false;
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file?.path === pending.sourcePath) {
      const found = findUniqueTextRange(activeView.editor.getValue(), pending.placeholder);
      if (found.kind !== "unique") {
        new Notice("Source placeholder is missing or duplicated; no source change was made.");
        return false;
      }
      activeView.editor.replaceRange(
        replacement,
        activeView.editor.offsetToPos(found.range.from),
        activeView.editor.offsetToPos(found.range.to),
      );
      return true;
    }

    let replaced = false;
    await this.app.vault.process(file, (content) => {
      const found = findUniqueTextRange(content, pending.placeholder);
      if (found.kind !== "unique") return content;
      replaced = true;
      return content.slice(0, found.range.from) + replacement + content.slice(found.range.to);
    });
    if (!replaced) new Notice("Source placeholder is missing or duplicated; no source change was made.");
    return replaced;
  }

  private async cancelReference(): Promise<void> {
    const pending = this.store.pending;
    if (!pending) {
      this.exitSelectionMode();
      new Notice("No Smart Reference is active.");
      return;
    }
    if (!(await this.replacePendingPlaceholder(pending, ""))) return;
    await this.store.setPending(null);
    this.exitSelectionMode();
    new Notice("Smart Reference canceled and its placeholder removed.");
  }

  private async highlightLastReference(): Promise<void> {
    const id = this.store.lastReferenceId;
    const reference = id ? this.store.getReference(id) : null;
    if (!reference) {
      new Notice("No completed precise reference is available.");
      return;
    }
    showNavigationResult(await this.navigator.navigate(reference));
  }

  private async handleSmartReferenceClick(event: MouseEvent): Promise<void> {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a");
    if (!anchor) return;

    const refId = anchor.dataset.smartRefId ?? (anchor.matches("a.internal-link") ? this.findLivePreviewRefId(anchor) : null);
    if (!refId) {
      if (!anchor.matches("a.internal-link")) return;
      console.debug("[Smart Reference] click not associated with a ref marker", {
        href: anchor.dataset.href ?? null,
        text: anchor.textContent,
      });
      return;
    }
    const reference = this.store.getReference(refId);
    if (!reference) {
      console.debug("[Smart Reference] reference metadata missing; native link handles click", { refId });
      return;
    }
    if (!this.navigator.hasTarget(reference)) {
      console.debug("[Smart Reference] target missing; native link handles click", {
        refId,
        targetPath: reference.targetFile,
      });
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    showNavigationResult(await this.navigator.navigate(reference));
  }

  private findLivePreviewRefId(anchor: HTMLAnchorElement): string | null {
    const matchingViews: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(anchor)) {
        matchingViews.push(leaf.view);
      }
    });
    const view = matchingViews[0];
    if (!view || view.getMode() !== "source") {
      console.debug("[Smart Reference] clicked link has no source editor view");
      return null;
    }

    const target = anchor.dataset.href ?? anchor.getAttribute("data-href");
    if (!target) {
      console.debug("[Smart Reference] clicked link has no data-href");
      return null;
    }
    const source = view.editor.getValue();
    const lineElement = anchor.closest(".cm-line");
    const offset = lineElement ? getEditorSourceOffset(view, lineElement) : null;
    const line = offset === null ? null : view.editor.getLine(view.editor.offsetToPos(offset).line);
    const renderedMatches = lineElement
      ? Array.from(lineElement.querySelectorAll<HTMLAnchorElement>("a.internal-link"))
        .filter((candidate) => (candidate.dataset.href ?? candidate.getAttribute("data-href")) === target)
      : [];
    const ordinal = renderedMatches.indexOf(anchor);
    const refId = resolveLivePreviewReference(
      source,
      target,
      line,
      ordinal < 0 ? null : ordinal,
      lineElement ? renderedMatches.length : null,
    );
    if (!refId) {
      console.debug("[Smart Reference] Live Preview marker association failed", {
        target,
        sourcePath: view.file?.path ?? null,
        sourceOffset: offset,
        sourceLine: line,
        targetOrdinal: ordinal,
        renderedTargetCount: renderedMatches.length,
      });
    }
    return refId;
  }
}

class TargetNoteModal extends FuzzySuggestModal<TFile> {
  private readonly settlement: SingleSettlement<TFile>;

  constructor(
    plugin: ReferencePlugin,
    private readonly sourcePath: string,
    done: (file: TFile | null) => void,
  ) {
    super(plugin.app);
    this.settlement = new SingleSettlement(done);
    this.setPlaceholder("Choose a Markdown note to reference…");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => file.path !== this.sourcePath);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  selectSuggestion(value: FuzzyMatch<TFile>, event: MouseEvent | KeyboardEvent): void {
    // Obsidian may close the modal before onChooseItem runs. Commit the result
    // before delegating so onClose cannot misclassify a selection as cancellation.
    this.settlement.settle(value.item);
    super.selectSuggestion(value, event);
  }

  onChooseItem(file: TFile, _event: MouseEvent | KeyboardEvent): void {
    // Retained as an API-compatible fallback; settlement is idempotent.
    this.settlement.settle(file);
  }

  onClose(): void {
    super.onClose();
    this.settlement.settle(null);
  }
}

function buildPreciseLink(file: TFile, reference: PreciseReference): string {
  return buildSmartReferenceLink(file.path, reference.blockId, reference.selectedText, reference.refId);
}

function createBlockId(): string {
  return `sr-${crypto.randomUUID().slice(0, 8)}`;
}
