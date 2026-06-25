import * as assert from "node:assert/strict";
import { AiJsonGuard } from "./ai-json-guard";

function run() {
  const guard = new AiJsonGuard();

  // parseObject: valid JSON
  const valid = guard.parseObject('{"key": "value"}');
  assert.ok(valid.ok === true, "valid JSON should be ok");
  assert.ok(valid.ok && valid.data.key === "value", "valid JSON should parse correctly");

  // parseObject: empty content
  const empty = guard.parseObject("");
  assert.ok(empty.ok === false, "empty content should not be ok");
  assert.ok(!empty.ok && empty.reason === "EMPTY_RESPONSE", "empty content reason");
  assert.ok(!empty.ok && empty.warnings.length > 0, "empty should have warnings");

  // parseObject: non-JSON
  const nonJson = guard.parseObject("hello world");
  assert.ok(nonJson.ok === false, "non-JSON should not be ok");
  assert.ok(!nonJson.ok && nonJson.reason === "INVALID_JSON", "non-JSON reason");

  // parseObject: JSON wrapped in text (extracts)
  const wrapped = guard.parseObject('some text {"key": "value"} more text');
  assert.ok(wrapped.ok === true, "should extract JSON from text");

  // parseWithFallback: valid JSON
  const fallbackResult = guard.parseWithFallback(
    '{"name": "test"}',
    { name: "fallback" },
    (record, warnings) => ({ name: String(record.name ?? "fallback") })
  );
  assert.ok(fallbackResult.ok === true, "parseWithFallback valid");
  assert.ok(fallbackResult.ok && fallbackResult.data.name === "test", "should use parsed data");

  // parseWithFallback: non-JSON returns fallback
  const fbResult = guard.parseWithFallback(
    "not json",
    { name: "fallback" },
    (record, warnings) => ({ name: String(record.name ?? "fallback") })
  );
  assert.ok(fbResult.ok === false, "parseWithFallback non-JSON not ok");
  assert.ok(!fbResult.ok && fbResult.fallback.name === "fallback", "should return fallback");

  // validateSourceIds
  const index = new Set(["page:1", "page:2", "product:1"]);
  const validation = guard.validateSourceIds(["page:1", "page:3", "product:1", "contact:1"], index);
  assert.ok(validation.valid.length === 2, "should have 2 valid sourceIds");
  assert.ok(validation.valid.includes("page:1"), "page:1 should be valid");
  assert.ok(validation.valid.includes("product:1"), "product:1 should be valid");
  assert.ok(validation.invalid.length === 2, "should have 2 invalid sourceIds");
  assert.ok(validation.invalid.includes("page:3"), "page:3 should be invalid");
  assert.ok(validation.warnings.length === 2, "should have 2 warnings");

  console.log("ai-json-guard.spec.ts OK");
}

run();
