import assert from "node:assert/strict";
import test from "node:test";
import { ensureBlockId, findBlockById, findContainingBlock } from "../src/blocks.ts";
import { locateReference } from "../src/locator.ts";
import { findSmartReferenceAtOffset, parseSmartReferenceLinks } from "../src/links.ts";
import type { PreciseReference } from "../src/model.ts";
import { resolveReferenceById } from "../src/reference-store.ts";
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
