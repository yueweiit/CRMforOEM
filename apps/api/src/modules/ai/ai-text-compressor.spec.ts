import * as assert from "node:assert/strict";
import { AiTextCompressor } from "./ai-text-compressor";

function run() {
  const compressor = new AiTextCompressor();

  // truncateText: under limit
  assert.ok(compressor.truncateText("hello", 10) === "hello", "short text unchanged");
  assert.ok(compressor.truncateText("  hello world  ", 20) === "hello world", "whitespace normalized");

  // truncateText: over limit
  const truncated = compressor.truncateText("hello world this is a long text", 15);
  assert.ok(truncated.length <= 15, "truncated within limit");
  assert.ok(truncated.endsWith("..."), "truncated ends with ...");

  // truncateText: very short limit
  assert.ok(compressor.truncateText("hello", 3).length === 3, "very short limit");

  // limitList: under max
  const shortList = [1, 2, 3];
  assert.ok(compressor.limitList(shortList, 5).length === 3, "short list unchanged");

  // limitList: over max (with custom identity)
  const longList = [5, 1, 4, 2, 3];
  assert.ok(compressor.limitList(longList, 3).length === 3, "limited to 3 items");
  assert.ok(compressor.limitList(longList, 3)[0] === 5, "first in first out for no score fn");

  // limitList: with score
  const scored = compressor.limitList(longList, 3, (item) => item);
  assert.ok(scored.includes(5), "high score items kept");
  assert.ok(scored.includes(4), "high score items kept");
  assert.ok(scored.length === 3, "scored limited to 3");

  // dedupeByKey
  const dupes = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];
  const deduped = compressor.dedupeByKey(dupes, (item) => item.id);
  assert.ok(deduped.length === 3, "duplicates removed");
  assert.ok(deduped[0].id === "a", "first occurrence kept");

  // compressFinalInput: small input unchanged
  const smallSummaries = [{ a: "small" }];
  const smallResult = compressor.compressFinalInput(smallSummaries);
  assert.ok(JSON.stringify(smallResult) === JSON.stringify(smallSummaries), "small input unchanged");

  // compressFinalInput: large input compressed
  const largeSummaries = Array.from({ length: 20 }, (_, i) => ({
    summary: `This is summary number ${i} with some long text `.repeat(50)
  }));
  const largeResult = compressor.compressFinalInput(largeSummaries, { hardLimitChars: 5000 });
  const resultJson = JSON.stringify(largeResult);
  assert.ok(resultJson.length <= 5000, `large input compressed to ${resultJson.length} <= 5000 chars`);

  // compressFinalInput: many groups → skeleton phase + group dropping
  const manyGroups = Array.from({ length: 100 }, (_, i) => ({
    sourceId: `group:${i}`,
    title: `Group ${i}`,
    summary: `This is a long summary for group ${i} `.repeat(30),
    keyFacts: Array.from({ length: 5 }, (_, j) => `Fact ${i}-${j}: some long detail here `.repeat(10)),
    risks: ["risk a ".repeat(20), "risk b ".repeat(20)]
  }));
  const manyResult = compressor.compressFinalInput(manyGroups, { hardLimitChars: 5000 });
  const manyJson = JSON.stringify(manyResult);
  assert.ok(manyJson.length <= 5000,
    `100 groups compressed to ${manyJson.length} <= 5000 chars`);

  // compressFinalInput: ultra-tight limit — skeleton with dropped groups
  const tightMany = compressor.compressFinalInput(manyGroups, { hardLimitChars: 500 });
  const tightJson = JSON.stringify(tightMany);
  assert.ok(tightJson.length <= 500,
    `ultra-tight limit: ${tightJson.length} <= 500 chars`);
  const tightArr = tightMany as unknown[];
  for (const item of tightArr) {
    const rec = item as Record<string, unknown>;
    assert.ok(rec._truncated === true || rec._oversize === true, "tight items marked as truncated/oversize");
  }

  // compressFinalInput: single group too large → ultra-minimal fallback
  const singleHuge = [{
    sourceId: "solo",
    title: "Solo Group",
    summary: "x".repeat(10_000),
    keyFacts: Array.from({ length: 100 }, (_, i) => `fact ${i}: ${"data ".repeat(50)}`)
  }];
  const singleResult = compressor.compressFinalInput(singleHuge, { hardLimitChars: 100 });
  const singleJson = JSON.stringify(singleResult);
  assert.ok(singleJson.length <= 100,
    `single huge group compressed to ${singleJson.length} <= 100 chars`);

  // compressFinalInput: single group too large with long URL → progressive anchor truncation
  const singleLongUrl = [{
    sourceId: "page:very-long-identifier-that-could-cause-issues",
    url: "https://example.com/very/long/path/that/exceeds/the/limit/and/needs/truncation/in/phase/four",
    title: "A Very Long Title That Also Exceeds the Reasonable Limit For Anchor Fields",
    summary: "x".repeat(10_000)
  }];
  const longUrlResult = compressor.compressFinalInput(singleLongUrl, { hardLimitChars: 100 });
  const longUrlJson = JSON.stringify(longUrlResult);
  assert.ok(longUrlJson.length <= 100,
    `long URL anchors compressed to ${longUrlJson.length} <= 100 chars`);

  console.log("ai-text-compressor.spec.ts OK");
}

run();
