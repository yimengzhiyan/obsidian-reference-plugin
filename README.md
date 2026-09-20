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
3. Copy `manifest.json` and the generated `main.js` into that directory.
4. Open the test Vault in Obsidian.
5. Open **Settings → Community plugins**, enable community plugins if needed,
   and enable **Obsidian Reference Plugin**.
6. Confirm that the plugin loads without an error in the developer console.
7. Disable the plugin and confirm that it unloads without an error.

Milestone 0 only verifies the plugin skeleton. Reference creation and
navigation features will be added in later milestones.
