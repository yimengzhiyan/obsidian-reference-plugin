import { debugLog } from "./src/debug.ts";
import {
  type BacklinksRefreshContext,
  createBacklinksCleanupManager,
  createMarkdownViewModeWatcher,
  scheduleBacklinksCleanupAfterRender,
} from "./src/backlinks-cleanup.ts";
import {
  Editor,
  editorLivePreviewField,
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
import { createMetadataHidingField } from "./src/metadata-hiding.ts";
import { concealRenderedSmartReferenceBlockIds } from "./src/rendered-metadata.ts";
import { preciseHighlightField } from "./src/highlight.ts";
import {
  annotateRenderedSmartReferences,
  adjacentCommentRefId,
  resolveReadingClickReference,
  buildSmartReferenceLink,
  resolveLivePreviewReference,
  resolveLivePreviewSpanLink,
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
    this.registerEditorExtension(createMetadataHidingField(editorLivePreviewField));
    const backlinks = createBacklinksCleanupManager();
    const markdownViewModes = createMarkdownViewModeWatcher(({ view, from, to, trigger }) => {
      backlinks.attach(view.containerEl.ownerDocument);
      backlinks.refresh(`markdown-view-mode-change:${from}-to-${to}:${trigger}`);
    });
    let cancelPendingFileOpenCleanup: (() => void) | null = null;
    const refreshBacklinks = (event: string, context?: BacklinksRefreshContext) => {
      const markdownViews: MarkdownView[] = [];
      backlinks.attach(document);
      this.app.workspace.iterateAllLeaves((leaf) => {
        backlinks.attach(leaf.view.containerEl.ownerDocument);
        if (leaf.view instanceof MarkdownView) markdownViews.push(leaf.view);
      });
      markdownViewModes.sync(markdownViews, event);
      backlinks.refresh(event, context);
    };
    this.register(() => {
      cancelPendingFileOpenCleanup?.();
      markdownViewModes.destroy();
      backlinks.destroy();
    });
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      cancelPendingFileOpenCleanup?.();
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const context: BacklinksRefreshContext = {
        openedFilePath: file?.path ?? null,
        currentMarkdownViewMode: activeView?.getMode() ?? null,
      };
      const doc = activeView?.containerEl.ownerDocument ?? document;
      cancelPendingFileOpenCleanup = scheduleBacklinksCleanupAfterRender(doc, context, () => {
        cancelPendingFileOpenCleanup = null;
        refreshBacklinks("file-open", context);
      });
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => refreshBacklinks("layout-change")));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => refreshBacklinks("active-leaf-change")));
    this.registerEvent(this.app.workspace.on("window-open", (_win, opened) => backlinks.attach(opened.document)));
    this.registerEvent(this.app.workspace.on("window-close", (_win, closed) => backlinks.detach(closed.document)));
    refreshBacklinks("plugin-load");
    this.registerDomEvent(document, "keydown", (event) => void this.handleSelectionKey(event), {
      capture: true,
    });
    this.registerDomEvent(document, "click", (event) => void this.handleSmartReferenceClick(event), {
      capture: true,
    });
    this.registerMarkdownPostProcessor((element, context) => {
      const firstLink = element.querySelector<HTMLElement>("a[href], a.internal-link");
      const section = context.getSectionInfo(element) ?? (firstLink ? context.getSectionInfo(firstLink) : null);
      const hiddenBlockIdCount = concealRenderedSmartReferenceBlockIds(element, section?.text ?? "");
      if (hiddenBlockIdCount > 0) {
        debugLog(() => ["[Smart Reference] Reading View block IDs hidden", {
          sourcePath: context.sourcePath,
          hiddenBlockIdCount,
        }]);
      }
      if (!firstLink) return;
      // HTML comments may survive rendering even when section source is unavailable.
      annotateRenderedSmartReferences(element, section?.text ?? "", (path) =>
        this.app.metadataCache.getFirstLinkpathDest(path, context.sourcePath)?.path ?? path
      );
      if (!section) {
        debugLog(() => ["[Smart Reference] Reading View annotation: DOM comments only; section unavailable", {
          sourcePath: context.sourcePath,
        }]);
        return;
      }
      if (section.text.includes("<!--smart-ref:") || section.text.includes("%%ref:")) {
        debugLog(() => ["[Smart Reference] Reading View link annotation", {
          sourcePath: context.sourcePath,
          lineStart: section.lineStart,
          lineEnd: section.lineEnd,
          annotated: element.querySelectorAll("a[data-smart-ref-id]").length,
        }]);
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
      debugLog(() => ["[Smart Reference] Target leaf did not resolve to MarkdownView", {
        expectedTargetPath: file.path,
        viewType: targetLeaf.view.getViewType(),
      }]);
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
    debugLog(() => ["[Smart Reference] Selection confirmation context failure", {
      reason: context.kind,
      expectedTargetPath: this.selectionTargetPath,
      activeTargetPath: activeView?.file?.path ?? null,
      retainedTargetPath: retainedView?.file?.path ?? null,
      pendingOperationId: this.store.pending?.id ?? null,
    }]);

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
    if (!anchor) {
      const link = event.target.closest<HTMLElement>(".cm-hmd-internal-link");
      if (!link) return;
      const view = this.findContainingMarkdownView(link);
      if (!view || view.getMode() !== "source") return;
      const line = link.closest<HTMLElement>(".cm-line");
      const lineOffset = line ? getEditorSourceOffset(view, line) : null;
      const spans = line ? Array.from(line.querySelectorAll<HTMLElement>(".cm-hmd-internal-link"))
        .filter((candidate) => !candidate.parentElement?.closest(".cm-hmd-internal-link")) : [];
      const resolved = lineOffset === null ? null : resolveLivePreviewSpanLink(
        view.editor.getValue(), lineOffset, getEditorSourceOffset(view, link), spans.indexOf(link), spans.length,
      );
      debugLog(() => ["[Smart Reference] Live Preview click detected", {
        className: link.className, sourcePath: view.file?.path ?? null, target: resolved?.target ?? null,
      }]);
      debugLog(() => ["[Smart Reference] Live Preview ref resolved", { refId: resolved?.refId ?? null }]);
      if (resolved) await this.navigateClickedReference(event, resolved.refId);
      return;
    }

    let refId = anchor.dataset.smartRefId || null;
    let resolutionPath = refId ? "dom-attribute" : "unresolved-native-fallback";
    if (!refId) {
      refId = adjacentCommentRefId(anchor);
      if (refId) resolutionPath = "adjacent-dom-comment";
    }
    if (!refId) {
      const view = this.findContainingMarkdownView(anchor);
      if (view?.getMode() === "preview") {
        refId = this.findReadingViewRefId(view, anchor);
        if (refId) resolutionPath = "reading-source-resolution";
      } else if (view?.getMode() === "source" && anchor.matches("a.internal-link")) {
        refId = this.findLivePreviewRefId(view, anchor);
        if (refId) resolutionPath = "live-preview-source-resolution";
      }
    }
    debugLog(() => ["[Smart Reference] click resolution", {
      path: resolutionPath,
      refId,
      href: anchor.dataset.href || anchor.getAttribute("href"),
    }]);
    if (!refId) return;
    await this.navigateClickedReference(event, refId);
  }

  private async navigateClickedReference(event: MouseEvent, refId: string): Promise<void> {
    const reference = this.store.getReference(refId);
    if (!reference) {
      debugLog(() => ["[Smart Reference] click resolution", { path: "unresolved-native-fallback", reason: "metadata-missing", refId }]);
      return;
    }
    if (!this.navigator.hasTarget(reference)) {
      debugLog(() => ["[Smart Reference] click resolution", {
        path: "unresolved-native-fallback",
        reason: "target-missing",
        refId,
        targetPath: reference.targetFile,
      }]);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    showNavigationResult(await this.navigator.navigate(reference));
  }

  private findContainingMarkdownView(anchor: HTMLElement): MarkdownView | null {
    const matchingViews: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(anchor)) {
        matchingViews.push(leaf.view);
      }
    });
    return matchingViews.length === 1 ? matchingViews[0] : null;
  }

  private findReadingViewRefId(view: MarkdownView, anchor: HTMLAnchorElement): string | null {
    const preview = anchor.closest<HTMLElement>(".markdown-preview-view");
    // Embedded notes have different source Markdown from their containing view.
    if (!preview || !view.containerEl.contains(preview) || anchor.closest(".internal-embed")) return null;
    const anchors = Array.from(preview.querySelectorAll<HTMLAnchorElement>("a[href], a.internal-link"))
      .filter((candidate) => !candidate.closest(".internal-embed"));
    return resolveReadingClickReference(
      view.getViewData(),
      anchors.map((candidate) => ({ target: candidate.dataset.href || candidate.getAttribute("href") || "" })),
      anchors.indexOf(anchor),
      (path) => this.app.metadataCache.getFirstLinkpathDest(path, view.file?.path ?? "")?.path ?? path,
    );
  }

  private findLivePreviewRefId(view: MarkdownView, anchor: HTMLAnchorElement): string | null {
    const target = anchor.dataset.href ?? anchor.getAttribute("data-href");
    if (!target) {
      debugLog(() => ["[Smart Reference] clicked link has no data-href"]);
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
      debugLog(() => ["[Smart Reference] Live Preview marker association failed", {
        target,
        sourcePath: view.file?.path ?? null,
        sourceOffset: offset,
        targetOrdinal: ordinal,
        renderedTargetCount: renderedMatches.length,
      }]);
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
