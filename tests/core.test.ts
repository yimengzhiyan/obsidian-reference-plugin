import { JSDOM } from "jsdom";
import { concealBacklinkMatch, startBacklinksCleanup } from "../src/backlinks-cleanup.ts";
import { createMetadataHidingField } from "../src/metadata-hiding.ts";
import { debugLog, SMART_REFERENCE_DEBUG } from "../src/debug.ts";
import { EditorState, StateEffect, StateField, Text } from "@codemirror/state";
import { preciseHighlightField, setPreciseHighlight } from "../src/highlight.ts";
import { toEditorHighlightRange } from "../src/editor-range.ts";
import { findRenderedBlockIndex, sourceBlockMarkdown } from "../src/reading-container.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { ensureBlockId, findBlockById, findContainingBlock } from "../src/blocks.ts";
import { locateReference } from "../src/locator.ts";
import {
  annotateRenderedSmartReferences,
  buildSmartReferenceLink,
  parseSmartReferenceComment,
  findSmartReferenceAtOffset,
  parseSmartReferenceLinks,
  resolveLivePreviewReference,
  resolveLivePreviewSpanLink,
  resolveReadingClickReference,
  resolveRenderedReferenceIds,
} from "../src/links.ts";
import type { PreciseReference } from "../src/model.ts";
import { classifyHighlightResult } from "../src/navigation-result.ts";
import { resolveReferenceById } from "../src/reference-store.ts";
import { findRenderedTextRange, mapTextRangeToSegments } from "../src/rendered-text.ts";
import { resolveSelectionContext } from "../src/selection-context.ts";
import { SingleSettlement } from "../src/single-settlement.ts";
import { findUniqueTextRange } from "../src/text-ranges.ts";

test("placeholder lookup requires exactly one token", () => {
  assert.deepEqual(findUniqueTextRange("a %%smart-ref:1%% b", "%%smart-ref:1%%"), {
    kind: "unique",
    range: { from: 2, to: 17 },
  });
  assert.equal(findUniqueTextRange("none", "%%smart-ref:1%%").kind, "not-found");
  assert.equal(findUniqueTextRange("xx xx", "xx").kind, "multiple");
});

test("paragraph block IDs are created once and reused", () => {
  const content = "Title\n\nFirst line\nsecond phrase here\n\nTail";
  const from = content.indexOf("phrase");
  const created = ensureBlockId(content, { from, to: from + 6 }, () => "sr-test");
  assert.ok(created);
  assert.equal(created.content, "Title\n\nFirst line\nsecond phrase here ^sr-test\n\nTail");
  assert.equal(created.inserted, true);

  const reused = ensureBlockId(created.content, { from, to: from + 6 }, () => "unused");
  assert.ok(reused);
  assert.equal(reused.blockId, "sr-test");
  assert.equal(reused.inserted, false);
});

test("single-line list items are independent blocks", () => {
  const content = "- first item\n- second selected item\n- third item";
  const from = content.indexOf("selected");
  const block = findContainingBlock(content, { from, to: from + 8 });
  assert.equal(block?.text, "- second selected item");
  const created = ensureBlockId(content, { from, to: from + 8 }, () => "list-id");
  assert.equal(created?.content, "- first item\n- second selected item ^list-id\n- third item");
});

test("locator validates offsets then recovers text moved within its block", () => {
  const original = "Prefix chosen words suffix ^block-1";
  const start = original.indexOf("chosen words");
  const reference = makeReference({ startOffset: start, endOffset: start + 12 });
  assert.deepEqual(locateReference(original, reference), {
    kind: "exact",
    range: { from: start, to: start + 12 },
  });

  const edited = "New text. Prefix chosen words suffix ^block-1";
  const moved = edited.indexOf("chosen words");
  assert.deepEqual(locateReference(edited, reference), {
    kind: "exact",
    range: { from: moved, to: moved + 12 },
  });
});

test("locator uses context for duplicate text and otherwise falls back safely", () => {
  const content = "Wrong chosen words x. Prefix chosen words suffix ^block-1";
  const reference = makeReference({ startOffset: 0, endOffset: 12 });
  const correct = content.lastIndexOf("chosen words");
  assert.deepEqual(locateReference(content, reference), {
    kind: "exact",
    range: { from: correct, to: correct + 12 },
  });

  const ambiguous = content.replace("Prefix ", "Wrong ").replace(" suffix", " x.");
  assert.equal(locateReference(ambiguous, reference).kind, "block-only");
  assert.equal(findBlockById(content, "block-1")?.blockId, "block-1");
});

test("smart reference parser binds an adjacent marker to its Wiki Link", () => {
  const source = "Before [[Folder/Target#^block-id|Custom \\| text]] %%ref:ref-123%% after";
  assert.deepEqual(parseSmartReferenceLinks(source), [
    {
      from: 7,
      to: 65,
      linktext: "Folder/Target#^block-id|Custom \\| text",
      target: "Folder/Target#^block-id",
      alias: "Custom \\| text",
      refId: "ref-123",
    },
  ]);
  const offset = source.indexOf("Custom");
  assert.equal(findSmartReferenceAtOffset(source, offset)?.refId, "ref-123");
});

