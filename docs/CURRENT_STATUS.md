# CURRENT_STATUS

## Current phase

**Phase:** Runtime selection-confirmation fix after Milestone 2 validation

**Branch:** `codex/runtime-selection-fix`

**Environment:** Linux / Codex; dependencies already installed in the repository workspace

Manual Obsidian validation found a real failure in the selection-confirmation
path: after opening the target, selecting text, and pressing Enter, the selection
collapsed and the workflow reported "Return to the selected target note before
confirming." The click-interception architecture remains unchanged; this branch
only fixes that runtime regression.

## Implemented

- Selection-mode Enter/Escape handling now runs in document capture phase, calls
  `preventDefault`/`stopPropagation` only while selection mode is active, and
  therefore reads the selection before CodeMirror's Enter handling can mutate it.
- The exact `WorkspaceLeaf` used to open the target is retained for the lifetime
  of selection mode. Confirmation uses the retained leaf's matching Markdown
  view first, with a matching active Markdown view as fallback.
- Target opening explicitly activates/focuses the selected leaf after `openFile`.
- Confirmation diagnostics now distinguish missing pending state, missing target
  state, no Markdown view, wrong active target, and empty selection. Structured
  debug logging records expected, active, and retained paths without noisy
  success-path logging.
- Pure tests cover active-view preference, retained-leaf fallback, and every
  context failure classification.

The prior click-interception implementation remains implemented:

- Source parser for the adjacent representation:

  ```markdown
  [[Target#^block-id|Alias]] %%ref:<ref-id>%%
  ```

- Reading View Markdown post processor that uses public
  `MarkdownPostProcessorContext.getSectionInfo()` source text to associate and
  annotate rendered internal-link anchors with their ref IDs.
- Capture-phase DOM click handler that only intercepts recognized Smart
  References with both stored metadata and an existing target file.
- Live Preview resolution by mapping the clicked rendered link to a Markdown
  offset through CodeMirror `posAtDOM`, then parsing the source at that offset.
- Ordinary Wiki Links, missing references, and stale/missing target metadata are
  not prevented, so Obsidian retains native link fallback behavior.
- Shared navigation module for click handling and the existing manual debug
  command.
- Editing-view exact range scroll/highlight through the existing CM6 Decoration.
- Reading View block lookup and temporary rendered-DOM text highlight; block
  highlight is used when exact rendered text cannot be resolved.
- Reference persistence and lookup isolated in `src/reference-store.ts`.
- Link detection and rendered-link annotation isolated in `src/links.ts`.
- Ten automated core tests, including marker parsing, source-offset lookup,
  known reference resolution, and missing reference behavior.
- Updated manual test-Vault checklist in `README.md`.

## Validation performed

- `npm test`: passed (10 tests).
- `npm run typecheck`: passed.
- `npm run build`: passed; ignored `main.js` generated.
- `git diff --check`: passed during implementation.

No new Obsidian UI claims have been marked manually verified in this environment.

## Manual validation still required

- Re-run the exact reproduced regression: target opens → mouse selection → Enter
  → selection captured → block ID created/reused → placeholder replaced → source
  note reopened.
- Confirm Escape is consumed only during selection mode and normal Enter/Escape
  editor behavior is unchanged outside that mode.
- Confirm diagnostics for deliberately changing to a different note while a
  selection operation is pending.

- Live Preview click interception, navigation, scrolling, and exact CM6 highlight.
- Reading View post-processor association, click interception, block lookup, and
  rendered-DOM highlight cleanup.
- Native fallback with the plugin disabled.
- Native fallthrough for a missing ref ID, deleted metadata, and moved/deleted
  target file.
- Multiple Smart References in the same rendered section, especially identical
  target/alias combinations.
- Source Mode behavior boundary; unrendered Wiki Link syntax is intentionally
  not intercepted by the current anchor-based implementation.
- Popout-window behavior; the registered handler currently targets the main
  document and needs runtime validation or per-window registration.
- Modifier-click behavior (new tab/split) is not yet preserved by enhanced
  navigation and should be evaluated before productizing the interaction.

## API findings and limitations

- Real runtime evidence shows `getActiveViewOfType(MarkdownView)` is not a
  sufficient identity anchor for this cross-note workflow. The leaf returned by
  `getLeaf(false)` and used by `openFile` must be retained and inspected directly.
- A document bubble-phase key handler runs after target editor handlers. For
  selection confirmation, capture phase is required so Enter cannot collapse or
  replace the selection before it is recorded.

- Obsidian exposes no documented Smart-Wiki-Link click event carrying adjacent
  hidden-comment source context.
- `registerMarkdownPostProcessor` is the public Reading View integration point;
  its section information allows source-to-rendered association without exposing
  the hidden comment in the DOM.
- Live Preview requires DOM-to-source mapping. CodeMirror `posAtDOM` is public,
  but reaching the `EditorView` still uses Obsidian's undocumented `editor.cm`
  bridge. That access is isolated in `src/navigation.ts` and fails safely.
- Reading View cannot use CodeMirror Decorations. Its highlight therefore wraps
  rendered text nodes temporarily and restores the DOM after four seconds; the
  Markdown source is never modified.
- A moved target may still be recoverable by Obsidian's updated native Wiki Link,
  while plugin metadata is stale. The handler deliberately does not intercept in
  that case. Metadata rename synchronization remains a later milestone.

## Next recommended step

Install this branch into the same disposable Vault that reproduced the failure
and run the selection-confirmation regression first. Only after it passes should
the remaining Live Preview and Reading View click checklist continue.
