import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { debugLog } from "./debug.ts";

export type HiddenSourceRange = {
  from: number;
  to: number;
  kind: "link-block-fragment" | "html-marker" | "legacy-marker";
};

const WIKI_LINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;
const METADATA_PATTERN = /%%ref:[A-Za-z0-9_-]+%%|<!--smart-ref:[A-Za-z0-9_-]+-->/g;

/** Find Smart Reference syntax from Markdown source, independent of rendered token classes. */
export function findLivePreviewHiddenRanges(source: string): HiddenSourceRange[] {
  const ranges: HiddenSourceRange[] = [];

  for (const link of source.matchAll(WIKI_LINK_PATTERN)) {
    const linktext = link[1];
    const aliasSeparator = findUnescapedAliasSeparator(linktext);
    const target = aliasSeparator < 0 ? linktext : linktext.slice(0, aliasSeparator);
    const fragment = /#\^sr-[a-z0-9]+$/.exec(target);
    if (!fragment) continue;
    const from = link.index! + 2 + fragment.index;
    ranges.push({ from, to: from + fragment[0].length, kind: "link-block-fragment" });
  }

  for (const marker of source.matchAll(METADATA_PATTERN)) {
    ranges.push({
      from: marker.index!,
      to: marker.index! + marker[0].length,
      kind: marker[0].startsWith("<!--") ? "html-marker" : "legacy-marker",
    });
  }

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to);
}

/** Presentation only: offsets and the Markdown document are never modified. */
export function createMetadataHidingField(livePreview: StateField<boolean>): StateField<DecorationSet> {
  const build = (state: EditorState): DecorationSet => {
    if (state.field(livePreview, false) !== true) return Decoration.none;
    const hidden = findLivePreviewHiddenRanges(state.doc.toString());
    const decorations = hidden.map(({ from, to, kind }) => Decoration.mark({
      class: `smart-ref-hidden-${kind}`,
      attributes: { style: "display: none !important" },
      inclusive: false,
    }).range(from, to));
    debugLog(() => ["[Smart Reference] Live Preview metadata hidden", {
      hiddenDecorationCount: decorations.length,
      linkBlockFragmentCount: hidden.filter((range) => range.kind === "link-block-fragment").length,
      htmlMarkerCount: hidden.filter((range) => range.kind === "html-marker").length,
      legacyMarkerCount: hidden.filter((range) => range.kind === "legacy-marker").length,
    }]);
    return Decoration.set(decorations, true);
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

function findUnescapedAliasSeparator(linktext: string): number {
  for (let index = 0; index < linktext.length; index += 1) {
    if (linktext[index] !== "|") continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && linktext[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}
