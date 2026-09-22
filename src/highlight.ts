import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { TextRange } from "./text-ranges.ts";

export const setPreciseHighlight = StateEffect.define<TextRange | null>();

export const preciseHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(highlights, transaction) {
    highlights = highlights.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setPreciseHighlight)) continue;
      highlights = effect.value
        ? Decoration.set([
            Decoration.mark({ class: "smart-ref-precise-highlight" }).range(
              effect.value.from,
              effect.value.to,
            ),
          ])
        : Decoration.none;
    }
    return highlights;
  },
  provide: (field) => EditorView.decorations.from(field),
});
