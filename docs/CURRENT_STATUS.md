# CURRENT_STATUS

**Branch:** `codex/reference-marker-redesign`

**Environment:** Linux/Codex; real Obsidian validation pending.

The requested branch did not exist locally or remotely, so it was created from
`codex/reading-view-range-fix` at 7a462d9.

## Current change

New references generate `[[Target#^block|alias]]<!--smart-ref:uuid-->` without a
newline or blank paragraph between the link and marker. HTML comments are invisible
in Reading View. The reference store and refId values are unchanged.

The parser accepts adjacent HTML markers and legacy same-line `%%ref:id%%` markers.
Reading View annotation first uses an adjacent DOM comment when retained; otherwise
it uses current section source, target and link order. Alias text is not identity.
DOM comment annotation also works when section source is unavailable. Live Preview
uses the same source parser. Raw Source mode displays editable Markdown as before.

Highlight algorithms and selection behavior were not changed in this branch.

## Validation

- npm test: 32 passed
- npm run typecheck: passed
- npm run build: passed
- git diff --check: passed

Tests cover generation/parse round-trip, alias and surrounding edits, ordinary links,
legacy format, DOM comment annotation and source fallback when comments are removed.

## Next step / limits

Create a new reference in a test Vault; confirm the comment is invisible in Reading
View and the anchor receives data-smart-ref-id. Repeat after alias/source edits.
If both DOM comment and section source are unavailable, native navigation remains.
Existing markers separated from links by blank paragraphs are not automatically
migrated: move the known marker beside its corresponding link and change it to the
new HTML comment syntax, keeping the same refId. No heuristic cross-paragraph pairing.
