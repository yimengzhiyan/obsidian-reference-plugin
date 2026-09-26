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
  modified. Real-Obsidian validation confirmed that aliases render correctly.
- The postprocessor also hides standalone generated `^sr-[a-z0-9]+` block IDs in
  target note rendering. It requires a matching line-ending ID in section source
  when available and leaves normal user IDs such as `^my-custom-id` visible.

## Current Live Preview concealment repair

- Runtime evidence showed there are no `.cm-blockid` nodes for these references;
  aliases render as `.cm-hmd-internal-link.cm-link-alias`. Removed the DOM query,
  `posAtDOM`, measure callback and supplemental StateEffect path.
- Live Preview now derives CM6 ranges from current Markdown. It hides only the
  `#^sr-[a-z0-9]+` fragment inside a Wiki Link destination, complete adjacent
  `<!--smart-ref:id-->` markers, legacy `%%ref:id%%` markers, and line-ending
  generated `^sr-[a-z0-9]+` block IDs. User block IDs and ordinary block-link
  destinations remain visible. Source mode has no concealment ranges.
- Real-Obsidian validation then showed that the source range was correct but a
  CSS mark did not reliably conceal the fragment inside Obsidian's Wiki Link
  decoration. The fragment now uses `Decoration.replace()` directly on its CM6
  document range. Metadata keeps its existing styled marks.
- The CM6 DOM fixture models alias internal-link spans and confirms exact source
  ranges, absence of the generated fragment, visible normal link fragments,
  Source-mode restoration, click association and exact-highlight coexistence.
  Real-Obsidian validation confirmed the same behavior: generated fragments,
  metadata markers and block IDs are hidden in Live Preview; Source mode preserves
  raw Markdown; ordinary user block IDs remain visible; and navigation plus exact
  editor highlighting continue to work.

## Backlinks display status

- Real Vault DOM inspection established that Backlinks rows contain no anchors.
  `.search-result-file-match.tappable` owns interaction, the raw Wiki Link is under
  `.search-result-file-matched-text`, and the HTML ref marker can be in a sibling
  span. The final cleanup parses Smart Reference Wiki Links only inside matched-text
  spans and conceals their opening/closing syntax, leaving aliases visible.
- Reserved HTML/legacy markers and standalone generated IDs are still matched over
  the row so sibling metadata is hidden. Cleanup wraps the affected child Text
  nodes without replacing `row.textContent`, preserving the tappable row identity,
  listeners and native navigation. Multiple references and syntax split across
  nested highlight spans are covered. Normal Wiki Links remain unchanged.
- Real Obsidian showed that Live Preview can render its in-document Backlinks pane
  inside `.cm-editor`. The blanket editor exclusion introduced by `54aa199` remained
  after `a9edbd9` structurally scoped cleanup to confirmed Backlinks rows. It caused
  genuine Live Preview rows to return before cleanup and before matched-text logs.
  That legacy exclusion is removed. Eligibility now requires an actual
  `.search-result-file-match` inside `.backlink-pane`, and Wiki Link conversion
  remains limited to that row's `.search-result-file-matched-text`. Ordinary editor
  Markdown outside a Backlinks pane remains untouched.
- Full-row snapshots and the unconditional matched-text console log used during
  diagnosis are removed. Retained Backlinks diagnostics use the runtime
  `SMART_REFERENCE_DEBUG` switch.
- Backlinks cleanup observes current `.backlink-pane` elements and reattaches on
  file, leaf and layout changes, so rebuilt panes and rows are cleaned again. Each
  mutation and workspace refresh receives an immediate cleanup plus two debounced
  animation-frame passes. Delegated `pointerover` and `focusin` handlers schedule
  the same passes for delayed row rerenders. The former permanent row-level skip is
  removed: a WeakMap records row and matched-text content, while every pass also
  verifies the hidden wrappers. If Obsidian restores identical raw syntax on the
  same elements, missing wrappers cause cleanup to run again. Stable wrappers are
  scanned without DOM writes, preserving loop protection.
- Because Obsidian exposes `MarkdownView.getMode()` but no public mode-change event,
  a lightweight observer compares each tracked view's mode after container changes
  and during file/layout/active-leaf workspace synchronization. A detected
  `preview ↔ source` transition triggers the same delayed Backlinks refresh.
- Same-leaf file navigation does not necessarily emit `active-leaf-change`. The
  explicit `file-open` listener now waits two animation frames for Live Preview's
  Backlinks refresh, then enters the existing immediate/frame/settled cleanup
  pipeline. The file path and current Markdown view mode are carried through all
  pane-level passes, including mutation-triggered continuations.
- Optional cleanup diagnostics now include the trigger source, cumulative cleanup
  runs, per-run matches/replacements, cache hits/misses, text changes and replacement
  execution, plus cumulative replacements attributed to mode switches versus
  pointer/focus interactions. Trigger sources normalize to `file-open`,
  `active-leaf-change`, `mode-switch` and `mutation`; the settled file-open record
  includes its path, mode and replacement count.

## Integration cleanup

Reviewed the commits from `main` through this branch. Functional changes for
creation, marker association, Reading View, Live Preview, editor decoration and
Backlinks remain. Detailed Reading View text dumps, redundant source-text diagnostics
and the temporary Backlinks row HTML/node snapshots are removed. Retained concise optional logs
for click resolution, applied highlight kind/fallback, editor decoration, metadata
concealment and Backlinks observer lifecycle/counts.

`src/debug.ts` reads `localStorage.getItem("SMART_REFERENCE_DEBUG")` at runtime.
Logging is off unless it equals `"true"`; payloads remain lazy. No setting or
metadata field was added. The three zero-byte untracked investigation files named
for Backlinks selectors were deleted.

## Validation and remaining work

- `npm test`: 77 passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Real Vault: Reading View and Live Preview Backlinks display only aliases and no
  raw Smart Reference syntax.
- Real Vault: hover/focus rerenders remain clean.
- Real Vault: same-leaf file switching and cross-file navigation remain clean.
- Real Vault: Backlinks rows remain clickable and navigate correctly.
- Real Vault: Live Preview hides internal-link fragments and metadata while Source
  mode preserves the raw Markdown syntax.
- Real Vault: Reading View displays the Smart Reference alias rather than the
  generated target fragment.
- Real Vault: generated target block IDs are hidden in Reading View and Live
  Preview while normal user-authored block IDs remain visible.
- Real Vault: Smart Reference creation, navigation and exact highlighting pass in
  Reading View and Live Preview.

Native fallback, ambiguous rendering, embedded-note source association, complex
Markdown and the private `editor.cm` bridge remain the main compatibility limits.
Backlinks cleanup depends on Obsidian's private DOM. No merge or release action
has been taken. Historical implementation decisions are in `docs/DECISIONS.md`;
broader roadmap work remains in `docs/TASKS.md`.
