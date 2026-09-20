import { Editor, MarkdownView, Notice, Plugin } from "obsidian";

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

  private createPlaceholder(editor: Editor, view: MarkdownView): void {
    const id = crypto.randomUUID();
    const placeholder = `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;

    editor.replaceRange(placeholder, editor.getCursor());
    this.placeholderSession = { id, sourcePath: view.file.path };

    new Notice(`Smart Reference placeholder inserted in ${view.file.path}`);
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

    if (sourceView?.file.path === session.sourcePath) {
      const editor = sourceView.editor;
      const range = findTextRange(editor.getValue(), placeholder);
      if (!range) {
        new Notice("Smart Reference placeholder was not found.");
        return;
      }

      editor.replaceRange(replacement, range.from, range.to);
    } else {
      const file = this.app.vault.getAbstractFileByPath(session.sourcePath);
      if (!file || !("extension" in file)) {
        new Notice(`Source note not found: ${session.sourcePath}`);
        return;
      }

      const content = await this.app.vault.read(file);
      const range = findTextRange(content, placeholder);
      if (!range) {
        new Notice("Smart Reference placeholder was not found.");
        return;
      }

      await this.app.vault.modify(
        file,
        content.slice(0, range.from) + replacement + content.slice(range.to),
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

    if (sourceView?.file.path === session.sourcePath) {
      const editor = sourceView.editor;
      const range = findTextRange(editor.getValue(), placeholder);
      if (range) {
        editor.replaceRange("", range.from, range.to);
      }
    } else {
      const file = this.app.vault.getAbstractFileByPath(session.sourcePath);
      if (file && "extension" in file) {
        const content = await this.app.vault.read(file);
        const range = findTextRange(content, placeholder);
        if (range) {
          await this.app.vault.modify(
            file,
            content.slice(0, range.from) + content.slice(range.to),
          );
        }
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

function findTextRange(content: string, text: string): TextRange | null {
  const from = content.indexOf(text);
  return from === -1 ? null : { from, to: from + text.length };
}
