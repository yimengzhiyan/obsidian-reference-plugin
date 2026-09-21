import { Editor, MarkdownFileInfo, MarkdownView, Notice, Plugin, TFile } from "obsidian";

interface PlaceholderSession {
  id: string;
  sourcePath: string;
}

const PLACEHOLDER_PREFIX = "%%smart-ref:";
const PLACEHOLDER_SUFFIX = "%%";

export default class ReferencePlugin extends Plugin {
  private placeholderSession: PlaceholderSession | null = null;

  async onload(): Promise<void> {
    console.log("Loading Obsidian Reference Plugin");

    this.addCommand({
      id: "create-smart-reference-placeholder",
      name: "Create Smart Reference (placeholder spike)",
      editorCallback: (editor, view) => {
        this.createPlaceholder(editor, view);
      },
    });

    this.addCommand({
      id: "replace-smart-reference-placeholder",
      name: "Replace Smart Reference Placeholder (placeholder spike)",
      callback: async () => {
        await this.replacePlaceholder();
      },
    });

    this.addCommand({
      id: "cancel-smart-reference-placeholder",
      name: "Cancel Smart Reference Placeholder (placeholder spike)",
      callback: async () => {
        await this.cancelPlaceholder();
      },
    });
  }

  onunload(): void {
    console.log("Unloading Obsidian Reference Plugin");
  }

  private createPlaceholder(
    editor: Editor,
    view: MarkdownView | MarkdownFileInfo,
  ): void {
    const file = view.file;
    if (!file) {
      new Notice("Smart Reference placeholder requires an active Markdown file.");
      return;
    }

    const id = crypto.randomUUID();
    const placeholder = `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;

    editor.replaceRange(placeholder, editor.getCursor());
    this.placeholderSession = { id, sourcePath: file.path };

    new Notice(`Smart Reference placeholder inserted in ${file.path}`);
  }

  private async replacePlaceholder(): Promise<void> {
    const session = this.placeholderSession;
    if (!session) {
      new Notice("No Smart Reference placeholder is active.");
      return;
    }

    const placeholder = `${PLACEHOLDER_PREFIX}${session.id}${PLACEHOLDER_SUFFIX}`;
    const replacement = "[[Placeholder Target]]";
    const sourceView = this.app.workspace.getActiveViewOfType(MarkdownView);

    const sourceFile = sourceView?.file;

    if (sourceView && sourceFile?.path === session.sourcePath) {
      const editor = sourceView.editor;
      const result = findUniqueTextRange(editor.getValue(), placeholder);
      if (result.kind !== "unique") {
        showSearchFailureNotice(result.kind);
        return;
      }

      editor.replaceRange(
        replacement,
        editor.offsetToPos(result.range.from),
        editor.offsetToPos(result.range.to),
      );
    } else {
      const file = this.app.vault.getAbstractFileByPath(session.sourcePath);
      if (!(file instanceof TFile)) {
        new Notice(`Source note not found: ${session.sourcePath}`);
        return;
      }

      const content = await this.app.vault.read(file);
      const result = findUniqueTextRange(content, placeholder);
      if (result.kind !== "unique") {
        showSearchFailureNotice(result.kind);
        return;
      }

      await this.app.vault.modify(
        file,
        content.slice(0, result.range.from) +
          replacement +
          content.slice(result.range.to),
      );
    }

    this.placeholderSession = null;
    new Notice("Smart Reference placeholder replaced.");
  }

  private async cancelPlaceholder(): Promise<void> {
    const session = this.placeholderSession;
    if (!session) {
      new Notice("No Smart Reference placeholder is active.");
      return;
    }

    const placeholder = `${PLACEHOLDER_PREFIX}${session.id}${PLACEHOLDER_SUFFIX}`;
    const sourceView = this.app.workspace.getActiveViewOfType(MarkdownView);

    const sourceFile = sourceView?.file;

    if (sourceView && sourceFile?.path === session.sourcePath) {
      const editor = sourceView.editor;
      const result = findUniqueTextRange(editor.getValue(), placeholder);
      if (result.kind === "unique") {
        editor.replaceRange(
          "",
          editor.offsetToPos(result.range.from),
          editor.offsetToPos(result.range.to),
        );
      } else if (result.kind === "not-found") {
        new Notice("Smart Reference placeholder was not found.");
        return;
      } else {
        showSearchFailureNotice(result.kind);
        return;
      }
    } else {
      const file = this.app.vault.getAbstractFileByPath(session.sourcePath);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const result = findUniqueTextRange(content, placeholder);
        if (result.kind === "unique") {
          await this.app.vault.modify(
            file,
            content.slice(0, result.range.from) + content.slice(result.range.to),
          );
        } else if (result.kind === "not-found") {
          new Notice("Smart Reference placeholder was not found.");
          return;
        } else {
          showSearchFailureNotice(result.kind);
          return;
        }
      } else {
        new Notice(`Source note not found: ${session.sourcePath}`);
        return;
      }
    }

    this.placeholderSession = null;
    new Notice("Smart Reference placeholder canceled.");
  }
}

interface TextRange {
  from: number;
  to: number;
}

type TextRangeSearchResult =
  | { kind: "not-found" }
  | { kind: "multiple"; count: number }
  | { kind: "unique"; range: TextRange };

function findUniqueTextRange(
  content: string,
  text: string,
): TextRangeSearchResult {
  const ranges: TextRange[] = [];
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const from = content.indexOf(text, searchFrom);
    if (from === -1) {
      break;
    }

    ranges.push({ from, to: from + text.length });
    searchFrom = from + text.length;
  }

  if (ranges.length === 0) {
    return { kind: "not-found" };
  }

  if (ranges.length > 1) {
    return { kind: "multiple", count: ranges.length };
  }

  return { kind: "unique", range: ranges[0] };
}

function showSearchFailureNotice(kind: "not-found" | "multiple"): void {
  if (kind === "multiple") {
    new Notice("Multiple Smart Reference placeholders were found; no change made.");
    return;
  }

  new Notice("Smart Reference placeholder was not found.");
}
