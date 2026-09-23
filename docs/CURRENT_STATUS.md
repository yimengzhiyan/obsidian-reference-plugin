# CURRENT_STATUS

## Current phase

**Phase:** Focused Reading View exact-highlight and alias-association repair

**Branch:** `codex/render-highlight-fix`

**Environment:** Linux/Codex; Obsidian runtime validation is performed by the user in a disposable Vault

The creation workflow is manually validated. The user also validated that
click navigation reaches the correct target and remains stable after inserting
text before/after a Source reference and editing unrelated Source text.

Two real runtime problems remain on the prior branch:

1. Reading View clicks scroll to the correct block but always highlight the
   whole paragraph, even when the target text is unchanged.
2. Editing the Wiki Link alias leaves native navigation working but loses the
   Smart Reference enhancement.

## Implemented on this branch

- Reading View exact highlighting maps normalized rendered-text offsets to
  individual text nodes, splits only the matching portions, wraps each portion
  independently, and restores the DOM after the timer. It no longer calls
  `Range.surroundContents`. An adjacent paragraph/list item is considered when
  Obsidian renders the block-ID anchor beside, rather than inside, the block.
  Unmatched or failed wrapping still falls back to block highlighting.
- Reading View annotation pairs *all* current source Wiki Links, including
  ordinary links, with rendered anchors by target and same-target order.
  Display text is not the primary identity. If counts differ, a unique current
  alias can associate a link; ambiguous cases retain native navigation.
- Pure tests cover changed aliases, unrelated edits, ordinary/ambiguous
  same-target links, and exact text split across rendered text nodes.

The native `[[Target#^block|Alias]] %%ref:id%%` representation, Live Preview
association, manual highlight command, modal single-settlement, retained leaf,
and capture-phase selection handling are unchanged.

## Verification

- `npm test`: 22 pure tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated `main.js` is ignored.
- `git diff --check`: passed.
- This branch has **not** yet been manually run in Obsidian. The runtime findings
  above describe the prior branch, not a claimed validation of this fix.

## Technical finding and remaining risk

Static code inspection shows that the old `wrapText()` already created a
separate `Range` for each Text node. A whole-block fallback required it to
return no spans, most likely because rendered text was not found in the chosen
DOM scope; a cross-element `surroundContents()` exception would instead have
interrupted navigation. The exact Obsidian DOM mismatch is still unconfirmed.
The new segment mapping and adjacent-block lookup address likely causes and
make wrapping safer, but the user must repeat the real Reading View case.

Reading View post-processing depends on Obsidian's section source and rendered
anchor order. Mixed Markdown/Wiki links or a plugin that inserts extra anchors
can make counts differ; unique alias fallback is allowed, ambiguity falls
through to native navigation. No settings, metadata hiding, alias UI, or
rename/move handling was added.

## Next recommended step

Install this branch in the same disposable Vault. Re-test unchanged-target
Reading View exact highlighting, alias edits in both views, normal Source edits,
temporary cleanup, and plugin-disabled native fallback. Capture the
`[Smart Reference]` locator and rendered-text debug output if block fallback
still occurs.