test("smart reference parser ignores detached or malformed metadata", () => {
  assert.deepEqual(parseSmartReferenceLinks("[[Target]] unrelated %%ref:id%%"), []);
  assert.deepEqual(parseSmartReferenceLinks("[[Target]] %%ref:bad id%%"), []);
  assert.equal(findSmartReferenceAtOffset("[[Target]]", 3), null);
});

test("Live Preview association survives edits before, after, and elsewhere in Source", () => {
  const link = "[[Target#^block-1|Display]] %%ref:ref-1%%";
  const sources = [
    `Introduction ${link}\nTail`,
    `Inserted before. Introduction ${link}\nTail`,
    `Introduction ${link} added after\nTail`,
    `Introduction ${link}\nUnrelated paragraph changed`,
  ];
  for (const source of sources) {
    const line = source.split("\n")[0];
    assert.equal(resolveLivePreviewReference(source, "Target#^block-1", line, 0, 1), "ref-1");
    assert.equal(resolveLivePreviewReference(source, "Target#^block-1", null, null, null), "ref-1");
  }
});

test("alias edits preserve refId association without matching stored display text", () => {
  const source = "[[Target#^block-1|New display words]] %%ref:ref-1%%";
  assert.equal(resolveLivePreviewReference(source, "Target#^block-1", source, 0, 1), "ref-1");
});

test("ordinary links and ambiguous same-target links are never borrowed by a Smart Reference", () => {
  const source = "[[Target#^block-1|Ordinary]] [[Target#^block-1|Smart]] %%ref:ref-1%%";
  assert.equal(resolveLivePreviewReference(source, "Target#^block-1", source, 0, 2), null);
  assert.equal(resolveLivePreviewReference(source, "Target#^block-1", source, 1, 2), "ref-1");
  assert.equal(resolveLivePreviewReference(source, "Target#^block-1", null, null, null), null);
});

test("text inserted between Wiki Link and marker breaks the intentional adjacency", () => {
  const source = "[[Target#^block-1|Display]] inserted %%ref:ref-1%%";
  assert.equal(resolveLivePreviewReference(source, "Target#^block-1", source, 0, 1), null);
});

test("Reading View pairing survives alias and unrelated Source edits", () => {
  const target = "Target#^block-1";
  const link = `[[${target}|New display text]] %%ref:ref-1%%`;
  for (const source of [link, `Intro ${link} tail`, `Other paragraph changed\n${link}`]) {
    assert.deepEqual(resolveRenderedReferenceIds(source, [{ target }]), ["ref-1"]);
  }
});

test("Reading View pairs ordinary and Smart links by path, block ID, and order", () => {
  const target = "Target#^block-1";
  const otherBlock = "Target#^block-2";
  const source = `[[${target}|Ordinary]] [[${otherBlock}|Other]] %%ref:ref-2%% [[${target}|Smart]] %%ref:ref-1%%`;
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target },
    { target: otherBlock },
    { target },
  ]), [null, "ref-2", "ref-1"]);
});

test("Reading View resolves rendered href paths against the source note", () => {
  const source = "[[Folder/Target#^sr-id|Edited alias]] %%ref:uuid%%";
  const resolvePath = (path: string) => path === "Target" || path === "Folder/Target" ? "Folder/Target.md" : path;
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target: "Target#^sr-id" },
  ], resolvePath), ["uuid"]);
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target: "Folder%2FTarget#^sr-id" },
  ], resolvePath), ["uuid"]);
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target: "Target#%5Esr-id" },
  ], resolvePath), ["uuid"]);
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target: "Target#^other-id" },
  ], resolvePath), [null]);
});

test("Reading View leaves count mismatches and non-block links unannotated", () => {
  const target = "Target#^block-1";
  const source = `[[${target}|Smart]] %%ref:ref-1%%`;
  assert.deepEqual(resolveRenderedReferenceIds(source, [
    { target },
    { target },
  ]), [null, null]);
  assert.deepEqual(resolveRenderedReferenceIds(`[[${target}|Same]] %%ref:one%% [[${target}|Same]] %%ref:two%%`, [
    { target },
    { target },
    { target },
  ]), [null, null, null]);
  assert.deepEqual(resolveRenderedReferenceIds(source, [{ target: "Target" }]), [null]);
  assert.deepEqual(resolveRenderedReferenceIds(`[[${target}|Smart]] inserted %%ref:ref-1%%`, [{ target }]), [null]);
});

test("reference lookup resolves known IDs and safely reports missing IDs", () => {
  const reference = makeReference({ refId: "known" });
  const references = { known: reference };
  assert.equal(resolveReferenceById(references, "known"), reference);
  assert.equal(resolveReferenceById(references, "missing"), null);
});

test("selection context prefers the retained target leaf and falls back to the active target", () => {
  assert.deepEqual(resolveSelectionContext(true, "Target.md", "Target.md", "Other.md"), {
    kind: "ready",
    source: "active",
  });
  assert.deepEqual(resolveSelectionContext(true, "Target.md", null, "Target.md"), {
    kind: "ready",
    source: "retained",
  });
  assert.deepEqual(resolveSelectionContext(true, "Target.md", "Other.md", "Target.md"), {
    kind: "ready",
    source: "retained",
  });
  assert.deepEqual(resolveSelectionContext(true, "Target.md", "Target.md", "Target.md"), {
    kind: "ready",
    source: "retained",
  });
});

