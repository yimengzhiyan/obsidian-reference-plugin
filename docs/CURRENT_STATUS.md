# CURRENT_STATUS

## Current phase

**Phase:** Milestone 2 click-runtime repair, awaiting real-Obsidian revalidation

**Branch:** `codex/click-runtime-fix`

The full creation flow was manually validated in Obsidian: source placeholder →
target picker → target selection → Enter → block ID → source replacement → return
to source. Two subsequent click defects were reproduced in the real runtime:

1. Clicking an unchanged target reached the right block but highlighted the
   whole paragraph instead of the selected phrase. The old navigator could
   report `highlighted-exact` even after Reading View's rendered-text wrapper
   failed and highlighted the whole block. The runtime report did not establish
   whether the underlying failure was the source locator, DOM block scope, or
   rendered-text normalization.
2. After unrelated Source edits, native block navigation still worked but the
   Smart Reference highlight disappeared. The old Live Preview association
   required `posAtDOM(anchor)` to land *inside* the Wiki Link's source offsets;
   rendered anchor positions do not provide that invariant. The exact failing
   stage in the reproduced Vault has not yet been instrumented there.

## Implemented on this branch

- Live Preview resolves the clicked anchor from its containing Markdown view,
  current source line, link `data-href`, and ordinal among same-target links.
  It parses the current source each time, so edits before/after/elsewhere and
  alias changes do not depend on stored offsets or display text. A unique
  whole-note target is the fallback when the source line cannot be mapped;
  ambiguous targets are left to native handling.
- Reading View searches the rendered paragraph/list item containing the block
  ID and tolerates collapsed whitespace. Exact text spans and block fallback
  are returned as distinct applied-highlight results; navigation results now
  describe what was actually highlighted. Rendered failure is logged at debug
  level, not mislabeled as exact or shown as a misleading user notice.
- Debug logs distinguish an unassociated click, failed Live Preview marker
  association, missing metadata, missing target, source locator result, and
  rendered block fallback. Native Wiki links and adjacent `%%ref:id%%` markers
  are unchanged. The manual highlight command remains available.
- Pure tests cover ordinary Source edits, alias edits, same-target ambiguity,
  marker adjacency, rendered whitespace matching, and highlight classification.

Prior fixes remain: modal single-settlement, retained target leaf, capture-phase
Enter/Escape selection, placeholder cleanup, block anchoring, and reference
recovery.

## Verification

- `npm test`: 19 pure tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated `main.js` remains ignored.
- `git diff --check`: passed.
- This branch has **not** been run in Obsidian yet. The user's creation-flow
  validation applies to the base branch, not these click changes.

## Remaining validation and risks

- Reproduce the unchanged-target click in both Live Preview and Reading View;
  inspect the new locator/applied-kind logs and confirm only the selected text
  is highlighted. The new code fixes false result reporting and likely DOM
  causes, but the specific runtime DOM mismatch remains unconfirmed.
- In Live Preview, insert text before and after the link, edit unrelated source
  text, and change its alias; click after each edit and confirm enhanced
  highlight. Inspect association logs if any click falls through.
- Verify Reading View annotation after Source edits, native fallback with the
  plugin disabled, and fallthrough for missing metadata/target.
- Text deliberately inserted between the Wiki Link and `%%ref:id%%` breaks the
  required adjacency and disables enhancement; the native link still works.
- Source Mode raw Wiki syntax, popout documents, modifier-click behavior,
  mixed Markdown/Wiki links to the same target, and repeated identical links
  remain compatibility boundaries for later validation. No rename handling was
  added.

## Next recommended step

Install this branch into the disposable Vault and run the updated click-runtime
regression checklist, using the debug log to identify any remaining runtime
association or rendered-text failure before moving to later milestones.
