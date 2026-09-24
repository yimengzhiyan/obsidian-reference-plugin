# CURRENT_STATUS

**Phase:** Backlinks display cleanup and UI proposal; not merged
**Branch:** `codex/live-preview-click-interception`
**Environment:** Linux/Codex; real Obsidian workflow validation supplied by user

## Verified milestone

The full workflow works. Reading View resolves clicks and highlights exact text
using DOM Ranges. Live Preview intercepts cm-hmd-internal-link clicks, resolves
refId, opens the target and applies exact CodeMirror decorations. Earlier whole-
block observations must not be treated as remaining confirmed highlight defects.

## Integration cleanup

Reviewed the accumulated creation, marker/parser, view-specific click resolution,
shared navigation, locator, DOM Range and CM6 decoration paths. Functional fixes
are retained. Runtime diagnostics now use a shared lazy logger, disabled by default
via SMART_REFERENCE_DEBUG=false in src/debug.ts. Payloads are not evaluated while
disabled. Enable the source flag and rebuild/reload when investigating runtime issues.

README documents Reading View source/DOM association, Live Preview source-offset
resolution, editor decorations, fallback behavior, metadata and known limitations.
Decisions remain historical; D-042 records the current validated integration state.

## Validation

- npm test: 59 passed
- npm run typecheck: passed
- npm run build: passed
- git diff --check: passed

The prior functional build is user-verified in Obsidian. This diagnostic/documentation
cleanup is automatically checked; no new local Obsidian UI run was performed.

## Remaining limits

Ambiguous source/rendered counts retain native navigation. Identical rendered blocks,
partial rendering, embedded notes and complex/plugin-generated Markdown remain
limited. Raw Source click interception, automatic legacy-marker migration and target
rename/move recovery are deferred. The editor.cm bridge is a compatibility risk.
See README for exact behavior and the integration regression checklist.

## Next action

Review this branch for integration and optionally smoke-test the quiet build in the
same Vault. Merge only when explicitly authorized; no merge was performed.


## Live Preview cleanup

Added a separate CM6 replacement-decoration field driven by Obsidian's public
editorLivePreviewField. Complete %%ref:id%% and <!--smart-ref:id--> tokens are hidden
in Live Preview, including detached legacy markers. Source mode shows raw Markdown.
The document is unchanged; existing parser/click offsets and exact marks remain valid.
Atomic cursor ranges skip concealed markers. Recompute on source/mode changes only.
Ordinary comments, incomplete markers and pending placeholders are not concealed.

Tests cover both formats, unchanged source/ref resolution, mode toggles, edits,
incomplete markers and coexistence with exact-highlight decorations. Existing click
and highlight implementations are untouched. A real Obsidian check remains for
marker visibility, mode switching, alias clicks and both highlight strategies.


## Generated target anchors

User verified legacy ref markers are hidden in Live Preview and raw source remains
visible. Extend the same replacement decorations to whitespace-delimited,
line-ending ^sr- plus eight lowercase hexadecimal characters (the generator's
format). Only anchor characters are hidden; whitespace, Markdown and offsets are
unchanged. Ordinary/custom IDs and Wiki Link target fragments are not matched.
No navigation, click, highlight or reference-store code changed.

Tests verify mode toggling, exact-match exclusions, unchanged source, ref resolution,
block lookup and exact-decoration coexistence. Real Obsidian confirmation remains:
Live Preview hides target anchors; Source shows them; clicks still navigate and
highlight the selected text.


## Block-ID syntax token cleanup (supersedes replacement-only attempt)

Runtime validation rejected a92e110: generated anchors remained visible as
`<span class="cm-blockid">^sr-fa1b9d4b</span>`. State-only replacement tests did
not establish actual Obsidian rendering behavior. The DOM observation confirms
visible syntax tokens; the precise reason replacement lost at runtime is unproven.

Generated anchors now receive a dedicated CM6 mark class with a scoped base theme
that hides the mark and nested/co-located cm-blockid tokens. Only matching anchor
source ranges receive the class; bare cm-blockid tokens are never globally hidden.
Source mode removes all concealment marks. Legacy/HTML marker replacements remain.
Debug-only diagnostics list matched block IDs and hidden decoration count (not a
claim of measured DOM visibility). No navigation/click/highlight/storage changes.

Validation: 53 tests, typecheck, build and diff check pass. Added mark-class and
anchor-edit coverage; existing mode, exclusions, locator and exact-mark tests pass.
No real Obsidian UI is available here. Next: reload the built main.js, verify the
new mark around cm-blockid, Live Preview invisibility, Source visibility, ordinary
anchors, and reference clicks/exact highlights. Current branch remains
codex/live-preview-click-interception; no merge to main.


## Backlinks display cleanup

User confirms the core workflow and Live Preview marker/block-ID hiding work.
Remaining reported leak is Backlinks/linked mentions. A dedicated DOM observer now
wraps complete legacy and HTML metadata text in hidden spans only within Backlinks
snippets. Text content, link identity/handlers and real DOM comments survive.
No Markdown, store, navigation, click or highlighting implementation changed.
Source/editor content is excluded. Existing and newly rendered/edited snippets are
processed; cleanup disconnects during its own writes and restores spans on unload.

Private DOM selectors are isolated in src/backlinks-cleanup.ts. Their compatibility
is not established by unit tests. Truncated markers and separate pop-out documents
remain unsupported. Logs report hidden span counts only behind the debug flag.
Added jsdom as a development-only dependency for actual DOM/observer fixture tests.

Validation: 57 tests pass, typecheck/build pass, diff check passes. Tests cover split
markers, computed display, event/element preservation, scope exclusions, ordinary
comments, result replacement, reuse of hidden text nodes and unload restoration.
Runtime acceptance remains: install/reload, inspect sidebar and embedded backlinks,
expand/collapse/filter/update results, confirm raw Source and both click/highlight
paths, then disable plugin and confirm restoration. No new Obsidian UI run here.

UI_PROPOSAL.md contains unimplemented reference appearance, hover/focus information,
and settings ideas. Next step is real Backlinks validation and proposal review;
no merge is authorized or performed.


## Backlinks pane/row repair after DOM investigation

User confirmed .backlink-pane > .search-result-container >
.search-result-file-match > .search-result-file-matched-text and reported markers
still visible in 54aa199. Replace snippet-only handling with full result-row
handling scoped strictly to .backlink-pane. Each pane has a MutationObserver for
child, text and class updates; a discovery observer manages added/replaced panes.
Conceal complete legacy/HTML markers and generated ^sr-xxxxxxxx tokens, including
visible link fragments, without changing hrefs, textContent or native handlers.
Normal IDs and unrelated comments remain visible; Source/Live Preview untouched.

Debug-only cleanup logs include reason, matchedNodesCount (processed result rows),
and hiddenMarkerCount (tokens, independent of split wrapper count), even when zero.
59 tests, typecheck, build and diff checks pass. Realistic fixtures cover note-open,
delayed text updates, switching notes, pane replacement, ordinary-token exclusions
and preserved click handlers/targets. This is automated DOM validation, not a real
Obsidian navigation run. Next: reload the plugin, open/switch notes, inspect the
Backlinks panel and verify navigation/exact highlighting in the Vault.

Three pre-existing untracked files (.search-result-container,
.search-result-file-match, .search-result-file-matched-text) were left untouched
and excluded from the commit. No merge to main.