test("selection context reports distinct runtime failure causes", () => {
  assert.deepEqual(resolveSelectionContext(false, "Target.md", "Target.md", "Target.md"), {
    kind: "missing-pending",
  });
  assert.deepEqual(resolveSelectionContext(true, null, "Target.md", "Target.md"), {
    kind: "missing-expected-target",
  });
  assert.deepEqual(resolveSelectionContext(true, "Target.md", null, null), {
    kind: "no-markdown-view",
  });
  assert.deepEqual(resolveSelectionContext(true, "Target.md", "Other.md", "Elsewhere.md"), {
    kind: "wrong-active-target",
    actualPath: "Other.md",
  });
});

test("modal settlement keeps selection when close follows select", () => {
  const results: Array<string | null> = [];
  const settlement = new SingleSettlement<string>((value) => results.push(value));
  assert.equal(settlement.settle("Target.md"), true);
  assert.equal(settlement.settle(null), false);
  assert.deepEqual(results, ["Target.md"]);
});

test("modal settlement treats close without selection as one cancellation", () => {
  const results: Array<string | null> = [];
  const settlement = new SingleSettlement<string>((value) => results.push(value));
  assert.equal(settlement.settle(null), true);
  assert.deepEqual(results, [null]);
});

test("modal settlement ignores duplicate close and callback paths", () => {
  const results: Array<string | null> = [];
  const settlement = new SingleSettlement<string>((value) => results.push(value));
  assert.equal(settlement.settle(null), true);
  assert.equal(settlement.settle(null), false);
  assert.equal(settlement.settle("Late Target.md"), false);
  assert.deepEqual(results, [null]);
});

test("unchanged rendered target stays exact, including folded whitespace", () => {
  const selectedText = "chosen words";
  const rendered = "Prefix chosen words suffix";
  assert.deepEqual(findRenderedTextRange(rendered, selectedText, "Prefix ", " suffix"), {
    from: 7,
    to: 19,
  });
  assert.deepEqual(findRenderedTextRange("Prefix chosen\u00a0  words suffix", "chosen words", "", ""), {
    from: 7,
    to: 21,
  });
});

test("rendered exact match maps safely across multiple Markdown text nodes", () => {
  const nodes = ["Prefix ", "chosen", " ", "words", " suffix"];
  const range = findRenderedTextRange(nodes.join(""), "chosen words", "Prefix ", " suffix");
  assert.deepEqual(range, { from: 7, to: 19 });
  assert.deepEqual(mapTextRangeToSegments(nodes, range!), [
    { nodeIndex: 1, from: 0, to: 6 },
    { nodeIndex: 2, from: 0, to: 1 },
    { nodeIndex: 3, from: 0, to: 5 },
  ]);
  assert.deepEqual(mapTextRangeToSegments(["before chosen", " words after"], { from: 7, to: 19 }), [
    { nodeIndex: 0, from: 7, to: 13 },
    { nodeIndex: 1, from: 0, to: 6 },
  ]);
});

test("rendered exact failure reports block fallback instead of exact", () => {
  assert.equal(classifyHighlightResult("exact", "exact"), "highlighted-exact");
  assert.equal(classifyHighlightResult("exact", "block"), "highlighted-block");
  assert.equal(classifyHighlightResult("block-only", "block"), "highlighted-block");
  assert.equal(classifyHighlightResult("exact", null), "unsupported-view");
});

function makeReference(overrides: Partial<PreciseReference>): PreciseReference {
  return {
    refId: "ref-1",
    targetFile: "Target.md",
    blockId: "block-1",
    selectedText: "chosen words",
    startOffset: 7,
    endOffset: 19,
    prefix: "Prefix ",
    suffix: " suffix",
    ...overrides,
  };
}


test("Reading View container uses the full source block, not a selected substring", () => {
  const source = "Earlier chosen words elsewhere\n\nPrefix chosen words suffix ^block-1";
  const block = findBlockById(source, "block-1")!;
  const rendered = sourceBlockMarkdown(block.text);
  assert.equal(findRenderedBlockIndex(rendered, ["Earlier chosen words elsewhere", "Prefix chosen words suffix"]), 1);
  const range = findRenderedTextRange(rendered, "chosen words", "Prefix ", " suffix");
  assert.deepEqual(range, { from: 7, to: 19 });
  assert.deepEqual(mapTextRangeToSegments(["Prefix chosen words suffix"], range!), [{ nodeIndex: 0, from: 7, to: 19 }]);
});

test("Reading View block recovery uses current source after edits", () => {
  const source = "Inserted paragraph\n\nNew prefix. Prefix chosen words suffix ^block-1";
  const block = findBlockById(source, "block-1")!;
  const rendered = sourceBlockMarkdown(block.text);
  assert.equal(findRenderedBlockIndex(rendered, ["Inserted paragraph", rendered]), 1);
  assert.deepEqual(findRenderedTextRange(rendered, "chosen words", "Prefix ", " suffix"), { from: 19, to: 31 });
});

