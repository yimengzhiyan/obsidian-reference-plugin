# Obsidian Reference Plugin

Create native Wiki Block Links that return to the exact selected source text.
The full Smart Reference workflow has been verified in real Obsidian: Reading
View click resolution and exact DOM Range highlighting, plus Live Preview span
click interception, refId resolution, navigation and CodeMirror exact highlighting.
The branch is ready for integration review. Recent metadata concealment changes
still need a final check in a real Obsidian Vault. It has not been merged into main.

## Development and installation

```bash
npm install
npm test
npm run typecheck
npm run build
```

`npm run dev` watches and rebuilds but does not reload Obsidian. Generated `main.js`
is ignored by Git. Copy `main.js`, `manifest.json`, and `styles.css` into
`<test-vault>/.obsidian/plugins/obsidian-reference-plugin/`, then enable/reload the
community plugin. Use a disposable Vault for development.

## Workflow

1. Run **Create Smart Reference (precise text spike)** from the source note.
2. Choose the target note, select text in its editor, and press Enter.
3. The plugin creates/reuses a block ID, replaces the source placeholder, and
   returns to the source note. Esc or **Cancel Smart Reference** cancels creation.
4. Click the link in Reading View or Live Preview to navigate and temporarily
   highlight the selected text. Highlights disappear after four seconds.

**Jump to and highlight last precise reference (spike)** exercises the same
navigation pipeline. Command names retain their spike labels; the broader guided
four-level reference UI is not implemented.

## Marker and storage

```markdown
[[Target#^block-id|display text]]<!--smart-ref:uuid-->
```

The adjacent HTML comment is invisible in Reading View. Live Preview hides the
`#^sr-[a-z0-9]+` destination fragment inside generated Wiki Links, adjacent HTML
markers, legacy `%%ref:id%%` markers, and standalone generated `^sr-[a-z0-9]+`
block IDs using editor decorations. Source mode keeps raw Markdown visible. Alias edits do not change
reference identity. Keep the marker beside the link. Same-line legacy `%%ref:id%%`
markers remain readable; markers separated into another paragraph require explicit
relocation with their original refId. Notes are not automatically migrated.

Plugin data stores refId, target file, block ID, selected text, offsets and prefix/
suffix context. Metadata format is unchanged. With the plugin disabled, the Wiki
Link still supports native block navigation.

## Architecture

### Reading View

A Markdown postprocessor annotates rendered links as an optimization. On click,
the handler checks `data-smart-ref-id`, an adjacent DOM comment, then current
Markdown from the containing view. The source fallback pairs resolved target
path/block ID and link order, counting ordinary links too. It never waits for
annotation; ambiguous count mismatches retain native navigation. For an associated
generated Smart Reference, the postprocessor also restores the source alias when
Reading View displays the internal target name. It hides generated standalone
`^sr-[a-z0-9]+` block IDs in rendered text while retaining normal user block IDs.
Ordinary links are not rewritten.

After navigation, the locator finds the block in Markdown. Obsidian renders its
current source into a detached container; normalized full block text identifies a
unique paragraph/list item in the target preview. No DOM block-ID attribute is
required. Selected text and context map to Text nodes; a DOM Range wraps each
matching node portion. Cleanup removes the temporary spans without editing Markdown.

### Live Preview

The capture click handler recognizes `.cm-hmd-internal-link` spans and nested
`.cm-underline` clicks as well as existing anchor links. It finds the containing
MarkdownView and `.cm-line`, maps CodeMirror DOM positions to current source, and
uses the shared Wiki Link/marker parser. A source position inside the link is
preferred; complete line counts and order provide a conservative fallback.

Both views share metadata/target validation and `navigator.navigate(reference)`.
Native clicks are canceled only after those checks pass.

### Editor decorations

A separate StateField parses the current CM6 document. It uses a replacement
decoration for the `#^sr-[a-z0-9]+` fragment in generated Wiki Link destinations
and standalone generated `^sr-[a-z0-9]+` block IDs, plus inline-styled marks for
complete Smart Reference metadata. It does not inspect rendered token class names.
Ordinary block links, user block IDs, comments and pending-creation placeholders remain visible. The field applies only when
Obsidian's public `editorLivePreviewField` is true, rebuilds after document or mode
changes, and provides atomic cursor ranges. It never changes Markdown or source
offsets. Switch to Source mode to inspect or edit the raw syntax.


