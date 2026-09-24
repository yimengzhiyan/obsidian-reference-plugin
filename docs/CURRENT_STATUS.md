# CURRENT_STATUS

**Branch:** `codex/live-preview-click-interception`
**Base:** `codex/editor-exact-highlight-fix` at c7c6c6f
**Environment:** Linux/Codex; real Obsidian revalidation pending.

## Confirmed root cause

Reading View exact highlighting works. Live Preview DOM inspection shows links as
`.cm-hmd-internal-link.cm-link-alias` spans containing `.cm-underline`. The old
anchor-only handler returned before Smart Reference navigation for those clicks.
The observed block effect therefore does not establish an editor decoration bug.

## Implemented

When no anchor is clicked, detect the closest `.cm-hmd-internal-link` span (including
nested underline clicks). Find its containing source MarkdownView and cm-line.
Map the span and line through CodeMirror to current editor source offsets. Reuse
Wiki Link parsing to recover the target path/block ID and adjacent marker refId.
A direct offset inside a link is preferred; otherwise complete line link counts
and ordinal must agree. Ordinary links and ambiguous associations remain native.

Both click paths share metadata/target checks and navigator.navigate(reference).
Reading View anchor resolution is retained. Both highlight implementations,
reference metadata, marker format and selection workflow are unchanged.

Diagnostics: Live Preview click detected (className, sourcePath, target), followed
by Live Preview ref resolved (refId, null when unresolved). Existing Editor locator
and Editor highlight diagnostics remain for the now-reachable editor path.

## Validation

- npm test: 46 passed
- npm run typecheck: passed
- npm run build: passed
- git diff --check: passed

Tests cover current span offsets, alias edits, preceding source edits, same-target
ordinary links, ordinal fallback and ambiguous counts. Reading View association
and highlight tests remain passing. No real Obsidian UI run was available here.

## Next validation

In Live Preview click alias text and its nested underline. Confirm click detected,
ref resolved, target opens, then Editor locator/Editor highlight execute. Repeat
with changed aliases and ordinary same-target links. Regression-check Reading View
exact highlighting. Keep runtime diagnostics until this is confirmed.