test("Reading View container tolerates whitespace but rejects duplicate or missing blocks", () => {
  assert.equal(findRenderedBlockIndex("Prefix\nchosen words suffix", ["Prefix chosen\u00a0 words suffix"]), 0);
  assert.equal(findRenderedBlockIndex("same", ["same", "same"]), null);
  assert.equal(findRenderedBlockIndex("missing", ["other"]), null);
  assert.equal(findRenderedBlockIndex("", [""]), null);
});

test("Reading View keeps a paragraph fallback when selected text no longer matches", () => {
  const rendered = sourceBlockMarkdown("Prefix replacement suffix ^block-1");
  assert.equal(findRenderedBlockIndex(rendered, [rendered]), 0);
  assert.equal(findRenderedTextRange(rendered, "chosen words", "Prefix ", " suffix"), null);
  assert.equal(sourceBlockMarkdown("Text **formatted** here ^sr-id"), "Text **formatted** here");
});


test("new references generate an adjacent invisible HTML marker and round-trip", () => {
  const source = buildSmartReferenceLink("Folder/Target.md", "block-1", "chosen words", "uuid-1");
  assert.equal(source, "[[Folder/Target#^block-1|chosen words]]<!--smart-ref:uuid-1-->");
  const parsed = parseSmartReferenceLinks(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].refId, "uuid-1");
  assert.equal(parsed[0].to, source.length);
  assert.equal(parseSmartReferenceComment("smart-ref:uuid-1"), "uuid-1");
  assert.equal(parseSmartReferenceComment("smart-ref:bad id"), null);
});

test("HTML markers survive alias and surrounding Source edits in both association paths", () => {
  const target = "Target#^block-1";
  for (const alias of ["original", "new alias", "中文别名"]) {
    const line = `Before [[${target}|${alias}]]<!--smart-ref:uuid--> after`;
    assert.equal(resolveLivePreviewReference(`Introduction\n${line}`, target, line, 0, 1), "uuid");
    assert.deepEqual(resolveRenderedReferenceIds(line, [{ target }]), ["uuid"]);
  }
  assert.deepEqual(resolveRenderedReferenceIds(`[[${target}|ordinary]] [[${target}|new alias]]<!--smart-ref:uuid-->`, [{ target }, { target }]), [null, "uuid"]);
});

test("parser rejects detached HTML markers while retaining same-line legacy references", () => {
  for (const gap of ["\n\n", " inserted "]) {
    assert.deepEqual(parseSmartReferenceLinks(`[[Target#^block|alias]]${gap}<!--smart-ref:uuid-->`), []);
  }
  assert.equal(parseSmartReferenceLinks("[[Target#^block|alias]] %%ref:old%%")[0].refId, "old");
});

test("annotation uses DOM comments without section source and source when comments are stripped", () => {
  // Minimal DOM boundary fixture: exercise annotation without importing Obsidian.
  const attrs = new Map<string, string>();
  const anchor = {
    dataset: { href: "Target#^block" },
    nextSibling: { nodeType: 8, textContent: "smart-ref:uuid" } as object | null,
    getAttribute: () => "Target#^block",
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    removeAttribute: (key: string) => attrs.delete(key),
  };
  const root = { querySelectorAll: () => [anchor] } as unknown as HTMLElement;
  annotateRenderedSmartReferences(root, "");
  assert.equal(attrs.get("data-smart-ref-id"), "uuid");
  anchor.nextSibling = null;
  annotateRenderedSmartReferences(root, "[[Target#^block|edited]]<!--smart-ref:uuid-->");
  assert.equal(attrs.get("data-smart-ref-id"), "uuid");
  annotateRenderedSmartReferences(root, "[[Target#^block|ordinary]]");
  assert.equal(attrs.has("data-smart-ref-id"), false);
});


test("Reading click resolves one Smart Reference without prior DOM annotation", () => {
  const anchors = [{ target: "Target#^block" }]; // No dataset/refId/comment input.
  assert.equal(resolveReadingClickReference("[[Target#^block|alias]]<!--smart-ref:id-->", anchors, 0), "id");
});

test("Reading click retains refId after alias changes", () => {
  for (const alias of ["first", "new alias", "对异常现象"]) {
    assert.equal(resolveReadingClickReference(`[[Target#^block|${alias}]]<!--smart-ref:id-->`, [{ target: "Target#^block" }], 0), "id");
  }
});

test("Reading click reads current source after unrelated edits", () => {
  const link = "[[Target#^block|alias]]<!--smart-ref:id-->";
  for (const source of [link, `Inserted before ${link} after`, `Unrelated paragraph\n\n${link}\n\nChanged tail`]) {
    assert.equal(resolveReadingClickReference(source, [{ target: "Target#^block" }], 0), "id");
  }
});

test("Reading click counts ordinary links when resolving same-target ordinals", () => {
  const source = "[[Target#^block|ordinary]] [[Other#^block|other]] [[Target#^block|smart]]<!--smart-ref:id-->";
  const anchors = [{ target: "Target#^block" }, { target: "Other#^block" }, { target: "Target#^block" }];
  assert.equal(resolveReadingClickReference(source, anchors, 0), null);
  assert.equal(resolveReadingClickReference(source, anchors, 2), "id");
});