For Live Preview/Source editor targets, the locator validates stored offsets,
searches selectedText within its block, then uses prefix/suffix to disambiguate.
Recovered offsets pass through `editor.offsetToPos()` into CodeMirror document
positions. A CM6 StateField applies `Decoration.mark`, verifies the resulting range,
maps it through edits, and removes it after the timer. Unrecoverable exact text
falls back to the block range. Raw Source link-click interception is not added;
editor highlighting works when the existing navigation/command opens that target.

### Backlinks display

A document-level discovery observer and pane observers clean complete
`%%ref:id%%`, `<!--smart-ref:id-->` and generated `^sr-[a-z0-9]+` text
tokens within `.backlink-pane .search-result-file-match` rows. Smart Reference Wiki
Links are parsed only inside `.search-result-file-matched-text`; wrappers conceal
`[[Target#^sr-id|` and `]]`, leaving only the alias. Reserved metadata is also
matched across the row because Obsidian renders its comment in a sibling span.
Hidden wrappers preserve the original text nodes and the clickable row; no row
`textContent`, Markdown or metadata is rewritten. The parser tolerates syntax split
across nested highlight nodes, line breaks and zero-width rendering characters.
Normal Wiki Links remain unchanged. Split tokens and delayed updates are supported.
Each workspace document has a discovery observer above its body and one cleanup
observer attached to each current `.backlink-pane`. File-open, active-view and
layout events reconcile actual pane identities: removed panes are disconnected,
new panes are observed and cleaned immediately. Discovery also handles panes that
arrive after the workspace event. Content observers remain connected during cleanup;
plugin-generated mutations do not trigger a cleanup loop. Unload disconnects all
observers and removes wrappers; Source and Live Preview are unchanged.

The `file-open` event has its own two-frame delay before entering the existing
immediate/frame/settled cleanup pipeline. This covers file changes in the same
Markdown leaf, where `active-leaf-change` does not fire and Live Preview can refresh
Backlinks after the initial workspace event.

This depends on Obsidian’s private Backlinks DOM. The confirmed hierarchy is
`.backlink-pane` → `.search-result-container` → `.search-result-file-match` →
`.search-result-file-matched-text`; the result row is clickable and does not contain
an anchor element. Other layouts, global search and truncated markers are not
covered. Workspace pop-out documents use the same scoped cleanup.
Optional debug logs report workspace events, observer attachment and disconnection,
matched row counts, hidden marker counts and normalized `file-open`,
`active-leaf-change`, `mode-switch` and `mutation` trigger sources.
For Backlinks troubleshooting, enable the runtime debug switch and inspect
`Backlinks cleanup` counts. If a row still leaks, capture its DOM from the Vault;
the large temporary row snapshots have been removed from normal builds.

Future appearance, hover/focus and settings ideas are in
[the UI proposal](docs/UI_PROPOSAL.md); these are not implemented settings.

## Diagnostics

Normal builds are quiet. To turn on optional diagnostics in Obsidian's developer
console, run `localStorage.setItem("SMART_REFERENCE_DEBUG", "true")`. To turn them
off, run `localStorage.removeItem("SMART_REFERENCE_DEBUG")`. The switch is read at
runtime; a rebuild is unnecessary. Logs include click resolution, highlight result
and fallback reason, decoration counts and Backlinks observer activity. They may
include note paths or reference identifiers, so leave the switch off normally.

## Known limitations

- Missing metadata/targets or ambiguous association leave native navigation intact.
- Repeated targets with incomplete rendering/count mismatches may remain native.
- Identical full rendered paragraphs cannot be safely distinguished for Reading
  View highlighting. A missing/ambiguous container reports unavailable highlighting.
- Embedded-note source is not inferred from its host. Complex Markdown, plugin-
  generated DOM, mixed link syntax, and multi-block selections need further coverage.
- Core selection support targets paragraphs and single-line list items. Source
  parsing is a lightweight Wiki Link parser, not a full Markdown syntax parser.
- The editor bridge uses `editor.cm`; Obsidian compatibility remains a runtime risk.
- Target rename/move repair, metadata migration and fuzzy text recovery are deferred.

## Integration regression checks

Recheck creation/cancellation, Reading View exact highlighting, Live Preview alias
clicks, source/alias edits, ordinary same-target links, block fallback, timed cleanup
and plugin-disabled native links. Source-mode targets, complex formatting, repeated
paragraphs and mixed links remain useful extended coverage. See
`docs/CURRENT_STATUS.md`, `docs/TASKS.md`, and `docs/DECISIONS.md` for the handoff.
