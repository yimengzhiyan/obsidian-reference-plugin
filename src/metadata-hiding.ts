import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { debugLog } from "./debug.ts";

/** Presentation only: offsets and the Markdown document are never modified. */
export function createMetadataHidingField(livePreview: StateField<boolean>): StateField<DecorationSet> {
  const build = (state: EditorState): DecorationSet => {
    if (state.field(livePreview, false) !== true) return Decoration.none;
    const ranges = Array.from(state.doc.toString().matchAll(
      /%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/g,
    ), (match) => Decoration.replace({ inclusive: false }).range(match.index!, match.index! + match[0].length));
    debugLog(() => ["[Smart Reference] Live Preview metadata hidden", { count: ranges.length }]);
    return Decoration.set(ranges);
  };
  return StateField.define<DecorationSet>({
    create: build,
    update: (decorations, transaction) => {
      const modeChanged = transaction.startState.field(livePreview, false) !== transaction.state.field(livePreview, false);
      return transaction.docChanged || modeChanged ? build(transaction.state) : decorations;
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
    ],
  });
}