test("Reading click refuses mismatched counts and invalid clicked indexes", () => {
  const link = "[[Target#^block|smart]]<!--smart-ref:id-->";
  const anchor = { target: "Target#^block" };
  assert.equal(resolveReadingClickReference(link, [anchor, anchor], 0), null);
  assert.equal(resolveReadingClickReference(`[[Target#^block|ordinary]] ${link}`, [anchor], 0), null);
  assert.equal(resolveReadingClickReference(link, [anchor], -1), null);
  assert.equal(resolveReadingClickReference(link, [anchor], 1), null);
});

test("Reading click reuses annotation's resolved path and block identity", () => {
  const source = "[[Folder/Target#^block|alias]]<!--smart-ref:id-->";
  const resolver = (path: string) => path === "Target" ? "Folder/Target" : path;
  assert.equal(resolveReadingClickReference(source, [{ target: "Target#%5Eblock" }], 0, resolver), "id");
  assert.equal(resolveReadingClickReference(source, [{ target: "Target#^different" }], 0, resolver), null);
});


test("editor range converts Obsidian positions into CodeMirror offsets", () => {
  const source = "Header\r\nPrefix chosen words suffix";
  const doc = Text.of(source.split("\r\n"));
  const offsetToPos = (offset: number) => {
    const lines = source.slice(0, offset).split("\r\n");
    return { line: lines.length - 1, ch: lines.at(-1)!.length };
  };
  const from = source.indexOf("chosen");
  assert.deepEqual(toEditorHighlightRange({ from, to: from + 12 }, source.length, offsetToPos, doc), { from: from - 1, to: from + 11 });
  assert.equal(toEditorHighlightRange({ from: -1, to: 2 }, source.length, offsetToPos, doc), null);
  assert.equal(toEditorHighlightRange({ from: 1, to: source.length + 1 }, source.length, offsetToPos, doc), null);
});

test("editor decoration marks recovered exact text and clears without modifying source", () => {
  const source = "Inserted. Prefix chosen words suffix ^block-1";
  const location = locateReference(source, makeReference({}));
  assert.equal(location.kind, "exact");
  let state = EditorState.create({ doc: source });
  const range = toEditorHighlightRange(location.range, source.length, (offset) => {
    const line = state.doc.lineAt(offset);
    return { line: line.number - 1, ch: offset - line.from };
  }, state.doc)!;
  state = state.update({ effects: [StateEffect.appendConfig.of(preciseHighlightField), setPreciseHighlight.of(range)] }).state;
  const marked: string[] = [];
  state.field(preciseHighlightField).between(0, state.doc.length, (from, to) => { marked.push(state.doc.sliceString(from, to)); });
  assert.deepEqual(marked, ["chosen words"]);
  state = state.update({ effects: setPreciseHighlight.of(null) }).state;
  assert.equal(state.field(preciseHighlightField).size, 0);
  assert.equal(state.doc.toString(), source);
});

test("editor block fallback uses the locator range and decorations follow edits", () => {
  const source = "Prefix replacement suffix ^block-1";
  const location = locateReference(source, makeReference({}));
  assert.equal(location.kind, "block-only");
  let state = EditorState.create({ doc: source, extensions: [preciseHighlightField] });
  state = state.update({ effects: setPreciseHighlight.of(location.range) }).state;
  state = state.update({ changes: { from: 0, insert: "New " } }).state;
  const ranges: Array<{ from: number; to: number }> = [];
  state.field(preciseHighlightField).between(0, state.doc.length, (from, to) => { ranges.push({ from, to }); });
  assert.deepEqual(ranges, [{ from: 4, to: source.length + 4 }]);
});


test("Chinese editor selection recovers after surrounding edits and invalid old offsets", () => {
  const selectedText = "尝试从相反";
  const original = "对异常现象保持敏感，并尝试从相反的方向理解它。 ^block-1";
  const startOffset = original.indexOf(selectedText);
  const reference = makeReference({ selectedText, startOffset, endOffset: startOffset + selectedText.length, prefix: "并", suffix: "的方向理解它。" });
  const cases = [
    { content: original, reference },
    { content: `新增前言。\n\n${original}`, reference },
    { content: "改变前文，同时尝试从相反的方向重新理解问题。 ^block-1", reference },
    { content: original, reference: { ...reference, startOffset: 9999, endOffset: 10004 } },
  ];
  for (const { content, reference: ref } of cases) {
    const location = locateReference(content, ref);
    assert.equal(location.kind, "exact");
    let state = EditorState.create({ doc: content, extensions: [preciseHighlightField] });
    const range = toEditorHighlightRange(location.range, content.length, (offset) => {
      const line = state.doc.lineAt(offset);
      return { line: line.number - 1, ch: offset - line.from };
    }, state.doc)!;
    state = state.update({ effects: setPreciseHighlight.of(range) }).state;
    const highlighted: string[] = [];
    state.field(preciseHighlightField).between(0, state.doc.length, (from, to) => { highlighted.push(state.doc.sliceString(from, to)); });
    assert.deepEqual(highlighted, [selectedText]);
  }
});

