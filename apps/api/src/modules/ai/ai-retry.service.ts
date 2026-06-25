import { Injectable } from "@nestjs/common";
import { AiProviderService, AiProviderError, type AiCompletionInput } from "./ai-provider.service";
import { AiBudgetService } from "./ai-budget.service";
import { type AiErrorKind, type AiCompletionResult, isRetryableAiErrorKind, AI_GLOBAL_HARD_LIMIT_CHARS } from "./ai-generation.types";

function tryParseJson(input: string): unknown | undefined {
  try { return JSON.parse(input); } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try { return JSON.parse(match[0]); } catch { return undefined; }
  }
}

type RetryOptions = {
  maxAttempts?: number;
  jsonMode?: boolean;
};

type Attempt = {
  delayMs: number;
  repairJson: boolean;
};

const DEFAULT_ATTEMPTS: Attempt[] = [
  { delayMs: 0, repairJson: false },
  { delayMs: 1_000, repairJson: true },
  { delayMs: 3_000, repairJson: true }
];

const JSON_REPAIR_INSTRUCTION = `\n\n你的上一次回复不是合法的 JSON。请严格只输出一个 JSON 对象，不要包含任何解释、备注或代码块标记。`;

@Injectable()
export class AiRetryService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly budget: AiBudgetService
  ) {}

  async completeWithRetry(
    input: AiCompletionInput,
    options: RetryOptions = {}
  ): Promise<AiCompletionResult> {
    const attempts = DEFAULT_ATTEMPTS.slice(0, options.maxAttempts ?? DEFAULT_ATTEMPTS.length);
    // input.jsonMode is the source of truth; options can only enable JSON mode, never disable it
    const expectsJson = input.jsonMode || (options.jsonMode ?? false);
    let lastErrorKind: AiErrorKind = "UNKNOWN";
    let lastErrorMessage: string | undefined;
    let pendingRetryMs = 0;
    let actualAttempts = 0;
    let actualRetries = 0;

    // Pre-flight check: base input must be under global limit
    this.budget.assertGlobalLimit(input.user);

    for (const attempt of attempts) {
      actualAttempts++;
      if (actualAttempts > 1) actualRetries++;
      const delay = Math.max(attempt.delayMs, pendingRetryMs);
      pendingRetryMs = 0;
      if (delay > 0) {
        await sleep(delay);
      }

      try {
        const completionInput = attempt.repairJson && expectsJson
          ? { ...input, user: input.user + JSON_REPAIR_INSTRUCTION }
          : input;

        // Re-check full input (system + user + repair) before each attempt —
        // the JSON repair instruction on the 3rd attempt adds ~70 chars.
        const fullInputChars = (input.system?.length ?? 0) + completionInput.user.length;
        if (fullInputChars > AI_GLOBAL_HARD_LIMIT_CHARS) {
          throw new AiProviderError(
            `AI input exceeds global hard limit after repair (${fullInputChars} > ${AI_GLOBAL_HARD_LIMIT_CHARS} chars)`
          );
        }

        const completion = await this.aiProvider.complete(completionInput);

        if (!completion.content.trim()) {
          lastErrorKind = "EMPTY_RESPONSE";
          lastErrorMessage = "AI returned empty content";
          continue;
        }

        if (completion.finishReason === "length" || completion.finishReason === "max_tokens") {
          lastErrorKind = "OUTPUT_TRUNCATED";
          lastErrorMessage = `AI output truncated (finishReason: ${completion.finishReason})`;
          continue;
        }

        if (expectsJson) {
          if (!tryParseJson(completion.content)) {
            lastErrorKind = "INVALID_JSON";
            lastErrorMessage = "AI returned invalid JSON";
            continue;
          }
        }

        return completion;
      } catch (error) {
        const kind = normalizeAiErrorKind(error);
        lastErrorKind = kind;
        lastErrorMessage = error instanceof Error ? error.message : String(error);

        if (error instanceof AiProviderError && error.retryAfterMs && error.retryAfterMs > 0) {
          pendingRetryMs = error.retryAfterMs;
        }

        if (!isRetryableAiErrorKind(kind)) {
          break;
        }
      }
    }

    throw new AiRetryExhaustedError(lastErrorKind, lastErrorMessage, { attemptCount: actualAttempts, retryCount: actualRetries });
  }
}

export class AiRetryExhaustedError extends Error {
  public readonly errorKind: AiErrorKind;
  public readonly attemptCount: number;
  public readonly retryCount: number;

  constructor(kind: AiErrorKind, message?: string, counts?: { attemptCount: number; retryCount: number }) {
    super(message ?? `AI retry exhausted (${kind})`);
    this.name = "AiRetryExhaustedError";
    this.errorKind = kind;
    this.attemptCount = counts?.attemptCount ?? 1;
    this.retryCount = counts?.retryCount ?? 0;
  }
}

export function normalizeAiErrorKind(error: unknown): AiErrorKind {
  if (error instanceof AiProviderError) {
    if (error.statusCode === 429) return "RATE_LIMIT";
    if (error.statusCode === 401 || error.statusCode === 403) return "AUTH";
    if (error.statusCode === 413) return "INPUT_TOO_LARGE";
    if (error.statusCode && error.statusCode >= 500) return "PROVIDER_ERROR";
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("aborterror")) {
    return "TIMEOUT";
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "RATE_LIMIT";
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    (lower.includes("auth") && !lower.includes("authorization header")) ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key")
  ) {
    return "AUTH";
  }
  if (
    lower.includes("413") ||
    lower.includes("too large") ||
    lower.includes("input too long") ||
    lower.includes("context length") ||
    lower.includes("maximum context") ||
    lower.includes("token limit") ||
    lower.includes("reduce the length")
  ) {
    return "INPUT_TOO_LARGE";
  }
  if (
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("server error") ||
    lower.includes("internal server error") ||
    lower.includes("service unavailable")
  ) {
    return "PROVIDER_ERROR";
  }
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("socket") ||
    lower.includes("dns")
  ) {
    return "NETWORK";
  }
  if (
    lower.includes("empty response") ||
    lower.includes("empty content") ||
    lower.includes("returned an empty")
  ) {
    return "EMPTY_RESPONSE";
  }
  if (
    lower.includes("invalid json") ||
    lower.includes("non-json") ||
    lower.includes("not valid json") ||
    lower.includes("json parse") ||
    lower.includes("malformed json")
  ) {
    return "INVALID_JSON";
  }

  return "UNKNOWN";
}

export function withJsonRepairInstruction(input: AiCompletionInput): AiCompletionInput {
  return {
    ...input,
    user: input.user + JSON_REPAIR_INSTRUCTION
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
