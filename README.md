# Obsidian Reference Plugin

An Obsidian plugin for creating internal references with custom display text,
precise target positioning, and navigation highlighting.

See `docs/PROJECT_CONTEXT.md` for the complete project definition.

## Development

Install dependencies and build the plugin bundle:

```bash
npm install
npm run build
```

For the local watch/rebuild development workflow, run:

```bash
npm run dev
```

This watches the source and rebuilds `main.js`; it does not automatically
reload the plugin inside Obsidian.

The generated `main.js` is intentionally ignored by Git. The checked-in
source of the plugin is `main.ts` and the build configuration is
`esbuild.config.mjs`.

## Manual loading in a test Vault

Use a dedicated test Vault rather than a production Vault:

1. Build the project with `npm run build`.
2. Create the directory `<test-vault>/.obsidian/plugins/obsidian-reference-plugin/`.
3. Copy `manifest.json`, `styles.css`, and the generated `main.js` into that directory.
4. Open the test Vault in Obsidian.
5. Open **Settings → Community plugins**, enable community plugins if needed,
   and enable **Obsidian Reference Plugin**.
6. Confirm that the plugin loads without an error in the developer console.
7. Disable the plugin and confirm that it unloads without an error.

## Smart Reference commands

- **Create Smart Reference (precise text spike)** inserts a persistent
  placeholder, opens a fuzzy Markdown-note picker, and enters exact-selection
  mode. Select text and press Enter; Esc cancels and removes the placeholder.
- **Jump to and highlight last precise reference (spike)** reopens the most
  recently created target and applies a four-second, non-destructive editor
  decoration.
- **Cancel Smart Reference** cleans up an unfinished placeholder, including
  after navigation or plugin reload.

Clicking a generated Smart Reference now triggers enhanced navigation in Live
Preview and Reading View when its adjacent `<!--smart-ref:<id>-->` metadata can be
resolved. Ordinary Wiki Links and unresolved Smart References are left to
Obsidian's native link handler.

These remain technical-spike commands, not the final four-level user experience.
The creation flow and navigation after Source and alias edits have been manually
validated. Runtime logs now show that clicks can arrive before Reading View
annotation finishes. Clicks therefore resolve refId directly from current source
when DOM metadata is absent. Filter the console for `[Smart Reference] click
resolution` to confirm which path ran before inspecting target highlight results.
Use a disposable test Vault. Current manual checks are:

1. Run the exact selection-confirmation regression:
   `Choose Target → modal closes without cancelling pending state or removing the
   source placeholder → Target opens → select text → Enter → selection is captured before editor
   mutation → block ID is created/reused → source placeholder is replaced →
   workflow returns to the source note`.
   Confirm that target selection settles once even though Obsidian invokes modal
   close and choose callbacks during the same lifecycle.
2. Create a reference to text inside a normal paragraph and confirm the source
   receives a native `[[Note#^block-id|Alias]]` plus hidden ref marker.
3. Repeat with an existing block ID and confirm no duplicate is added.
4. Cancel from the picker and from the target note; confirm the source has no
   orphan placeholder.
5. In Live Preview, click a generated Smart Reference with an unchanged target;
   confirm only the selected words highlight, the target scrolls into view, and
   the temporary highlight disappears. Confirm the log reports locator `exact`
   and applied `exact`. Repeat in Reading View, including a phrase split by
   Markdown formatting into multiple rendered text nodes. Confirm only the
   chosen words highlight and cleanup restores the original rendered DOM. If a
   whole block highlights, record the locator and rendered-DOM fallback logs.
6. Repeat selection with a simple list item and record whether native block
   navigation resolves correctly in the installed Obsidian version.
7. Return to Source and, one at a time, insert text before the Smart Reference,
   insert text after it, edit unrelated text elsewhere, and edit its alias while
   preserving the target and `%%ref:id%%`. Click after each edit in Live Preview;
   enhanced highlighting must still occur. Repeat alias change in Reading View.
   Save/reopen Source between cases if needed to exercise rerendering. Test an
   ordinary Wiki Link to the same target beside the Smart Reference; only the
   Smart Reference should enhance. Inspect association debug logs on failure.
8. Run the manual highlight command and confirm it still follows the same path.
9. Temporarily disable the plugin and click the same link; confirm Obsidian still
   opens the native block target.
10. With the plugin enabled, delete the stored reference or move its target and
   confirm the click falls through to native navigation without an exception.
11. Deliberately insert non-whitespace text between the Wiki Link and its
    `%%ref:id%%` marker. Enhanced association should stop, while the native
    block link should continue to navigate. Restore adjacency afterward.

## Reference marker format

New references use `[[Target#^block|alias]]<!--smart-ref:uuid-->`. Keep the comment
beside the link; it is invisible in Reading View. Alias edits preserve identity.
Legacy same-line `%%ref:id%%` remains readable. Old markers in separate paragraphs
must be moved beside their corresponding links; reuse the same refId. The plugin
preserves the existing reference store and does not migrate note content automatically.