test("Chinese editor recovery uses context for repeats and keeps block fallback on failure", () => {
  const selectedText = "尝试从相反";
  const reference = makeReference({ selectedText, startOffset: 999, endOffset: 1004, prefix: "并", suffix: "的方向" });
  const content = "先尝试从相反的角度，并尝试从相反的方向理解。 ^block-1";
  const location = locateReference(content, reference);
  assert.equal(location.kind, "exact");
  assert.equal(location.range.from, content.lastIndexOf(selectedText));
  assert.equal(content.slice(location.range.from, location.range.to), selectedText);
  assert.equal(locateReference(content, { ...reference, prefix: "已删除", suffix: "已删除" }).kind, "block-only");
  assert.equal(locateReference("原文已经替换。 ^block-1", reference).kind, "block-only");
});


test("Live Preview spans resolve target and refId from current CodeMirror offsets", () => {
  for (const alias of ["alias", "对异常现象", "edited alias"]) {
    const source = `Unrelated edits\nPrefix [[Folder/Target#^block|${alias}]]<!--smart-ref:uuid--> tail`;
    const resolved = resolveLivePreviewSpanLink(source, source.indexOf("Prefix"), source.indexOf(alias), 0, 1);
    assert.equal(resolved?.target, "Folder/Target#^block");
    assert.equal(resolved?.refId, "uuid");
  }
});

test("Live Preview spans use complete line order when position maps before a link", () => {
  const source = "[[Target#^block|ordinary]] [[Target#^block|alias]]<!--smart-ref:uuid-->";
  assert.equal(resolveLivePreviewSpanLink(source, 0, null, 0, 2), null);
  assert.equal(resolveLivePreviewSpanLink(source, 0, null, 1, 2)?.refId, "uuid");
  assert.equal(resolveLivePreviewSpanLink(source, 0, null, 0, 1), null);
  assert.equal(resolveLivePreviewSpanLink(source, 0, null, -1, 2), null);
});

test("Live Preview ordinary links never borrow a neighboring Smart Reference", () => {
  const source = "[[Target#^block|ordinary]] [[Target#^block|alias]]<!--smart-ref:uuid-->";
  assert.equal(resolveLivePreviewSpanLink(source, 0, source.indexOf("ordinary"), 1, 2), null);
  assert.equal(resolveLivePreviewSpanLink(source, -1, null, 0, 1), null);
});


test("integration builds disable diagnostics without evaluating note-text payloads", () => {
  assert.equal(SMART_REFERENCE_DEBUG, false);
  let evaluated = false;
  debugLog(() => { evaluated = true; return ["private note text"]; });
  assert.equal(evaluated, false);
});


const setTestLivePreview = StateEffect.define<boolean>();
const testLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (value, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setTestLivePreview)) value = effect.value;
    return value;
  },
});

test("Live Preview hides both metadata formats without changing source or reference resolution", () => {
  const source = "[[Target#^block|alias]]<!--smart-ref:uuid--> %%ref:legacy%% <!--ordinary--> %%comment%% %%smart-ref:pending%%";
  const hiding = createMetadataHidingField(testLivePreviewField);
  const state = EditorState.create({ doc: source, extensions: [testLivePreviewField, hiding] });
  const hidden: string[] = [];
  state.field(hiding).between(0, state.doc.length, (from, to) => { hidden.push(state.doc.sliceString(from, to)); });
  assert.deepEqual(hidden, ["<!--smart-ref:uuid-->", "%%ref:legacy%%"]);
  assert.equal(state.doc.toString(), source);
  assert.equal(resolveLivePreviewSpanLink(state.doc.toString(), 0, source.indexOf("alias"), 0, 1)?.refId, "uuid");
});

test("metadata hiding follows Live Preview/Source switches and current edits", () => {
  const hiding = createMetadataHidingField(testLivePreviewField);
  let state = EditorState.create({ doc: "%%ref:old%%", extensions: [testLivePreviewField, hiding] });
  assert.equal(state.field(hiding).size, 1);
  state = state.update({ effects: setTestLivePreview.of(false) }).state;
  assert.equal(state.field(hiding).size, 0);
  assert.equal(state.doc.toString(), "%%ref:old%%");
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: "Before <!--smart-ref:new-->" } }).state;
  assert.equal(state.field(hiding).size, 0);
  state = state.update({ effects: setTestLivePreview.of(true) }).state;
  const offsets: number[] = [];
  state.field(hiding).between(0, state.doc.length, (from) => { offsets.push(from); });
  assert.deepEqual(offsets, [7]);
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: "<!--smart-ref:incomplete" } }).state;
  assert.equal(state.field(hiding).size, 0);
});

test("metadata replacement coexists with exact editor marks and defaults to visible without mode field", () => {
  const hiding = createMetadataHidingField(testLivePreviewField);
  const source = "chosen words <!--smart-ref:uuid-->";
  let state = EditorState.create({ doc: source, extensions: [testLivePreviewField, hiding, preciseHighlightField] });
  state = state.update({ effects: setPreciseHighlight.of({ from: 0, to: 12 }) }).state;
  assert.equal(state.field(hiding).size, 1);
  const marked: string[] = [];
  state.field(preciseHighlightField).between(0, state.doc.length, (from, to) => { marked.push(state.doc.sliceString(from, to)); });
  assert.deepEqual(marked, ["chosen words"]);
  assert.equal(EditorState.create({ doc: source, extensions: [hiding] }).field(hiding).size, 0);
});

