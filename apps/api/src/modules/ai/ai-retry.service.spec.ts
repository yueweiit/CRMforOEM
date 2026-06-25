import * as assert from "node:assert/strict";
import { AiRetryService, normalizeAiErrorKind, AiRetryExhaustedError, withJsonRepairInstruction } from "./ai-retry.service";
import { AiProviderService, AiProviderError, type AiCompletionInput } from "./ai-provider.service";
import { AiBudgetService } from "./ai-budget.service";
import type { AiCompletionResult } from "./ai-generation.types";

// ── Fake provider: returns pre-configured responses in sequence ──

type FakeResponse = AiCompletionResult | Error;

class FakeAiProvider {
  callCount = 0;
  lastInput: AiCompletionInput | null = null;

  constructor(private responses: FakeResponse[]) {}

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    this.lastInput = input;
    const response = this.responses[this.callCount] ?? this.responses[this.responses.length - 1];
    this.callCount++;
    if (response instanceof Error) throw response;
    return response;
  }
}

function ok(content: string, finishReason?: string): AiCompletionResult {
  return { content, raw: { choices: [{ message: { content }, finish_reason: finishReason ?? "stop" }] }, finishReason };
}

async function run() {
  const budget = new AiBudgetService();

  // ═══════════════════════════════════════════════════
  // normalizeAiErrorKind: TIMEOUT
  // ═══════════════════════════════════════════════════
  assert.ok(normalizeAiErrorKind(new Error("The operation was aborted")) === "TIMEOUT", "abort → TIMEOUT");
  assert.ok(normalizeAiErrorKind(new Error("Request timeout")) === "TIMEOUT", "timeout → TIMEOUT");
  assert.ok(normalizeAiErrorKind(new Error("AbortError: signal was aborted")) === "TIMEOUT", "AbortError → TIMEOUT");

  // normalizeAiErrorKind: RATE_LIMIT
  assert.ok(normalizeAiErrorKind(new Error("429 Too Many Requests")) === "RATE_LIMIT", "429 → RATE_LIMIT");
  assert.ok(normalizeAiErrorKind(new Error("rate limit exceeded")) === "RATE_LIMIT", "rate limit → RATE_LIMIT");

  // normalizeAiErrorKind: AUTH
  assert.ok(normalizeAiErrorKind(new Error("401 Unauthorized")) === "AUTH", "401 → AUTH");
  assert.ok(normalizeAiErrorKind(new Error("Invalid API key")) === "AUTH", "invalid api key → AUTH");
  assert.ok(normalizeAiErrorKind(new Error("Incorrect API key provided")) === "AUTH", "incorrect key → AUTH");

  // normalizeAiErrorKind: INPUT_TOO_LARGE
  assert.ok(normalizeAiErrorKind(new Error("413 Request Entity Too Large")) === "INPUT_TOO_LARGE", "413 → INPUT_TOO_LARGE");
  assert.ok(normalizeAiErrorKind(new Error("context length exceeded")) === "INPUT_TOO_LARGE", "context length → INPUT_TOO_LARGE");
  assert.ok(normalizeAiErrorKind(new Error("maximum context length")) === "INPUT_TOO_LARGE", "max context → INPUT_TOO_LARGE");

  // normalizeAiErrorKind: PROVIDER_ERROR
  assert.ok(normalizeAiErrorKind(new Error("500 Internal Server Error")) === "PROVIDER_ERROR", "500 → PROVIDER_ERROR");
  assert.ok(normalizeAiErrorKind(new Error("503 Service Unavailable")) === "PROVIDER_ERROR", "503 → PROVIDER_ERROR");

  // normalizeAiErrorKind: NETWORK
  assert.ok(normalizeAiErrorKind(new Error("fetch failed")) === "NETWORK", "fetch → NETWORK");
  assert.ok(normalizeAiErrorKind(new Error("ECONNREFUSED")) === "NETWORK", "ECONNREFUSED → NETWORK");

  // normalizeAiErrorKind: EMPTY_RESPONSE
  assert.ok(normalizeAiErrorKind(new Error("empty response from AI")) === "EMPTY_RESPONSE", "empty response → EMPTY_RESPONSE");
  assert.ok(normalizeAiErrorKind(new Error("AI provider returned an empty")) === "EMPTY_RESPONSE", "returned an empty → EMPTY_RESPONSE");

  // normalizeAiErrorKind: INVALID_JSON
  assert.ok(normalizeAiErrorKind(new Error("invalid json format")) === "INVALID_JSON", "invalid json → INVALID_JSON");
  assert.ok(normalizeAiErrorKind(new Error("response is non-json")) === "INVALID_JSON", "non-json → INVALID_JSON");

  // normalizeAiErrorKind: UNKNOWN
  assert.ok(normalizeAiErrorKind(new Error("something unexpected")) === "UNKNOWN", "unknown → UNKNOWN");
  assert.ok(normalizeAiErrorKind("just a string") === "UNKNOWN", "plain string → UNKNOWN");

  // AiRetryExhaustedError
  const exhausted = new AiRetryExhaustedError("TIMEOUT", "timed out after 3 attempts");
  assert.ok(exhausted.errorKind === "TIMEOUT", "AiRetryExhaustedError should carry errorKind");
  assert.ok(exhausted.name === "AiRetryExhaustedError", "should have custom name");
  assert.ok(exhausted.message.includes("timed out"), "should preserve message");

  // normalizeAiErrorKind: AiProviderError structured fields take priority
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("rate limited", { statusCode: 429 })) === "RATE_LIMIT",
    "AiProviderError 429 → RATE_LIMIT"
  );
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("unauthorized", { statusCode: 401 })) === "AUTH",
    "AiProviderError 401 → AUTH"
  );
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("forbidden", { statusCode: 403 })) === "AUTH",
    "AiProviderError 403 → AUTH"
  );
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("too large", { statusCode: 413 })) === "INPUT_TOO_LARGE",
    "AiProviderError 413 → INPUT_TOO_LARGE"
  );
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("server error", { statusCode: 500 })) === "PROVIDER_ERROR",
    "AiProviderError 500 → PROVIDER_ERROR"
  );
  assert.ok(
    normalizeAiErrorKind(new AiProviderError("bad gateway", { statusCode: 502 })) === "PROVIDER_ERROR",
    "AiProviderError 502 → PROVIDER_ERROR"
  );

  // AiProviderError carries retryAfterMs
  const retryErr = new AiProviderError("rate limited", { statusCode: 429, retryAfterMs: 5000 });
  assert.ok(retryErr.retryAfterMs === 5000, "AiProviderError should carry retryAfterMs");
  assert.ok(retryErr.statusCode === 429, "AiProviderError should carry statusCode");

  // withJsonRepairInstruction
  const input = { system: "sys", user: "hello", jsonMode: true };
  const repaired = withJsonRepairInstruction(input);
  assert.ok(repaired.user.includes("hello"), "should keep original user");
  assert.ok(repaired.user.includes("合法的 JSON"), "should add JSON repair instruction");

  // ═══════════════════════════════════════════════════
  // completeWithRetry: fake provider integration tests
  // ═══════════════════════════════════════════════════

  // 1. Success on first attempt
  {
    const fake = new FakeAiProvider([ok("hello world")]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const result = await svc.completeWithRetry({ system: "sys", user: "test" });
    assert.ok(result.content === "hello world", "completeWithRetry: first attempt success");
    assert.ok(fake.callCount === 1, "only one call made");
  }

  // 2. First timeout, second succeeds (retry works)
  {
    const fake = new FakeAiProvider([
      new Error("The operation was aborted"),
      ok("retry success")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const result = await svc.completeWithRetry({ system: "sys", user: "test" });
    assert.ok(result.content === "retry success", "completeWithRetry: retry after timeout succeeds");
    assert.ok(fake.callCount === 2, "two calls made");
  }

  // 3. AUTH errors do NOT retry (non-retryable kind)
  {
    const fake = new FakeAiProvider([
      new AiProviderError("Invalid API key", { statusCode: 401 }),
      ok("should not reach this")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    try {
      await svc.completeWithRetry({ system: "sys", user: "test" });
      assert.ok(false, "AUTH should throw");
    } catch (err) {
      assert.ok(err instanceof AiRetryExhaustedError, "AUTH → AiRetryExhaustedError");
      assert.ok((err as AiRetryExhaustedError).errorKind === "AUTH", "AUTH errorKind preserved");
      assert.ok(fake.callCount === 1, "AUTH: only one call, no retry");
    }
  }

  // 4. 429 RATE_LIMIT with Retry-After header — respects server delay
  {
    const retryAfterMs = 50;
    const fake = new FakeAiProvider([
      new AiProviderError("rate limited", { statusCode: 429, retryAfterMs }),
      ok("success after rate limit")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const t0 = Date.now();
    const result = await svc.completeWithRetry({ system: "sys", user: "test" });
    const elapsed = Date.now() - t0;
    assert.ok(result.content === "success after rate limit", "429 retry succeeds");
    assert.ok(elapsed >= retryAfterMs - 10, `429 retry respected retryAfterMs (elapsed: ${elapsed}ms >= ${retryAfterMs}ms)`);
    assert.ok(fake.callCount === 2, "two calls for 429 retry");
  }

  // 5. Empty content retries (EMPTY_RESPONSE is retryable)
  {
    const fake = new FakeAiProvider([
      ok("   "),        // whitespace → empty after trim
      ok("real content")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const result = await svc.completeWithRetry({ system: "sys", user: "test" });
    assert.ok(result.content === "real content", "empty content → retry succeeds");
    assert.ok(fake.callCount === 2, "two calls: empty content retried");
  }

  // 6. Non-JSON response when jsonMode is on → retries with repair on 3rd attempt
  {
    const fake = new FakeAiProvider([
      ok("not valid json"),
      ok("still not json {{{"),
      ok('{"valid": true}')
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const result = await svc.completeWithRetry({ system: "sys", user: "test", jsonMode: true });
    assert.ok(result.content === '{"valid": true}', "invalid JSON → retry with repair succeeds");
    assert.ok(fake.callCount === 3, "three calls: JSON repair on 3rd attempt");
    // 3rd attempt should have JSON repair instruction
    assert.ok(fake.lastInput?.user.includes("合法的 JSON"), "3rd attempt includes JSON repair instruction");
  }

  // 7. finishReason="length" → retries (OUTPUT_TRUNCATED is retryable)
  {
    const fake = new FakeAiProvider([
      ok("truncated output here", "length"),
      ok("full complete output")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    const result = await svc.completeWithRetry({ system: "sys", user: "test" });
    assert.ok(result.content === "full complete output", "OUTPUT_TRUNCATED → retry succeeds");
    assert.ok(fake.callCount === 2, "two calls for OUTPUT_TRUNCATED retry");
  }

  // 8. INPUT_TOO_LARGE does NOT retry (non-retryable kind)
  {
    const fake = new FakeAiProvider([
      new AiProviderError("too large", { statusCode: 413 }),
      ok("should not reach")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    try {
      await svc.completeWithRetry({ system: "sys", user: "test" });
      assert.ok(false, "INPUT_TOO_LARGE should throw");
    } catch (err) {
      assert.ok(err instanceof AiRetryExhaustedError, "INPUT_TOO_LARGE → AiRetryExhaustedError");
      assert.ok((err as AiRetryExhaustedError).errorKind === "INPUT_TOO_LARGE", "INPUT_TOO_LARGE errorKind preserved");
      assert.ok(fake.callCount === 1, "INPUT_TOO_LARGE: no retry");
    }
  }

  // 9. All 3 attempts fail → AiRetryExhaustedError thrown
  {
    const fake = new FakeAiProvider([
      new Error("fetch failed"),
      new Error("network error"),
      new Error("ECONNREFUSED")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    try {
      await svc.completeWithRetry({ system: "sys", user: "test" });
      assert.ok(false, "exhausted retries should throw");
    } catch (err) {
      assert.ok(err instanceof AiRetryExhaustedError, "3 failures → AiRetryExhaustedError");
      assert.ok((err as AiRetryExhaustedError).errorKind === "NETWORK", "last errorKind preserved");
      assert.ok(fake.callCount === 3, "all three attempts tried");
    }
  }

  // 10. options.jsonMode cannot override input.jsonMode=false (only adds, never removes)
  {
    const fake = new FakeAiProvider([
      ok("not json but input says no jsonMode so it passes")
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    // input.jsonMode is not set; options.jsonMode is also not set → no JSON validation
    const result = await svc.completeWithRetry({ system: "sys", user: "not json" });
    assert.ok(result.content === "not json but input says no jsonMode so it passes",
      "no jsonMode → non-JSON content passes through");
    assert.ok(fake.callCount === 1, "one call, no retry needed");
  }

  // 11. Global limit enforcement: input.user > 30_000 chars throws immediately
  {
    const fake = new FakeAiProvider([ok("never called")]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    try {
      await svc.completeWithRetry({ system: "sys", user: "x".repeat(30_001) });
      assert.ok(false, "over limit should throw");
    } catch (err) {
      assert.ok(err instanceof Error && (err as Error).message.includes("exceeds"),
        "global limit enforced at entry");
      assert.ok(fake.callCount === 0, "provider never called when over global limit");
    }
  }

  // 12. jsonMode passed through to provider correctly (input, not options)
  {
    const fake = new FakeAiProvider([
      ok('{"key": "value"}')
    ]);
    const svc = new AiRetryService(fake as unknown as AiProviderService, budget);
    await svc.completeWithRetry({ system: "sys", user: "test", jsonMode: true });
    assert.ok(fake.lastInput?.jsonMode === true, "jsonMode=true passed through to provider");
    assert.ok(fake.callCount === 1, "one call for valid JSON response");
  }

  console.log("ai-retry.service.spec.ts OK");
}

run();
