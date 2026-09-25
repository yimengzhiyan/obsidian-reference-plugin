import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { debugLog } from "./debug.ts";

type BlockTokenRange = { from: number; to: number; text: string };
const addBlockTokenRanges = StateEffect.define<BlockTokenRange[]>();
const hiddenMark = (className: string) => Decoration.mark({
  class: className,
  attributes: { style: "display: none !important" },
  inclusive: false,
});
const blockMark = () => hiddenMark("smart-ref-hidden-block-id");

/** Validate rendered syntax tokens against current source; never mutate CM DOM. */
export function renderedBlockTokenRanges(
  view: Pick<EditorView, "contentDOM" | "state" | "posAtDOM">,
): BlockTokenRange[] {
  const ranges: BlockTokenRange[] = [];
  for (const token of view.contentDOM.querySelectorAll(".cm-blockid")) {
    const raw = token.textContent ?? "";
    const text = raw.trim();
    if (!/^\^sr-[a-z0-9]+$/.test(text)) continue;
    try {
      const from = view.posAtDOM(token) + raw.indexOf(text);
      const to = from + text.length;
      if (from >= 0 && to <= view.state.doc.length && view.state.doc.sliceString(from, to) === text) {
        ranges.push({ from, to, text });
      }
    } catch {
      // Obsidian can replace a token before the measurement runs. Retry next render.
    }
  }
  return ranges;
}

/** Presentation only: offsets and the Markdown document are never modified. */
export function createMetadataHidingField(livePreview: StateField<boolean>): StateField<DecorationSet> {
  const build = (state: EditorState): DecorationSet => {
    if (state.field(livePreview, false) !== true) return Decoration.none;
    const ranges = Array.from(state.doc.toString().matchAll(
      // Reserved generated anchors occur at the end of a line.
      // Keep arbitrary user block IDs and link fragments visible.
      /%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->|(?<!\S)\^sr-[a-z0-9]+(?=[ \t]*\r?$)/gm,
    ), (match) => (match[0].startsWith("^sr-")
      // Keep Obsidian's cm-blockid syntax token and style its exact source range.
      // A mark works whether syntax highlighting nests inside or outside it.
      ? blockMark()
      : hiddenMark("smart-ref-hidden-metadata")
    ).range(match.index!, match.index! + match[0].length));
    debugLog(() => ["[Smart Reference] Live Preview metadata hidden", {
      count: ranges.length,
      hiddenBlockIdCount: ranges.filter((range) => range.value.spec.class === "smart-ref-hidden-block-id").length,
    }]);
    return Decoration.set(ranges);
  };
  return StateField.define<DecorationSet>({
    create: build,
    update: (decorations, transaction) => {
      const modeChanged = transaction.startState.field(livePreview, false) !== transaction.state.field(livePreview, false);
      if (transaction.state.field(livePreview, false) !== true) return Decoration.none;
      let next = transaction.docChanged || modeChanged ? build(transaction.state) : decorations;
      for (const effect of transaction.effects) {
        if (!effect.is(addBlockTokenRanges)) continue;
        const additions = effect.value.filter(({ from, to, text }) => {
          if (from < 0 || to > transaction.state.doc.length || transaction.state.doc.sliceString(from, to) !== text) return false;
          let covered = false;
          next.between(from, to, (start, end, value) => {
            if (start === from && end === to && value.spec.class === "smart-ref-hidden-block-id") covered = true;
          });
          return !covered;
        }).map(({ from, to }) => blockMark().range(from, to));
        next = next.update({ add: additions, sort: true });
      }
      return next;
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
      ViewPlugin.define((view) => {
        let destroyed = false;
        const measure = () => view.requestMeasure({
          key: field,
          read: () => view.state.field(livePreview, false) === true ? renderedBlockTokenRanges(view) : [],
          write: (tokens) => {
            if (destroyed || view.state.field(livePreview, false) !== true) return;
            const decorations = view.state.field(field);
            const missing = tokens.filter(({ from, to }) => {
              let covered = false;
              decorations.between(from, to, (start, end, value) => {
                if (start === from && end === to && value.spec.class === "smart-ref-hidden-block-id") covered = true;
              });
              return !covered;
            });
            if (missing.length) {
              const measuredState = view.state;
              // CM forbids dispatch during its measure/write phase. Apply after it
              // ends, only if these offsets still belong to the same editor state.
              queueMicrotask(() => {
                if (!destroyed && view.state === measuredState && view.state.field(livePreview, false) === true) {
                  view.dispatch({ effects: addBlockTokenRanges.of(missing) });
                }
              });
            }
            debugLog(() => ["[Smart Reference] Live Preview block-id tokens", {
              matchedCmBlockidTokenCount: tokens.length,
              hiddenDecorationCount: tokens.length - missing.length,
              pendingDecorationCount: missing.length,
            }]);
          },
        });
        measure();
        return {
          // Runs after CM has updated its syntax-token DOM, including viewport changes.
          docViewUpdate: measure,
          update: measure,
          destroy: () => { destroyed = true; },
        };
      }),
    ],
  });
}