test("Live Preview conceals only generated block anchors and Source retains them", () => {
  const source = "Paragraph ^sr-9134bc06\r\n^sr-f3f81c62\nKeep ^custom-id\nKeep ^sr-short\nKeep ^sr-9134bc060\nMiddle ^sr-9134bc06 text\n[[Target#^sr-9134bc06|alias]]";
  const hiding = createMetadataHidingField(testLivePreviewField);
  let state = EditorState.create({ doc: source, extensions: [testLivePreviewField, hiding] });
  const original = state.doc.toString();
  const hidden: string[] = [];
  state.field(hiding).between(0, state.doc.length, (from, to) => { hidden.push(state.doc.sliceString(from, to)); });
  assert.deepEqual(hidden, ["^sr-9134bc06", "^sr-f3f81c62"]);
  state = state.update({ effects: setTestLivePreview.of(false) }).state;
  assert.equal(state.field(hiding).size, 0);
  assert.equal(state.doc.toString(), original);
  state = state.update({ effects: setTestLivePreview.of(true) }).state;
  assert.equal(state.field(hiding).size, 2);
});

test("concealed anchors remain available for reference navigation and exact decoration", () => {
  const source = "Prefix chosen words suffix ^sr-9134bc06";
  const hiding = createMetadataHidingField(testLivePreviewField);
  let state = EditorState.create({ doc: source, extensions: [testLivePreviewField, hiding, preciseHighlightField] });
  const reference = makeReference({ blockId: "sr-9134bc06" });
  const link = buildSmartReferenceLink("Target.md", reference.blockId, "alias", reference.refId);
  assert.equal(resolveLivePreviewSpanLink(link, 0, link.indexOf("alias"), 0, 1)?.refId, reference.refId);
  const location = locateReference(state.doc.toString(), reference);
  assert.equal(location.kind, "exact");
  state = state.update({ effects: setPreciseHighlight.of(location.range) }).state;
  const highlighted: string[] = [];
  state.field(preciseHighlightField).between(0, state.doc.length, (from, to) => { highlighted.push(state.doc.sliceString(from, to)); });
  assert.deepEqual(highlighted, ["chosen words"]);
  assert.equal(state.field(hiding).size, 1);
  assert.equal(state.doc.toString(), source);
});

test("generated anchors use token-compatible marks and rebuild after anchor edits", () => {
  const hiding = createMetadataHidingField(testLivePreviewField);
  let state = EditorState.create({
    doc: "Text ^sr-fa1b9d4b\n%%ref:legacy%%",
    extensions: [testLivePreviewField, hiding],
  });
  const specs: Array<{ text: string; className: string | undefined }> = [];
  state.field(hiding).between(0, state.doc.length, (from, to, decoration) => {
    specs.push({ text: state.doc.sliceString(from, to), className: decoration.spec.class });
  });
  assert.deepEqual(specs, [
    { text: "^sr-fa1b9d4b", className: "smart-ref-hidden-block-id" },
    { text: "%%ref:legacy%%", className: undefined },
  ]);
  // Editing the reserved prefix reveals a normal user anchor immediately.
  state = state.update({ changes: { from: 6, to: 8, insert: "my" } }).state;
  assert.equal(state.field(hiding).size, 1);
  assert.equal(state.doc.line(1).text, "Text ^my-fa1b9d4b");
  state = state.update({ effects: setTestLivePreview.of(false) }).state;
  assert.equal(state.field(hiding).size, 0);
});

// DOM fixtures exercise Backlinks presentation without loading Obsidian.

function parseHTML(html: string) {
  const { window } = new JSDOM(html);
  return { window, document: window.document };
}

function backlinksFixture() {
  return parseHTML('<html><body><div class="backlink-pane"><div class="search-result-container"><div class="search-result-file-match"><div class="search-result-file-matched-text"><a href="Target#^block">Alias</a> %%ref:legacy%% &lt;!--smart-<span class="search-result-file-match-highlight">ref:uuid</span>--&gt; tail</div></div></div></div></body></html>');
}

function visibleSnippetText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('.smart-ref-hidden-backlink-metadata').forEach((node) => node.remove());
  return copy.textContent ?? '';
}

test("Backlinks hides split metadata and preserves text, links and event handlers", () => {
  const { document, window } = backlinksFixture();
  const snippet = document.querySelector('.search-result-file-match')!;
  const source = snippet.textContent;
  const anchor = snippet.querySelector('a')!;
  let clicks = 0;
  anchor.addEventListener('click', () => clicks++);
  assert.equal(concealBacklinkMatch(snippet), 2);
  assert.equal(visibleSnippetText(snippet), 'Alias   tail');
  assert.equal(snippet.textContent, source);
  assert.equal(snippet.querySelector('a'), anchor);
  for (const span of snippet.querySelectorAll('.smart-ref-hidden-backlink-metadata')) {
    assert.equal(window.getComputedStyle(span).display, 'none');
  }
  anchor.dispatchEvent(new window.Event('click'));
  assert.equal(clicks, 1);
  assert.equal(anchor.getAttribute('href'), 'Target#^block');
  assert.equal(concealBacklinkMatch(snippet), 0);
});

