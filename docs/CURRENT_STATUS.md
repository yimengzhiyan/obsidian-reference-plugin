# CURRENT_STATUS

**Phase:** Live Preview metadata concealment; not merged
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

- npm test: 53 passed
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
