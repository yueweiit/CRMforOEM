// ── AI error classification ──

export type AiErrorKind =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "NETWORK"
  | "INVALID_JSON"
  | "MISSING_REQUIRED_FIELDS"
  | "EMPTY_RESPONSE"
  | "OUTPUT_TRUNCATED"
  | "INPUT_TOO_LARGE"
  | "AUTH"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

const RETRYABLE_KINDS: Set<AiErrorKind> = new Set([
  "TIMEOUT",
  "RATE_LIMIT",
  "NETWORK",
  "PROVIDER_ERROR",
  "EMPTY_RESPONSE",
  "INVALID_JSON",
  "OUTPUT_TRUNCATED"
]);

export function isRetryableAiErrorKind(kind: AiErrorKind): boolean {
  return RETRYABLE_KINDS.has(kind);
}

// ── AI generation mode & status ──

export type AiGenerationMode = "DIRECT" | "BATCH_SUMMARY" | "FALLBACK" | "SKIPPED";

export type AiGenerationStatus = "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";

export type AiGenerationMeta = {
  mode: AiGenerationMode;
  status: AiGenerationStatus;
  inputChars: number;
  estimatedInputTokens?: number;
  attemptCount: number;
  retryCount: number;
  durationMs?: number;
  errorKind?: AiErrorKind;
  errorMessage?: string;
};

// ── Parse result ──

export type ParseResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; fallback: T; reason: AiErrorKind | string; warnings: string[] };

// ── Summary pipeline metadata ──

export type SummaryPipelineGroupStatus =
  | "succeeded"
  | "partial_succeeded"
  | "fallback"
  | "failed"
  | "skipped";

export type SummaryPipelineMeta = {
  status: SummaryPipelineGroupStatus;
  mode: AiGenerationMode;
  inputChars: number;
  finalInputChars?: number;
  attemptCount: number;
  retryCount: number;
  groups: Record<
    string,
    {
      status: SummaryPipelineGroupStatus;
      batchCount: number;
      failedBatchCount: number;
      sourceCount: number;
    }
  >;
  errors: Array<{
    scope: "provider" | "parser" | "batch" | "group" | "final";
    groupName?: string;
    batchId?: string;
    errorKind: AiErrorKind;
    message: string;
  }>;
};

// ── Budget constants ──

export const AI_BATCH_TARGET_CHARS = 12_000;
export const AI_BATCH_WARNING_CHARS = 14_000;
export const AI_BATCH_HARD_LIMIT_CHARS = 18_000;
export const AI_FINAL_TARGET_CHARS = 16_000;
export const AI_FINAL_WARNING_CHARS = 18_000;
export const AI_FINAL_HARD_LIMIT_CHARS = 20_000;
export const AI_GLOBAL_HARD_LIMIT_CHARS = 30_000;

// ── AI completion result ──

export type AiCompletionResult = {
  content: string;
  raw: unknown;
  tokenUsage?: unknown;
  finishReason?: string;
};
