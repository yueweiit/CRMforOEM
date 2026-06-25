import { Injectable } from "@nestjs/common";
import { type ParseResult } from "./ai-generation.types";

@Injectable()
export class AiJsonGuard {
  parseObject(content: string): ParseResult<Record<string, unknown>> {
    const trimmed = content.trim();
    if (!trimmed) {
      return {
        ok: false,
        reason: "EMPTY_RESPONSE",
        fallback: {},
        warnings: ["AI returned empty content"]
      };
    }

    const parsed = safeJson(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: "INVALID_JSON",
        fallback: {},
        warnings: ["AI returned invalid JSON"]
      };
    }

    return { ok: true, data: parsed as Record<string, unknown>, warnings: [] };
  }

  parseWithFallback<T>(
    content: string,
    fallback: T,
    normalize: (record: Record<string, unknown>, warnings: string[]) => T
  ): ParseResult<T> {
    const result = this.parseObject(content);
    if (!result.ok) {
      return { ok: false, reason: result.reason, fallback, warnings: result.warnings };
    }

    const warnings: string[] = [];
    const data = normalize(result.data, warnings);
    return { ok: true, data, warnings };
  }

  validateSourceIds(sourceIds: string[], sourceIndex: Set<string>): { valid: string[]; invalid: string[]; warnings: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];

    for (const id of sourceIds) {
      if (sourceIndex.has(id)) {
        valid.push(id);
      } else {
        invalid.push(id);
        warnings.push(`Source ID "${id}" not found in source index — discarded`);
      }
    }

    return { valid, invalid, warnings };
  }
}

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}
