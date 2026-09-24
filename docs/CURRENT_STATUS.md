# CURRENT_STATUS

**Branch:** `codex/reading-click-resolution-fix`

**Base:** `codex/reference-marker-redesign` at a4b89d5

**Environment:** Linux/Codex; real Obsidian revalidation pending.

## Definitive runtime finding

A click logged `click not associated with a ref marker`, followed later by a
postprocessor log with `annotated: 1` for Source.md. The click was not enhanced.
The apparent block highlight was likely native navigation; that click did not
exercise the plugin target highlighting algorithm. Prior renderer failures remain
separate observations and cannot explain this click.

## Implemented

Click resolution is synchronous before native event cancellation. Path order:

1. `dom-attribute`: anchor.dataset.smartRefId
2. `adjacent-dom-comment`: immediate HTML comment
3. Containing MarkdownView: Reading View uses current view.getViewData(), rendered
   anchor identities/order in its preview, and the same parser/resolved target key
   as annotation (`reading-source-resolution`). Live Preview retains current-line
   source association (`live-preview-source-resolution`).
4. `unresolved-native-fallback`: no safe association, metadata, or target.

No timeout or prior postprocessor execution is required. Annotation remains a fast
path. The unique-source/unique-rendered target case resolves directly; mismatched
counts remain native. All ordinary same-target Wiki Links count toward ordinals.
Embedded note source is not borrowed from the host note. Partial rendering of
repeated targets may therefore safely leave a click native.

Reference store, marker format, highlight algorithm, selection and UI are unchanged.

## Validation

- npm test: 38 passed (six new click-time association tests)
- npm run typecheck: passed
- npm run build: passed
- git diff --check: passed

## Next real Obsidian validation

Click an unannotated Reading View anchor, including one with no retained DOM comment.
Confirm `[Smart Reference] click resolution` reports `reading-source-resolution`
and the expected refId before target navigation. Repeat after alias/unrelated source
edits. Test ordinary + Smart links to the same target and count mismatches, then
Live Preview and the annotated fast path. Only after proving enhanced navigation
ran should the existing target-highlight logs be used to assess exact highlighting.
