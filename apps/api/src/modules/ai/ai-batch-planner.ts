import { Injectable } from "@nestjs/common";
import { AI_BATCH_HARD_LIMIT_CHARS, AI_BATCH_TARGET_CHARS } from "./ai-generation.types";

export type AiBatch = {
  batchId: string;
  items: unknown[];
  inputChars: number;
};

export type AiBatchPlanOptions = {
  targetChars?: number;
  hardLimitChars?: number;
  groupName?: string;
  maxBatches?: number;
};

@Injectable()
export class AiBatchPlanner {
  plan(items: unknown[], options: AiBatchPlanOptions = {}): AiBatch[] {
    const hardLimit = options.hardLimitChars ?? AI_BATCH_HARD_LIMIT_CHARS;
    const target = options.targetChars ?? AI_BATCH_TARGET_CHARS;
    const maxBatches = options.maxBatches ?? 8;
    const groupName = options.groupName ?? "group";

    if (!items.length) return [];

    const batches: AiBatch[] = [];
    let currentItems: unknown[] = [];
    let currentChars = 0;

    for (const item of items) {
      const itemChars = JSON.stringify(item).length;

      if (itemChars > hardLimit) {
        const truncated = this.truncateItem(item, hardLimit);
        const truncatedChars = JSON.stringify(truncated).length;
        if (currentItems.length && currentChars + truncatedChars > target) {
          batches.push(this.buildBatch(batches.length, groupName, currentItems, currentChars));
          currentItems = [];
          currentChars = 0;
        }
        currentItems.push(truncated);
        currentChars += truncatedChars;
        continue;
      }

      if (currentChars + itemChars > target && currentItems.length > 0) {
        batches.push(this.buildBatch(batches.length, groupName, currentItems, currentChars));
        currentItems = [];
        currentChars = 0;
      }

      currentItems.push(item);
      currentChars += itemChars;
    }

    if (currentItems.length) {
      batches.push(this.buildBatch(batches.length, groupName, currentItems, currentChars));
    }

    while (batches.length > maxBatches) {
      const last = batches.pop()!;
      const previous = batches[batches.length - 1];
      previous.items.push(...last.items);
      previous.inputChars = JSON.stringify(previous.items).length;
    }

    // Recalculate inputChars using real serialized length (array brackets, commas add overhead)
    for (const batch of batches) {
      batch.inputChars = JSON.stringify(batch.items).length;
    }

    // Ensure every batch stays under hard limit
    for (const batch of batches) {
      while (batch.inputChars > hardLimit) {
        const perItemBudget = Math.max(40, Math.floor(hardLimit / Math.max(1, batch.items.length)));
        batch.items = batch.items.map((item) => this.truncateItem(item, perItemBudget));
        batch.inputChars = JSON.stringify(batch.items).length;

        if (batch.inputChars > hardLimit && batch.items.length > 1) {
          batch.items.pop();
          batch.inputChars = JSON.stringify(batch.items).length;
        } else if (batch.inputChars > hardLimit) {
          // Single item still too large after max truncation — replace with skeleton
          batch.items = [{ _truncated: true, _dropped: true }];
          batch.inputChars = JSON.stringify(batch.items).length;
          break;
        }
      }
    }

    return batches;
  }

  private buildBatch(index: number, groupName: string, items: unknown[], chars: number): AiBatch {
    return {
      batchId: `${groupName}:${index}`,
      items,
      inputChars: chars
    };
  }

  private truncateItem(item: unknown, limit: number): unknown {
    const json = JSON.stringify(item);
    if (json.length <= limit) return item;

    if (typeof item === "string") {
      return item.slice(0, Math.max(0, limit - 3)) + "...";
    }

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { _truncated: true, _originalLength: json.length };
    }

    const record = item as Record<string, unknown>;
    const anchorFields = new Set(["sourceId", "url", "title", "name", "type", "id"]);
    const textFields = new Set(["content", "description", "text", "summary", "body", "raw", "html"]);
    const result: Record<string, unknown> = {};

    // Copy anchor fields as-is (they're short identifiers)
    for (const key of anchorFields) {
      if (key in record) result[key] = record[key];
    }

    // Truncate long text fields — never copy them raw
    for (const key of textFields) {
      if (key in record && typeof record[key] === "string") {
        const val = record[key] as string;
        result[key] = val.length > 200 ? val.slice(0, 200) + "..." : val;
      }
    }

    // Copy other fields only if they are short scalars (numbers, booleans, short strings)
    for (const [key, value] of Object.entries(record)) {
      if (key in result) continue;
      if (key === "_truncated") continue;
      if (typeof value === "number" || typeof value === "boolean") {
        result[key] = value;
      } else if (typeof value === "string" && value.length <= 120) {
        result[key] = value;
      }
      // Skip: long strings, objects, arrays — they cause bloat
    }

    result._truncated = true;
    return result;
  }
}
