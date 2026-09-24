import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { debugLog } from "./debug.ts";

/** Presentation only: offsets and the Markdown document are never modified. */
export function createMetadataHidingField(livePreview: StateField<boolean>): StateField<DecorationSet> {
  const build = (state: EditorState): DecorationSet => {
    if (state.field(livePreview, false) !== true) return Decoration.none;
    const ranges = Array.from(state.doc.toString().matchAll(
      // Generated anchors are lowercase UUID prefixes at the end of a line.
      // Keep arbitrary user block IDs and link fragments visible.
      /%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->|(?<!\S)\^sr-[0-9a-f]{8}(?=[ \t]*\r?$)/gm,
    ), (match) => (match[0].startsWith("^sr-")
      // Keep Obsidian's cm-blockid syntax token and style its exact source range.
      // A mark works whether syntax highlighting nests inside or outside it.
      ? Decoration.mark({ class: "smart-ref-hidden-block-id", inclusive: false })
      : Decoration.replace({ inclusive: false })
    ).range(match.index!, match.index! + match[0].length));
    debugLog(() => ["[Smart Reference] Live Preview metadata hidden", {
      count: ranges.length,
      blockIds: ranges.filter((range) => range.value.spec.class === "smart-ref-hidden-block-id")
        .map((range) => state.doc.sliceString(range.from, range.to)),
      hiddenBlockIdCount: ranges.filter((range) => range.value.spec.class === "smart-ref-hidden-block-id").length,
    }]);
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
      EditorView.baseTheme({
        // Never target bare .cm-blockid: user anchors and Source must stay visible.
        ".smart-ref-hidden-block-id, .smart-ref-hidden-block-id .cm-blockid, .cm-blockid.smart-ref-hidden-block-id": {
          display: "none !important",
        },
      }),
    ],
  });
}
