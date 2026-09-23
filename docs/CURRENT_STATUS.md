# CURRENT_STATUS

**Phase:** Reading View source-block to rendered-paragraph mapping

**Branch:** `codex/reading-view-range-fix` (from `codex/reading-view-link-annotation`)

**Environment:** Linux/Codex; real Obsidian validation is performed in the user's disposable Vault.

## Confirmed runtime finding

Reading View link association now works. Navigation logs reach `Reading View reference`, then report `block-id-element-missing`. The previous renderer incorrectly assumed that a Markdown block ID would appear as an HTML ID or data attribute.

## Implemented

- Recover the current Markdown block using its source block ID.
- Strip the source block-ID marker and render that block into a detached container with Obsidian's public Markdown renderer. Compare its normalized full visible text with rendered paragraphs/list items in the opened note. This handles Markdown formatting without guessing how markup becomes text.
- Retry briefly while Reading View finishes rendering. Exclude embedded notes, and prefer an inner paragraph when a list item contains the same text.
- Search selectedText inside the matched paragraph with whitespace normalization and stored prefix/suffix context. Map offsets to Text nodes, create a DOM Range per matching Text node, and wrap only that range. Remove spans after the existing timer.
- Preserve paragraph highlighting when the source locator or exact rendered match cannot recover the selection. Log container lookup, Text nodes, match offsets, Range creation, and result/failure reason.

Link annotation, selection workflow, and metadata format are unchanged. Alias and source-edit association tests remain passing.

## Validation

- `npm test`: 28 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated main.js remains ignored.
- `git diff --check`: passed.
- Real Obsidian execution is still pending.

## Limits and next step

Identical full rendered block text is ambiguous; no arbitrary paragraph is chosen. If no unique container is available, navigation reports unavailable highlighting rather than highlighting the whole preview. Complex blocks or plugin-generated text can also prevent container matching.

Install this branch and click a reference to words in the middle of a paragraph. Confirm `renderedContainerFound: true`, nonzero matched start offset, and `exactHighlightSuccess: true`. Repeat after alias changes and Source edits, with inline Markdown formatting, and with changed selected text to check paragraph fallback and timed cleanup.
