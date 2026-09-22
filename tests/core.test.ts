import assert from "node:assert/strict";
import test from "node:test";
import { ensureBlockId, findBlockById, findContainingBlock } from "../src/blocks.ts";
import { locateReference } from "../src/locator.ts";
import type { PreciseReference } from "../src/model.ts";
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
