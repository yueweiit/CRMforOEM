import * as assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { AiProviderError, AiProviderService } from "./ai-provider.service";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

async function main() {
  await testDeepSeekDoesNotSendJsonResponseFormatByDefault();
  await testEmptyProviderBodyIsReportedAsEmptyResponse();
}

async function testDeepSeekDoesNotSendJsonResponseFormatByDefault() {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: "stop"
            }
          ]
        })
    } as Response;
  }) as typeof fetch;

  try {
    const svc = new AiProviderService(
      {
        get: (key: string, defaultValue?: unknown) => {
          const values: Record<string, string> = {
            OPENAI_API_KEY: "test-key",
            AI_BASE_URL: "https://api.deepseek.com/v1",
            AI_MODEL: "deepseek-v4-pro"
          };
          return key in values ? values[key] : defaultValue;
        }
      } as unknown as ConfigService
    );

    const result = await svc.complete({
      system: "return json",
      user: '{"ping":true}',
      jsonMode: true
    });

    assert.equal(result.content, '{"ok":true}');
    assert.equal(calls.length, 1);

    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
    assert.ok(!("response_format" in body), "DeepSeek should not send response_format by default");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testEmptyProviderBodyIsReportedAsEmptyResponse() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => ""
    } as Response;
  }) as typeof fetch;

  try {
    const svc = new AiProviderService(
      {
        get: (key: string, defaultValue?: unknown) => {
          const values: Record<string, string> = {
            OPENAI_API_KEY: "test-key",
            AI_BASE_URL: "https://api.deepseek.com/v1",
            AI_MODEL: "deepseek-v4-pro"
          };
          return key in values ? values[key] : defaultValue;
        }
      } as unknown as ConfigService
    );

    await assert.rejects(
      () => svc.complete({ system: "sys", user: "user", jsonMode: true }),
      (error) =>
        error instanceof AiProviderError &&
        error.message.includes("empty response")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
