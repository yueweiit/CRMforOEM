import * as assert from "node:assert/strict";
import { AiBudgetService } from "./ai-budget.service";

function run() {
  const svc = new AiBudgetService();

  // measure: stable char count
  const measured = svc.measure({ a: "hello" });
  assert.ok(measured.chars === JSON.stringify({ a: "hello" }).length, "chars should match JSON length");
  assert.ok(measured.estimatedTokens === Math.ceil(measured.chars / 2), "estimatedTokens should be ceil(chars/2)");

  // measure: string input
  const strMeasured = svc.measure("hello");
  assert.ok(strMeasured.chars === 5, "string input chars should match length");
  assert.ok(strMeasured.estimatedTokens === 3, "estimatedTokens ceil(5/2)=3");

  // assertGlobalLimit: under 30_000 passes
  svc.assertGlobalLimit({ x: "a".repeat(29_000) });

  // assertGlobalLimit: over 30_000 throws
  let threw = false;
  try {
    svc.assertGlobalLimit({ x: "a".repeat(30_001) });
  } catch {
    threw = true;
  }
  assert.ok(threw, "should throw when > 30_000 chars");

  // isFinalInputTooLarge: under 20_000
  assert.ok(!svc.isFinalInputTooLarge({ x: "a".repeat(19_000) }), "under 20k should not be too large");

  // isFinalInputTooLarge: over 20_000
  assert.ok(svc.isFinalInputTooLarge({ x: "a".repeat(20_001) }), "over 20k should be too large");

  // isBatchInputTooLarge: under 18_000
  assert.ok(!svc.isBatchInputTooLarge({ x: "a".repeat(17_000) }), "under 18k should not be too large");

  // isBatchInputTooLarge: over 18_000
  assert.ok(svc.isBatchInputTooLarge({ x: "a".repeat(18_001) }), "over 18k should be too large");

  // measure: null/undefined handled gracefully
  assert.ok(svc.measure(null).chars === 0, "measure(null) → 0 chars");
  assert.ok(svc.measure(undefined).chars === 0, "measure(undefined) → 0 chars");

  // measure: circular reference throws (can't be measured, shouldn't silently pass)
  let circThrew = false;
  try {
    const circular: Record<string, unknown> = {};
    (circular as Record<string, unknown>).self = circular;
    svc.measure(circular);
  } catch {
    circThrew = true;
  }
  assert.ok(circThrew, "circular reference should throw");

  console.log("ai-budget.service.spec.ts OK");
}

run();
