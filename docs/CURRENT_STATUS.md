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

## Current Reading View display repair

- Runtime validation found that a generated `[[Target#^sr-id|alias]]` could display
  `Target` instead of its alias in Reading View.
- The existing postprocessor now retains the source Wiki Link matched by target,
  block ID and same-target order. When that link has an adjacent ref marker and a
  generated `#^sr-[a-z0-9]+` target, it restores the alias on the rendered anchor.
- Normal links, ambiguous associations and generated-looking links without a ref
  marker remain unchanged. Navigation attributes and highlight behavior are not
  modified. Real-Obsidian validation of the repaired display is still required.

## Current Live Preview concealment repair

- Runtime evidence showed there are no `.cm-blockid` nodes for these references;
  aliases render as `.cm-hmd-internal-link.cm-link-alias`. Removed the DOM query,
  `posAtDOM`, measure callback and supplemental StateEffect path.
- Live Preview now derives CM6 ranges from current Markdown. It hides only the
  `#^sr-[a-z0-9]+` fragment inside a Wiki Link destination, complete adjacent
  `<!--smart-ref:id-->` markers and legacy `%%ref:id%%` markers. Standalone block
  IDs and ordinary block-link destinations remain visible. Source mode has no
  concealment ranges.
- Real-Obsidian validation then showed that the source range was correct but a
  CSS mark did not reliably conceal the fragment inside Obsidian's Wiki Link
  decoration. The fragment now uses `Decoration.replace()` directly on its CM6
  document range. Metadata keeps its existing styled marks.
- The CM6 DOM fixture models alias internal-link spans and confirms exact source
  ranges, absence of the generated fragment, visible normal link fragments,
  Source-mode restoration, click association and exact-highlight coexistence.
  Real-Obsidian validation is still required.

## Backlinks display status

- Runtime diagnostics confirmed the observer cleans current rows and metadata
  markers, but hiding only the generated block token left broken display text such
  as `[[Target#|alias]]`. Backlinks cleanup now recognizes the complete generated
  Wiki Link and hides its opening syntax and closing brackets, leaving only alias.
- The correction uses the existing hidden text wrappers, preserving any enclosing
  anchor, href and event handlers. Ordinary Wiki Links remain unchanged.
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

- `npm test`: 68 passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Real Vault: validate internal-link fragment and metadata concealment in Live
  Preview, plus raw syntax in Source mode.
- Real Vault: confirm Reading View displays the Smart Reference alias rather than
  the generated target fragment.
- Real Vault: validate Backlinks after opening, switching and clicking notes. If a
  row still leaks, enable debug logging and inspect that row's actual DOM before
  changing the matcher.
- Real Vault: confirm generated Backlinks Wiki Links display only their aliases and
  retain native backlink interaction.
- Real Vault: smoke-test navigation and exact highlighting in both views.

Native fallback, ambiguous rendering, embedded-note source association, complex
Markdown and the private `editor.cm` bridge remain the main compatibility limits.
Backlinks cleanup depends on Obsidian's private DOM. No merge or release action
has been taken. Historical implementation decisions are in `docs/DECISIONS.md`;
broader roadmap work remains in `docs/TASKS.md`.
