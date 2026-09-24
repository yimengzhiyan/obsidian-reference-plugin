# CURRENT_STATUS

**Phase:** Smart Reference feature prepared for integration; not merged
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

- npm test: 47 passed
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
