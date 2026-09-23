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
Preview and Reading View when its adjacent `%%ref:<id>%%` metadata can be
resolved. Ordinary Wiki Links and unresolved Smart References are left to
Obsidian's native link handler.

These remain technical-spike commands, not the final four-level user experience.
Use a disposable test Vault. Current manual checks are:

1. Create a reference to text inside a normal paragraph and confirm the source
   receives a native `[[Note#^block-id|Alias]]` plus hidden ref marker.
2. Repeat with an existing block ID and confirm no duplicate is added.
3. Cancel from the picker and from the target note; confirm the source has no
   orphan placeholder.
4. In Live Preview, click a generated Smart Reference; confirm its target opens,
   the exact text scrolls into view, and the temporary highlight disappears.
5. Repeat selection with a simple list item and record whether native block
   navigation resolves correctly in the installed Obsidian version.
6. In Reading View, click a generated Smart Reference and confirm the rendered
   target text is temporarily highlighted without changing Markdown.
7. Run the manual highlight command and confirm it still follows the same path.
8. Temporarily disable the plugin and click the same link; confirm Obsidian still
   opens the native block target.
9. With the plugin enabled, delete the stored reference or move its target and
   confirm the click falls through to native navigation without an exception.
