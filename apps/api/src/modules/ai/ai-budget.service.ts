import { Injectable } from "@nestjs/common";
import {
  AI_BATCH_HARD_LIMIT_CHARS,
  AI_FINAL_HARD_LIMIT_CHARS,
  AI_GLOBAL_HARD_LIMIT_CHARS,
  AI_BATCH_WARNING_CHARS,
  AI_FINAL_WARNING_CHARS
} from "./ai-generation.types";

@Injectable()
export class AiBudgetService {
  measure(input: unknown): { chars: number; estimatedTokens: number } {
    if (input === null || input === undefined) {
      return { chars: 0, estimatedTokens: 0 };
    }
    const json = typeof input === "string" ? input : JSON.stringify(input);
    return {
      chars: json.length,
      estimatedTokens: Math.ceil(json.length / 2)
    };
  }

  assertGlobalLimit(input: unknown): void {
    const { chars } = this.measure(input);
    if (chars > AI_GLOBAL_HARD_LIMIT_CHARS) {
      throw new Error(
        `AI input exceeds global hard limit (${chars} > ${AI_GLOBAL_HARD_LIMIT_CHARS} chars)`
      );
    }
  }

  isFinalInputTooLarge(input: unknown): boolean {
    const { chars } = this.measure(input);
    return chars > AI_FINAL_HARD_LIMIT_CHARS;
  }

  isBatchInputTooLarge(input: unknown): boolean {
    const { chars } = this.measure(input);
    return chars > AI_BATCH_HARD_LIMIT_CHARS;
  }

  isBatchWarning(input: unknown): boolean {
    const { chars } = this.measure(input);
    return chars > AI_BATCH_WARNING_CHARS;
  }

  isFinalWarning(input: unknown): boolean {
    const { chars } = this.measure(input);
    return chars > AI_FINAL_WARNING_CHARS;
  }
}
