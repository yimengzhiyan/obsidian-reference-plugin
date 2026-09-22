import { Editor, FuzzySuggestModal, MarkdownFileInfo, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { ensureBlockId } from "./src/blocks.ts";
import { preciseHighlightField, setPreciseHighlight } from "./src/highlight.ts";
import { locateReference } from "./src/locator.ts";
import { EMPTY_PLUGIN_DATA, type PendingReference, type PluginData, type PreciseReference } from "./src/model.ts";
import { findUniqueTextRange } from "./src/text-ranges.ts";

const HIGHLIGHT_DURATION_MS = 4_000;
const CONTEXT_LENGTH = 32;

export default class ReferencePlugin extends Plugin {
  private data: PluginData = structuredClone(EMPTY_PLUGIN_DATA);
  private selectionTargetPath: string | null = null;
  private selectionStatus: HTMLElement | null = null;
  private highlightTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.registerEditorExtension(preciseHighlightField);
    this.registerDomEvent(document, "keydown", (event) => void this.handleSelectionKey(event));

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

    if (this.data.pending) {
      new Notice("An unfinished Smart Reference is available; use Cancel Smart Reference to remove it.");
    }
  }

  onunload(): void {
    if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
    this.exitSelectionMode();
  }

  private async loadPluginData(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginData> | null;
    this.data = {
      pending: stored?.pending ?? null,
      references: stored?.references ?? {},
      lastReferenceId: stored?.lastReferenceId ?? null,
    };
  }

  private async startReference(editor: Editor, view: MarkdownView | MarkdownFileInfo): Promise<void> {
    if (!view.file) {
      new Notice("Smart Reference requires an active Markdown file.");
      return;
    }
    if (this.data.pending) {
      new Notice("Finish or cancel the active Smart Reference first.");
      return;
    }

    const id = crypto.randomUUID();
    const placeholder = `%%smart-ref:${id}%%`;
    editor.replaceRange(placeholder, editor.getCursor());
    this.data.pending = { id, sourcePath: view.file.path, placeholder };
    await this.saveData(this.data);

    new TargetNoteModal(this, view.file.path, (file) => {
      if (file) void this.selectTarget(file);
      else void this.cancelReference();
    }).open();
  }

  private async selectTarget(file: TFile): Promise<void> {
    const pending = this.data.pending;
    if (!pending) return;
    pending.targetPath = file.path;
    await this.saveData(this.data);
    await this.app.workspace.getLeaf(false).openFile(file);
    this.enterSelectionMode(file.path);
  }

  private enterSelectionMode(targetPath: string): void {
    this.selectionTargetPath = targetPath;
    this.selectionStatus = this.addStatusBarItem();
    this.selectionStatus.setText("Smart Reference: select text, Enter to confirm, Esc to cancel");
    new Notice("Select text in the target note, then press Enter. Esc cancels.", 5_000);
  }

  private exitSelectionMode(): void {
    this.selectionTargetPath = null;
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
    const pending = this.data.pending;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!pending || !view?.file || view.file.path !== this.selectionTargetPath) {
      new Notice("Return to the selected target note before confirming.");
      return;
    }

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

    this.data.references[reference.refId] = reference;
    this.data.lastReferenceId = reference.refId;
    this.data.pending = null;
    await this.saveData(this.data);
    this.exitSelectionMode();
    const sourceFile = this.app.vault.getAbstractFileByPath(pending.sourcePath);
    if (sourceFile instanceof TFile) await this.app.workspace.getLeaf(false).openFile(sourceFile);
    new Notice("Precise reference created. Use the highlight spike command to validate navigation.");
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
    const pending = this.data.pending;
    if (!pending) {
      this.exitSelectionMode();
      new Notice("No Smart Reference is active.");
      return;
    }
    if (!(await this.replacePendingPlaceholder(pending, ""))) return;
    this.data.pending = null;
    await this.saveData(this.data);
    this.exitSelectionMode();
    new Notice("Smart Reference canceled and its placeholder removed.");
  }

  private async highlightLastReference(): Promise<void> {
    const id = this.data.lastReferenceId;
    const reference = id ? this.data.references[id] : undefined;
    if (!reference) {
      new Notice("No completed precise reference is available.");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(reference.targetFile);
    if (!(file instanceof TFile)) {
      new Notice(`Target note not found: ${reference.targetFile}`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path) {
      new Notice("Target note opened, but no Markdown editor is active.");
      return;
    }
    const result = locateReference(view.editor.getValue(), reference);
    if (result.kind === "missing-block") {
      new Notice("Target block no longer exists.");
      return;
    }

    // Obsidian exposes editor extensions publicly, but the dispatch bridge is
    // currently the CodeMirror-backed Editor implementation's `cm` property.
    const cm = (view.editor as Editor & { cm?: EditorView }).cm;
    if (!cm) {
      new Notice("Precise highlighting is only available in an editing view.");
      return;
    }
    cm.dispatch({
      effects: [
        setPreciseHighlight.of(result.range),
        EditorView.scrollIntoView(result.range.from, { y: "center" }),
      ],
    });
    if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
    this.highlightTimer = window.setTimeout(() => {
      cm.dispatch({ effects: setPreciseHighlight.of(null) });
      this.highlightTimer = null;
    }, HIGHLIGHT_DURATION_MS);

    if (result.kind === "block-only") {
      new Notice("Exact text was ambiguous or changed; highlighted the native fallback block.");
    }
  }
}

class TargetNoteModal extends FuzzySuggestModal<TFile> {
  private selected = false;

  constructor(
    plugin: ReferencePlugin,
    private readonly sourcePath: string,
    private readonly done: (file: TFile | null) => void,
  ) {
    super(plugin.app);
    this.setPlaceholder("Choose a Markdown note to reference…");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => file.path !== this.sourcePath);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.selected = true;
    this.done(file);
  }

  onClose(): void {
    super.onClose();
    if (!this.selected) this.done(null);
  }
}

function buildPreciseLink(file: TFile, reference: PreciseReference): string {
  const path = file.path.replace(/\.md$/i, "");
  const alias = reference.selectedText.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  return `[[${path}#^${reference.blockId}|${alias}]] %%ref:${reference.refId}%%`;
}

function createBlockId(): string {
  return `sr-${crypto.randomUUID().slice(0, 8)}`;
}