test("Backlinks cleanup excludes editors, Reading View and global search", () => {
  const { document } = parseHTML('<html><body></body></html>');
  for (const containerClass of ['cm-editor', 'markdown-preview-view', 'search-view']) {
    const container = document.createElement('div');
    container.className = containerClass;
    container.innerHTML = '<div class="search-result-file-match">%%ref:keep%%</div>';
    document.body.append(container);
    const snippet = container.firstElementChild!;
    assert.equal(concealBacklinkMatch(snippet), 0);
    assert.equal(snippet.innerHTML, '%%ref:keep%%');
  }
});

test("Backlinks preserves ordinary comments, partial markers and real DOM comments", () => {
  const { document } = backlinksFixture();
  const snippet = document.querySelector('.search-result-file-match')!;
  snippet.innerHTML = '%%comment%% %%smart-ref:pending%% &lt;!--ordinary--&gt; %%ref:partial <!--smart-ref:uuid-->';
  const before = snippet.innerHTML;
  assert.equal(concealBacklinkMatch(snippet), 0);
  assert.equal(snippet.innerHTML, before);
});

test("Backlinks observer cleans new and reused results and restores wrappers on unload", async () => {
  const { document } = backlinksFixture();
  const stop = startBacklinksCleanup(document.body);
  const snippet = document.querySelector('.search-result-file-match')!;
  assert.equal(visibleSnippetText(snippet), 'Alias   tail');
  const embedded = document.createElement('div');
  embedded.className = 'embedded-backlinks';
  embedded.innerHTML = '<div class="backlink-pane"><div class="search-result-container"><div class="search-result-file-match"><div class="search-result-file-matched-text">New %%ref:new%% end</div></div></div></div>';
  document.body.append(embedded);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(visibleSnippetText(embedded), 'New  end');
  snippet.textContent = 'Changed <!--smart-ref:changed--> end';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(visibleSnippetText(snippet), 'Changed  end');
  // Reusing a formerly hidden text node must not conceal ordinary text.
  snippet.querySelector('.smart-ref-hidden-backlink-metadata')!.firstChild!.textContent = 'ordinary';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(visibleSnippetText(snippet), 'Changed ordinary end');
  stop();
  assert.equal(document.querySelectorAll('.smart-ref-hidden-backlink-metadata').length, 0);
  assert.equal(snippet.textContent, 'Changed ordinary end');
  assert.equal(embedded.textContent, 'New %%ref:new%% end');
  snippet.textContent = '%%ref:after-unload%%';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(snippet.innerHTML, '%%ref:after-unload%%');
});

test("Backlinks row cleanup hides all reserved tokens across nested and sibling text", () => {
  const { document } = backlinksFixture();
  const row = document.querySelector('.search-result-file-match')!;
  row.innerHTML = '<span class="search-result-file-matched-text">[[Target#^sr-f3f81c62|科伊村]]</span>\n&lt;!--smart-<span>ref:e54d2638-1898-4422-b8b7-fcf864132fae</span>--&gt; %%ref:uuid%% ^sr-9134bc06 ^custom ^sr-short ^sr-9134bc060 ^sr-9134bc06-extra';
  const original = row.textContent;
  assert.equal(concealBacklinkMatch(row), 4);
  assert.equal(visibleSnippetText(row), '[[Target#|科伊村]]\n   ^custom ^sr-short ^sr-9134bc060 ^sr-9134bc06-extra');
  assert.equal(row.textContent, original);
});

test("Backlinks pane observers handle opening, delayed text, note switches and replacement", async () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const stop = startBacklinksCleanup(document.body);
  const pane = document.createElement('div');
  pane.className = 'backlink-pane';
  document.body.append(pane);
  await tick();
  pane.innerHTML = '<div class="search-result-container"><div class="search-result-file-match"><span class="search-result-file-matched-text"></span></div></div>';
  await tick();
  const text = document.createTextNode('loading');
  pane.querySelector('.search-result-file-matched-text')!.append(text);
  await tick();
  text.data = 'Note one %%ref:one%% ^sr-1234abcd';
  await tick();
  assert.equal(visibleSnippetText(pane), 'Note one  ');
  pane.innerHTML = '<div class="search-result-container"><div class="search-result-file-match"><a href="Target#^sr-1234abcd">Next note</a> &lt;!--smart-ref:two--&gt;</div></div>';
  const link = pane.querySelector('a')!;
  let navigated = false;
  link.addEventListener('click', () => { navigated = true; });
  await tick();
  assert.equal(visibleSnippetText(pane), 'Next note ');
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(navigated, true);
  assert.equal(link.getAttribute('href'), 'Target#^sr-1234abcd');
  const replacement = document.createElement('div');
  replacement.className = 'backlink-pane';
  replacement.innerHTML = '<div class="search-result-file-match">Replacement %%ref:three%%</div>';
  pane.replaceWith(replacement);
  await tick();
  assert.equal(visibleSnippetText(replacement), 'Replacement ');
  assert.equal(pane.querySelectorAll('.smart-ref-hidden-backlink-metadata').length, 0);
  stop();
  assert.equal(replacement.textContent, 'Replacement %%ref:three%%');
});
