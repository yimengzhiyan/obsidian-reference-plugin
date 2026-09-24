# CURRENT_STATUS

**Branch:** `codex/editor-exact-highlight-fix`
**Base:** `codex/reading-click-resolution-fix` at 7ae048e
**Environment:** Linux/Codex; editor-mode Obsidian validation pending.

## Verified milestone

Real Obsidian Reading View logs confirm appliedKind=exact,
exactHighlightSuccess=true, wrappedSpanCount=1. The Reading View DOM Range
implementation is preserved byte-for-byte on this branch.

## Editor highlighting

After navigation, log current mode and target path. Preview uses the existing
Reading View path. Editor mode (both Live Preview and Source report source)
locates the reference against the current editor text, then converts the locator's
recovered offsets through editor.offsetToPos into CodeMirror line/character offsets.
This preserves offset validation, text/context recovery, and block fallback.

Reuse preciseHighlightField / Decoration.mark. If the field is absent in the
current editor state, install it in the same transaction. Inspect the resulting
DecorationSet before reporting success. Preserve scrolling and four-second cleanup.
Log mode, targetPath, from/to, locatorKind, success, decorationApplied and failure
reason under `[Smart Reference] Editor highlight`.

Reference metadata, marker format, annotation, click resolution and selection are
unchanged. Raw Source mode click interception remains as before; this work enables
highlighting when enhanced/manual navigation opens an editor target.

## Validation

- npm test: 41 passed
- npm run typecheck: passed
- npm run build: passed
- git diff --check: passed

New tests exercise offset-to-position conversion (including CRLF), actual CM6
state/decorations, recovered exact text, cleanup, block fallback and edit mapping.

## Next Obsidian validation

Open targets in Live Preview and Source mode. Navigate to a selection in the middle
of a paragraph; confirm only selected text highlights and Editor highlight reports
success=true with the expected range. Repeat after alias/source edits and target
text shifts, then verify block fallback and cleanup. Retest the verified Reading
View path as a regression check.
