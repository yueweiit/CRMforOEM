import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiCompletionResult } from "./ai-generation.types";

export type AiCompletionInput = {
  system: string;
  user: string;
  jsonMode?: boolean;
};

export class AiProviderError extends Error {
  public readonly statusCode?: number;
  public readonly providerCode?: string;
  public readonly retryAfterMs?: number;

  constructor(message: string, details: {
    statusCode?: number;
    providerCode?: string;
    retryAfterMs?: number;
  } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.statusCode = details.statusCode;
    this.providerCode = details.providerCode;
    this.retryAfterMs = details.retryAfterMs;
  }
}

@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService) {}

  get model() {
    return this.config.get<string>("AI_MODEL", "gpt-4.1-mini");
  }

  /** Set AI_PROVIDER_SUPPORTS_JSON_RESPONSE_FORMAT=false for non-OpenAI providers */
  private get supportsJsonResponseFormat(): boolean {
    return this.config.get<string>("AI_PROVIDER_SUPPORTS_JSON_RESPONSE_FORMAT", "true") !== "false";
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      const placeholder = input.jsonMode
        ? JSON.stringify({ summary: "AI provider not configured", recommendations: [] }, null, 2)
        : "AI provider not configured. Configure OPENAI_API_KEY or a private model adapter.";
      return {
        content: placeholder,
        raw: {
          model: this.model,
          placeholder: true,
          input
        },
        finishReason: "stop"
      };
    }

    const baseUrl = this.config.get<string>("AI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ],
          temperature: 0.3,
          ...(input.jsonMode && this.supportsJsonResponseFormat ? { response_format: { type: "json_object" } } : {})
        }),
        signal: controller.signal
      });

      const rawText = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[AiProvider] HTTP", response.status, "- body:", rawText.slice(0, 300));
        const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
        let errMsg = "AI provider request failed";
        let providerCode: string | undefined;
        try {
          const parsed = JSON.parse(rawText);
          errMsg = parsed.error?.message ?? errMsg;
          providerCode = parsed.error?.code ?? parsed.error?.type;
        } catch {}
        throw new AiProviderError(errMsg, {
          statusCode: response.status,
          providerCode,
          retryAfterMs
        });
      }

      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(rawText);
      } catch {
        throw new AiProviderError(
          `AI provider returned non-JSON response. Body: ${rawText.slice(0, 300)}`,
          { statusCode: response.status }
        );
      }

      // Try multiple paths — some providers/models return content in non-standard fields
      const choice = (raw.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      let content = (message?.content as string | undefined)?.trim();

      if (!content && typeof message?.reasoning_content === "string") {
        content = message.reasoning_content.trim();
      }

      if (!content) {
        throw new AiProviderError(
          `AI provider returned an empty response. Raw: ${rawText.slice(0, 300)}`,
          { statusCode: response.status }
        );
      }

      const finishReason =
        (choice?.finish_reason as string | undefined) ??
        (raw.finish_reason as string | undefined) ??
        undefined;

      return {
        content,
        raw,
        tokenUsage: raw.usage,
        finishReason
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error instanceof Error ? error.message : "AI provider unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return undefined;
}

