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

- npm test: 64 passed
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


## Persistent Backlinks cleanup lifecycle

User verified initial note-open concealment, but markers reappeared after clicking
a backlink. The exact runtime mutation sequence is not available locally. Replace
pane observer registration/disconnection and affected-row inference with one
persistent observer on the stable UI root. On each render mutation batch, rescan
current .backlink-pane result rows using the unchanged concealment logic. Observe
childList/subtree, text, and relevant visibility/class attributes. Drain synchronous
cleanup records rather than disconnecting, so subsequent asynchronous rendering
remains observed. Disconnect only on unload and restore hidden wrappers.

Debug-only logs now include observer-trigger mutation count, cleanup reason,
nodesScanned and markersHidden. No Markdown/store/navigation/highlighting/Live
Preview changes. 61 tests, typecheck, build and diff checks pass. Tests reproduce
click-triggered pane replacement and repeated refreshes, assert zero disconnects
until unload, and verify no self-generated cleanup loop. Real Vault validation
remains: open/switch notes, click backlinks repeatedly, refresh pane, verify hidden
markers and unchanged navigation/highlighting. Private DOM and main-document
limitations remain. Existing three untracked investigation files remain untouched.


## Live Preview block-token repair (current task)

User clarified that Reading View and Backlinks issues are solved. The remaining
issue is Live Preview cm-blockid spans showing generated anchors. No changes to
Backlinks, Reading View, click interception, navigation, or highlight code here.

Broaden Live Preview's reserved format from eight hex digits to ^sr-[a-z0-9]+.
Mark decorations now carry inline display:none!important instead of relying on a
base theme. A CM6 ViewPlugin measures actual cm-blockid spans after rendering,
validates posAtDOM against current source, and adds missing decoration ranges via
a StateEffect. Dispatch runs in a microtask after CM's measure phase, with state,
mode and disposal guards. Source mode clears concealment; no editor DOM mutation.
Debug-only logs report matchedCmBlockidTokens, hiddenDecorationCount and pending
counts. Ordinary user IDs outside the reserved format remain visible.

63 tests, typecheck/build and diff check pass. Added actual CM6 EditorView/jsdom
coverage with cm-blockid decorations, Source toggling and exact-highlight marks;
token mapping tests reject stale/unmappable or non-reserved tokens. Existing refId
and locator tests remain green. This is not a real Obsidian UI run. Next: install
the build, verify Live Preview hides anchors, Source shows them, and Smart Reference
clicks still navigate/highlight. If needed enable SMART_REFERENCE_DEBUG and capture
token/decoration counts. Existing three untracked files remain untouched.


## Backlinks-only clarification and workspace attachment

User corrected the scope: the visible metadata is in Backlinks (“链接当前文件”),
not Live Preview. Preserve 95ee7b9's CM6 changes unchanged. Existing tests already
hide the supplied literal examples under the known selectors; the remaining Vault
failure has not been reproduced from the available information. Requested affected
row outerHTML/window location to distinguish missing observer scope from rendering.

Addressed a concrete attachment limitation: setup previously observed only the
original main document.body. A Backlinks-only manager now attaches above each
workspace document's body, refreshes on file-open/active-leaf/layout changes, and
attaches/detaches on window-open/close. DOM observers still cover delayed renders.
The cleanup matcher is unchanged. Debug output includes matchedBacklinkRows,
hiddenMarkerCount, panesFound and rootConnected; no editor/navigation changes.

64 tests, typecheck, build and diff check pass. New regression covers secondary
documents, body replacement, explicit workspace refresh, detach and unload; prior
rerender/click/Source/CM6 tests pass. Real-Vault resolution remains unconfirmed.
Next: reload and inspect Backlinks after opening/clicking/switching files. If markers
remain, collect the affected row outerHTML and debug counts; do not infer another
editor defect. Pre-existing untracked investigation files remain untouched.
