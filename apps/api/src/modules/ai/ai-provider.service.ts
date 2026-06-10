import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AiCompletionInput = {
  system: string;
  user: string;
  jsonMode?: boolean;
};

@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService) {}

  get model() {
    return this.config.get<string>("AI_MODEL", "gpt-4.1-mini");
  }

  async complete(input: AiCompletionInput): Promise<{ content: string; raw: unknown; tokenUsage?: unknown }> {
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
        }
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
          temperature: 0.3
        }),
        signal: controller.signal
      });

      const rawText = await response.text().catch(() => "");
      console.error("[AiProvider] HTTP", response.status, "- body:", rawText.slice(0, 500));

      if (!response.ok) {
        let errMsg = "AI provider request failed";
        try {
          const parsed = JSON.parse(rawText);
          errMsg = parsed.error?.message ?? errMsg;
        } catch {}
        throw new ServiceUnavailableException(errMsg);
      }

      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(rawText);
      } catch {
        throw new ServiceUnavailableException(`AI provider returned non-JSON response. Body: ${rawText.slice(0, 300)}`);
      }

      // Try multiple paths — some providers/models return content in non-standard fields
      const choice = (raw.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      let content = (message?.content as string | undefined)?.trim();

      if (!content && typeof message?.reasoning_content === "string") {
        content = message.reasoning_content.trim();
      }

      if (!content) {
        throw new ServiceUnavailableException(`AI provider returned an empty response. Raw: ${rawText.slice(0, 300)}`);
      }

      return {
        content,
        raw,
        tokenUsage: raw.usage
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error instanceof Error ? error.message : "AI provider unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

