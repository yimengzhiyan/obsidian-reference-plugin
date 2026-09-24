# Smart Reference UI proposal

Status: proposal only; no appearance, hover, settings or navigation changes are
implemented by the Backlinks cleanup. Core workflow and Live Preview concealment
are user-verified. Review these ideas after Backlinks runtime validation.

## Reference appearance

Keep the user's alias and native internal-link appearance by default. Offer an
optional subtle dotted underline for references with successfully resolved metadata.
An optional small reference icon could follow later, if it does not disrupt line
wrapping or selection. Ordinary Wiki Links keep their native styling.

Use theme variables and retain visible keyboard focus. Avoid status encoded only
by color. Apply styling only after reference resolution; never infer identity from
alias text. Reading View anchors and Live Preview spans need separate presentation
adapters, both consuming the existing resolver without changing click behavior.

Acceptance: alias edits keep styling; normal links are untouched; long aliases,
light/dark themes, keyboard use and plugin unload behave correctly. Native link
navigation must continue when metadata is unavailable or the plugin is disabled.

## Hover and focus information

An optional compact preview could show:

- Target note name (full path available when needed).
- A short excerpt of the referenced text, with nearby context where useful.
- A plain-language state only when known: “Exact text found,” “Text changed;
  opens the paragraph,” or “Target unavailable.”

Resolve against current content before asserting recovery status. A stored quote
must be labeled as the original selection if current recovery has not run. Render
note text safely as text, never HTML. Do not display refId, offsets, marker syntax,
or block IDs to normal users.

Prefer integrating with Obsidian's native hover preview if the supported API
permits it. Check API compatibility before implementation. Avoid competing hover
popovers; include keyboard focus access, Escape dismissal and a touch equivalent.
Do not add a second navigation pipeline or change normal modifier-click behavior.

Acceptance: no stale status after target edits, no disruptive popover on mouse
movement, keyboard accessibility, and no injected HTML from note content.

## Settings page ideas

| Setting | Proposed default | Purpose |
| --- | --- | --- |
| Reference appearance | Native link | Optional subtle visual distinction |
| Reference information on hover/focus | Off initially | Enable after native hover compatibility is validated |
| Highlight duration | 4 seconds | Preserve current behavior; expose a bounded duration control |
| Hide metadata in Live Preview | On | Presentation preference; Source always remains raw |
| Hide metadata in Backlinks | On | Allow disabling the private-DOM adapter if an Obsidian update breaks it |
| Troubleshooting diagnostics | Off | Explicit opt-in; explain that logs may include note text |

Use small “Appearance” and “Troubleshooting” groups rather than exposing internal
algorithms. Include a restore-defaults action. Settings would require a separate
implementation and persistence review; this task does not alter reference storage.
Keep hotkeys in Obsidian's existing Hotkeys UI. Never offer an action that deletes
markers or anchors merely to improve appearance.

## Suggested sequence

1. Validate Backlinks cleanup in the real Vault, including collapsed/expanded and
   refreshed results, Source mode, reference clicks, exact highlighting and unload.
2. Implement optional reference styling and its accessibility regression checks.
3. Prototype hover/focus integration against supported Obsidian APIs.
4. Add only settings needed by the accepted features, with stable defaults.

No redesign of markers, locators, navigation or highlight rendering is proposed.
