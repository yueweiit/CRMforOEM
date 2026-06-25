import * as assert from "node:assert/strict";
import { AiBatchPlanner } from "./ai-batch-planner";

function run() {
  const planner = new AiBatchPlanner();

  // plan: empty
  assert.ok(planner.plan([]).length === 0, "empty items → empty batches");

  // plan: single item
  const single = planner.plan([{ a: 1 }]);
  assert.ok(single.length === 1, "single item → one batch");
  assert.ok(single[0].batchId === "group:0", "batch id format");
  assert.ok(single[0].items.length === 1, "one item in batch");

  // plan: items fit in one batch
  const smallItems = [
    { name: "a".repeat(100) },
    { name: "b".repeat(100) },
    { name: "c".repeat(100) }
  ];
  const smallBatches = planner.plan(smallItems);
  assert.ok(smallBatches.length === 1, "3 small items → one batch");

  // plan: items split across batches
  const largeItems = Array.from({ length: 50 }, (_, i) => ({
    name: `item-${i}`,
    description: "x".repeat(500)
  }));
  const batches = planner.plan(largeItems, { targetChars: 3000, groupName: "test" });
  assert.ok(batches.length > 1, "50 large items → multiple batches");

  // plan: each batch under hard limit
  for (const batch of batches) {
    assert.ok(batch.inputChars <= 18_000, `batch ${batch.batchId} inputChars ${batch.inputChars} <= 18_000`);
  }

  // plan: maxBatches respected
  const maxBatches = planner.plan(largeItems, { targetChars: 2000, maxBatches: 3, groupName: "capped" });
  assert.ok(maxBatches.length <= 3, `batches ${maxBatches.length} <= 3`);

  // plan: merged batch stays under hard limit
  for (const batch of maxBatches) {
    assert.ok(batch.inputChars <= 18_000, `merged batch ${batch.batchId} inputChars ${batch.inputChars} <= 18_000`);
  }

  // plan: oversized item preserves anchor fields, drops unknown long fields
  const hugeItem = {
    sourceId: "page:42",
    url: "https://example.com/page",
    title: "Example Page",
    type: "webpage",
    description: "x".repeat(25_000),
    unknownLongField: "y".repeat(10_000),
    shortScalar: "hello",
    count: 42,
    nestedObject: { big: "z".repeat(5_000) }
  };
  const hugePlan = planner.plan([hugeItem], { targetChars: 5000 });
  assert.ok(hugePlan.length === 1, "single huge item → one batch");
  const truncatedItem = hugePlan[0].items[0] as Record<string, unknown>;
  assert.ok(truncatedItem.sourceId === "page:42", "sourceId preserved");
  assert.ok(truncatedItem.url === "https://example.com/page", "url preserved");
  assert.ok(truncatedItem.title === "Example Page", "title preserved");
  assert.ok(truncatedItem.type === "webpage", "type preserved");
  assert.ok(truncatedItem.count === 42, "number scalar preserved");
  assert.ok(truncatedItem.shortScalar === "hello", "short string preserved");
  assert.ok(truncatedItem._truncated === true, "_truncated flag set");
  assert.ok(!("nestedObject" in truncatedItem), "nested object dropped");
  assert.ok(!("unknownLongField" in truncatedItem), "unknown long field dropped");

  // plan: tight hardLimit enforced (single string item)
  const tightPlan = planner.plan(["x".repeat(200)], { hardLimitChars: 100, targetChars: 80 });
  assert.ok(tightPlan.length > 0, "tight plan has batches");
  for (const batch of tightPlan) {
    assert.ok(batch.inputChars <= 100, `tight batch ${batch.batchId} inputChars ${batch.inputChars} <= 100`);
  }

  // plan: tight hardLimit enforced (object with unknown long fields)
  const tightObjPlan = planner.plan([{
    sourceId: "a",
    giantField: "x".repeat(5000)
  }], { hardLimitChars: 100, targetChars: 80 });
  assert.ok(tightObjPlan.length > 0, "tight obj plan has batches");
  for (const batch of tightObjPlan) {
    assert.ok(batch.inputChars <= 100, `tight obj batch ${batch.batchId} inputChars ${batch.inputChars} <= 100`);
  }

  // plan: inputChars recalculated as real serialized length (not sum of individual items)
  const recalItems = [
    { id: "a", text: "hello" },
    { id: "b", text: "world" }
  ];
  const recalPlan = planner.plan(recalItems, { targetChars: 500 });
  for (const batch of recalPlan) {
    const realChars = JSON.stringify(batch.items).length;
    assert.ok(batch.inputChars === realChars,
      `inputChars ${batch.inputChars} matches real serialized length ${realChars}`);
  }

  console.log("ai-batch-planner.spec.ts OK");
}

run();
