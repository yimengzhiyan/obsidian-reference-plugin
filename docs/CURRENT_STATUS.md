# CURRENT_STATUS

**Branch:** `codex/live-preview-click-interception`
**Phase:** Integration review; do not merge into main yet
**Environment:** Linux/Codex; real Obsidian observations supplied by the user

## Implemented and user-verified

- Smart Reference creation, alias edits and source edits preserve navigation.
- Reading View resolves links and highlights the selected text with DOM Ranges.
- Live Preview intercepts internal-link spans, resolves refId, opens the target and
  applies exact CodeMirror decorations.
- Source mode retains raw Markdown. Plugin metadata and generated anchors remain
  in the source for native block-link navigation.

## Recent display changes that still need a Vault check

- Live Preview uses CM6 marks to conceal generated `^sr-` anchors, adjacent
  `<!--smart-ref:id-->` markers and legacy `%%ref:id%%` markers. The last change
  switched both marker formats to styled marks. Its tests pass; no subsequent
  real-Obsidian result has been supplied.
- Backlinks cleanup observes current `.backlink-pane` elements and reattaches on
  file, leaf and layout changes. Users reported that some rows remained visible
  after earlier repairs. The literal reported markers match in DOM fixtures, but
  no failing row's actual DOM was captured. Do not claim the mixed-row issue is
  resolved until the current build is validated in the Vault.

## Integration cleanup

Reviewed the commits from `main` through this branch. Functional changes for
creation, marker association, Reading View, Live Preview, editor decoration and
Backlinks remain. Removed temporary row HTML/node snapshots, detailed Reading View
text dumps and redundant source-text diagnostics. Retained concise optional logs
for click resolution, applied highlight kind/fallback, editor decoration, metadata
concealment and Backlinks observer lifecycle/counts.

`src/debug.ts` reads `localStorage.getItem("SMART_REFERENCE_DEBUG")` at runtime.
Logging is off unless it equals `"true"`; payloads remain lazy. No setting or
metadata field was added. The three zero-byte untracked investigation files named
for Backlinks selectors were deleted.

## Validation and remaining work

- `npm test`: 65 passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Real Vault: validate Live Preview metadata concealment and Source visibility.
- Real Vault: validate Backlinks after opening, switching and clicking notes. If a
  row still leaks, enable debug logging and inspect that row's actual DOM before
  changing the matcher.
- Real Vault: smoke-test navigation and exact highlighting in both views.

Native fallback, ambiguous rendering, embedded-note source association, complex
Markdown and the private `editor.cm` bridge remain the main compatibility limits.
Backlinks cleanup depends on Obsidian's private DOM. No merge or release action
has been taken. Historical implementation decisions are in `docs/DECISIONS.md`;
broader roadmap work remains in `docs/TASKS.md`.
