# CURRENT_STATUS

## Current phase

**Phase:** Reading View link annotation repair

**Branch:** `codex/reading-view-link-annotation` (from `codex/debug-render-highlight`)

**Environment:** Linux/Codex; the user validates Obsidian behavior in a disposable Vault

Smart Reference creation, click navigation, navigation after Source edits, navigation after alias edits, and block highlighting are manually validated. Reading View still shows a whole-block result where exact text was expected.

## Runtime finding

A real Reading View click logged `[Smart Reference] clicked link has no source editor view`. The click handler reaches its Live Preview source-editor lookup only when the clicked anchor has no `data-smart-ref-id`. Reading View has no such source editor, so the link was not enhanced and Obsidian's native block navigation took over. This finding identifies the missing link annotation as the first failure; it does not establish a failure in the exact-highlight renderer.

## Implemented on this branch

- The existing `registerMarkdownPostProcessor` now pairs each current rendered section's Wiki Links with anchors using the target file path, block ID, and same-target order. It asks Obsidian for section text using the rendered element, then its first link if needed. Paths are resolved relative to the source note through Obsidian's metadata cache.
- Rendered links use `data-href` or, when absent, `href`, including anchors without an `internal-link` class. Encoded path and block fragments are decoded before matching.
- All same-target Wiki Links, including ordinary links, participate in order. Count mismatches remain unannotated; alias text is never used as identity.
- The click handler first reads `anchor.dataset.smartRefId`, then tries Live Preview source association. Missing association, metadata, or target still leaves native click handling in place.
- Pure tests cover alias changes, ordinary links, block IDs, path resolution, encoded hrefs, and ambiguous rendered counts.

The selection workflow, target locator, and highlight renderer have not changed. Temporary Reading View highlight diagnostics from the parent branch remain in place.

## Verification

- `npm test`: 24 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated `main.js` is ignored.
- `git diff --check`: passed.
- This branch has not yet been run inside Obsidian.

## Next step

Install this branch in the disposable Vault and click a Smart Reference in Reading View. Confirm that the rendered anchor has `data-smart-ref-id` and that `[Smart Reference] clicked link has no source editor view` does not appear for that click. Then inspect the existing Reading View reference, target-block, text-node, match, and result logs to determine whether exact highlighting now succeeds. Check an ordinary link and an unresolved reference for native fallback. If exact highlighting still falls back, repair that separately using the captured logs.
