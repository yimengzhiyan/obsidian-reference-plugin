# CURRENT_STATUS

## Current phase

**Phase:** Milestone 1 — critical technical spikes

**Branch:** `codex/milestone-0-1`

**Environment:** Linux / Codex, dependencies already installed in the repository workspace

Milestone 0 is complete and was previously loaded successfully in a dedicated
Obsidian test Vault. The build watcher rebuilds on source changes but does not
reload Obsidian automatically.

## Implemented

- Minimal TypeScript/esbuild Obsidian Community Plugin skeleton.
- Persistent pending-operation state using Obsidian plugin `data.json`.
- Unique hidden source placeholder and safe unique-token replacement/removal.
- Cross-note cancellation using source path + placeholder rather than cursor position.
- Native `FuzzySuggestModal` over Markdown files, with Esc cancellation.
- Exact editor selection capture on Enter, including editor positions/source offsets;
  empty or unsupported cross-block selections are rejected.
- Normal-paragraph and simple single-line-list block detection.
- Existing block-ID reuse and automatic `sr-<uuid>` block-ID insertion.
- Native fallback output:

  ```markdown
  [[path/to/Note#^sr-12345678|selected text]] %%ref:<ref-id>%%
  ```

- Persisted spike metadata: file, block ID, selected text, offsets, prefix, suffix.
- Recovery by block ID, stored-offset validation, exact text, contextual
  disambiguation, then block fallback.
- Live-editor jump/highlight command using a temporary CodeMirror 6 Decoration;
  the decoration is removed after four seconds and does not alter Markdown.
- Automatic return to the source note after successful precise-reference creation.
- Pure-logic automated tests for placeholders, blocks, IDs, and recovery.
- Manual test-Vault checklist in `README.md`.

## Validation performed

- `npm test`: passed (5 tests).
- `npm run typecheck`: passed.
- `npm run build`: passed; ignored `main.js` generated.
- `git diff --check`: passed before the handoff documentation update.
- Earlier Milestone 0 manual validation confirmed plugin load, unload, enable,
  and rebuild behavior in a dedicated test Vault.

## Manual validation still required

- Full new precise-reference flow in a current Obsidian test Vault.
- Fuzzy picker responsiveness with 100+ notes.
- Enter/Esc event behavior and placeholder cleanup at every stage.
- Native block navigation after generated paragraph and list block IDs.
- Exact temporary highlight and scroll position in Live Preview and Source Mode.
- Whether the CodeMirror-backed editor `cm` dispatch bridge remains available in
  the supported Obsidian versions.
- Reading View: native links should work, but precise click interception and
  decoration are not implemented there.

Do not describe the UI behavior above as manually verified until this checklist
has been run in Obsidian.

## Known limitations / risks

- The spike only supports selections within one normal paragraph or one
  single-line list item. Complex lists, quotes, callouts, tables, code blocks,
  and cross-block selections remain out of scope.
- The hidden `%%ref:<id>%%` marker is emitted beside the Wiki Link, but enhanced
  link-click association/interception is not implemented. Navigation is exposed
  through the "last precise reference" spike command.
- Highlight dispatch currently uses the CodeMirror-backed Obsidian Editor's
  runtime `cm` property. Editor-extension registration is public; the dispatch
  bridge is not a stable documented API and needs compatibility validation.
- Reading View needs a separate DOM-range/highlight implementation layer; a
  CodeMirror Decoration only applies to editing views.
- Reference metadata is stored in plugin `data.json`; schema migration, rename
  handling, and complete CRUD remain later milestones.
- The dependency installation attempt was stopped after the restricted network
  environment stalled. Required CodeMirror packages were already installed as
  Obsidian development dependencies, and no package-lock change was required.

## Next recommended step

Install the current branch in a disposable test Vault and execute the README
manual checklist. Record exact Obsidian-version results for paragraph/list native
block navigation, selection keyboard handling, Live Preview decoration, and
Reading View fallback before promoting spike code into the formal workflow.
