import { Injectable } from "@nestjs/common";
import { AI_FINAL_HARD_LIMIT_CHARS } from "./ai-generation.types";

@Injectable()
export class AiTextCompressor {
  truncateText(value: string, maxChars: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxChars) return normalized;
    if (maxChars <= 3) return normalized.slice(0, maxChars);
    return `${normalized.slice(0, maxChars - 3)}...`;
  }

  limitList<T>(list: T[], maxItems: number, score?: (item: T) => number): T[] {
    if (list.length <= maxItems) return [...list];
    if (score) {
      return list
        .map((item, index) => ({ item, index, score: score(item) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, maxItems)
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.item);
    }
    return list.slice(0, maxItems);
  }

  dedupeByKey<T>(list: T[], getKey: (item: T) => string): T[] {
    const seen = new Set<string>();
    return list.filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  compressFinalInput(
    groupSummaries: unknown[],
    budget: { targetChars?: number; hardLimitChars?: number } = {}
  ): unknown {
    const hardLimit = budget.hardLimitChars ?? AI_FINAL_HARD_LIMIT_CHARS;
    const target = budget.targetChars ?? Math.floor(hardLimit * 0.8);

    let result = groupSummaries;
    let resultRaw = JSON.stringify(result);
    if (resultRaw.length <= target) return result;

    // Phase 1: Per-group compression with decreasing budget, re-measuring each round
    const maxRounds = 4;
    for (let round = 0; round < maxRounds && resultRaw.length > hardLimit; round++) {
      const divisor = 2 * (round + 1);
      const perGroupBudget = Math.floor(hardLimit / (divisor * Math.max(1, result.length)));
      if (perGroupBudget < 60) break; // no point going tighter per-group — switch to skeleton
      result = result.map((group) =>
        this.compressGroupSummary(group as Record<string, unknown>, Math.max(80, perGroupBudget)));
      resultRaw = JSON.stringify(result);
    }

    // Phase 2: Skeleton pass — keep only anchors + minimal text per group
    if (resultRaw.length > hardLimit) {
      result = result.map((group) => this.compressToSkeleton(group));
      resultRaw = JSON.stringify(result);
    }

    // Phase 3: Still over — drop groups from the tail until under limit
    let droppedCount = 0;
    while (resultRaw.length > hardLimit && result.length > 1) {
      result.pop();
      droppedCount++;
      resultRaw = JSON.stringify(result);
    }
    if (droppedCount > 0) {
      (result as unknown as Record<string, unknown>)._droppedGroupCount = droppedCount;
    }

    // Phase 4: Single group still too large — ultra-minimal with progressive truncation
    if (resultRaw.length > hardLimit && result.length === 1) {
      const last = result[0] as Record<string, unknown>;
      const anchors = {
        sourceId: typeof last.sourceId === "string" ? last.sourceId : undefined,
        url: typeof last.url === "string" ? last.url : undefined,
        title: typeof last.title === "string" ? last.title : undefined,
      };
      let skeleton: Record<string, unknown> = { ...anchors, _truncated: true, _oversize: true };
      let skeletonRaw = JSON.stringify(skeleton);

      // If still over, progressively truncate anchor fields
      if (skeletonRaw.length > hardLimit) {
        if (anchors.url && anchors.url.length > 60) {
          anchors.url = anchors.url.slice(0, 60) + "...";
        }
        if (anchors.title && anchors.title.length > 40) {
          anchors.title = anchors.title.slice(0, 40) + "...";
        }
        if (anchors.sourceId && anchors.sourceId.length > 40) {
          anchors.sourceId = anchors.sourceId.slice(0, 40) + "...";
        }
        skeleton = { ...anchors, _truncated: true, _oversize: true };
        skeletonRaw = JSON.stringify(skeleton);
      }

      // Last resort: drop all anchors, return bare minimum
      if (skeletonRaw.length > hardLimit) {
        skeleton = { _truncated: true, _oversize: true, _note: "dropped" };
        if (JSON.stringify([skeleton]).length > hardLimit) {
          skeleton = { _truncated: true };
        }
      }

      result = [skeleton];
    }

    return result;
  }

  private compressToSkeleton(item: unknown): unknown {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { _truncated: true };
    }
    const record = item as Record<string, unknown>;
    const skeleton: Record<string, unknown> = {};
    for (const key of ["sourceId", "url", "title", "name", "type", "id"]) {
      if (key in record) skeleton[key] = record[key];
    }
    if (typeof record.summary === "string") {
      skeleton.summary = (record.summary as string).slice(0, 80) + "...";
    }
    if (Array.isArray(record.keyFacts)) {
      skeleton.keyFacts = record.keyFacts.slice(0, 2).map((f: unknown) =>
        typeof f === "string" && f.length > 120 ? f.slice(0, 120) + "..." : f
      );
    }
    skeleton._truncated = true;
    return skeleton;
  }

  private compressGroupSummary(summary: Record<string, unknown>, maxChars?: number): Record<string, unknown> {
    const textCap = maxChars ? Math.max(80, Math.floor(maxChars / 4)) : 600;
    const listCap = maxChars ? Math.max(1, Math.floor(maxChars / 2000)) : 6;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(summary)) {
      if (typeof value === "string") {
        result[key] = this.truncateText(value, textCap);
      } else if (Array.isArray(value)) {
        result[key] = this.limitList(value, listCap);
      } else if (value && typeof value === "object") {
        result[key] = this.compressGroupSummary(value as Record<string, unknown>, maxChars ? Math.floor(maxChars / 2) : undefined);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
