# CURRENT_STATUS

## Current phase

**Phase:** Diagnose Reading View exact-highlight fallback

**Branch:** `codex/debug-render-highlight` (from `codex/render-highlight-fix`)

**Environment:** Linux/Codex; the user validates Obsidian behavior in a disposable Vault

Smart Reference creation, click navigation, navigation after Source edits, navigation after alias edits, and block highlighting are manually validated. Clicking a Smart Reference in Reading View still highlights the whole paragraph rather than only the selected text. This branch adds temporary diagnostics only; the existing fallback remains.

## Diagnostic instrumentation

`src/navigation.ts` now logs each Reading View attempt under `[Smart Reference] Reading View`:

- `reference`: refId, blockId, selectedText, prefix, suffix, and source locator kind.
- `target block`: block-ID element and chosen block tags/classes, block `textContent`, and `innerText`.
- `text nodes`: count and each collected Text node's content.
- `match`: normalized selected/rendered text, candidate starts, matched start/end offsets, and whether a DOM Range was created. The current implementation uses `splitText`, so `domRangeCreated` is always false.
- `segments` and `result`: mapped Text node portions, exact success, or a specific fallback reason. Exceptions are logged with their refId.

The source locator can return `block-only` before any rendered-text matching. When it returns `exact`, the rendered wrapper can fall back because the chosen DOM block has no matching text, the match is ambiguous, mapping yields no segments, or wrapping throws. Static inspection cannot distinguish the actual Obsidian failure; a runtime console capture is required. In particular, a block-ID element outside the paragraph may cause `readingBlockForId` to select a DOM scope that does not contain the selected words, but this remains a hypothesis.

## Verification

- `npm test`: 22 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated `main.js` is ignored.
- `git diff --check`: passed.
- No real Obsidian run is available in this environment, so the exact runtime root cause is unconfirmed.

## Next step

Install this branch in the disposable Vault, open the developer console, and click one unchanged Smart Reference in Reading View. Capture the `[Smart Reference] target locator` and all `[Smart Reference] Reading View` entries for that click. Use the first failure reason and the logged block/text nodes to identify the exact mismatch, then make a separate focused fix. Remove the temporary logging after diagnosis.
