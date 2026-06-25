import { Injectable } from "@nestjs/common";

export type BatchSummary = {
  summary: string;
  keyFacts: string[];
  risks: string[];
  opportunities: string[];
  evidencePages: Array<{ title: string; url: string; reason: string }>;
};

export type GroupSummary = {
  groupName: string;
  status: "succeeded" | "fallback";
  summary: string;
  keyFacts: string[];
  risks: string[];
  opportunities: string[];
  evidencePages: Array<{ title: string; url: string; reason: string }>;
};

@Injectable()
export class AiSummaryMerger {
  mergeBatchSummaries(
    batchSummaries: BatchSummary[],
    groupName: string,
    ruleFallback: BatchSummary
  ): GroupSummary {
    if (!batchSummaries.length) {
      return {
        groupName,
        status: "fallback",
        summary: ruleFallback.summary,
        keyFacts: ruleFallback.keyFacts,
        risks: ruleFallback.risks,
        opportunities: ruleFallback.opportunities,
        evidencePages: ruleFallback.evidencePages
      };
    }

    const summary = batchSummaries.map((b) => b.summary).filter(Boolean).join("\n");
    const keyFacts = this.dedupeAndCap(batchSummaries.flatMap((b) => b.keyFacts), 10);
    const risks = this.dedupeAndCap(batchSummaries.flatMap((b) => b.risks), 6);
    const opportunities = this.dedupeAndCap(batchSummaries.flatMap((b) => b.opportunities), 6);
    const evidencePages = batchSummaries.flatMap((b) => b.evidencePages).slice(0, 8);

    const merged = {
      groupName,
      status: "succeeded" as const,
      summary,
      keyFacts,
      risks,
      opportunities,
      evidencePages
    };

    const totalInputChars = JSON.stringify(batchSummaries).length;
    let mergedChars = JSON.stringify(merged).length;

    // Strict enforcement: output must be <= input. Trim progressively until under,
    // or until nothing more can be dropped (structural overhead floor).
    let safety = 0;
    while (mergedChars > totalInputChars && safety < 10) {
      safety++;
      if (merged.summary.length > 200) {
        merged.summary = merged.summary.slice(0, Math.floor(merged.summary.length * 0.6)) + "...";
      } else if (merged.summary.length > 80) {
        merged.summary = merged.summary.slice(0, Math.floor(merged.summary.length * 0.5)) + "...";
      } else if (merged.summary.length > 40) {
        merged.summary = merged.summary.slice(0, Math.floor(merged.summary.length * 0.5)) + "...";
      }
      if (merged.keyFacts.length > 0) merged.keyFacts = merged.keyFacts.slice(0, Math.max(0, merged.keyFacts.length - 1));
      if (merged.risks.length > 0) merged.risks = merged.risks.slice(0, Math.max(0, merged.risks.length - 1));
      if (merged.opportunities.length > 0) merged.opportunities = merged.opportunities.slice(0, Math.max(0, merged.opportunities.length - 1));
      if (merged.evidencePages.length > 0) merged.evidencePages = merged.evidencePages.slice(0, Math.max(0, merged.evidencePages.length - 1));

      const prevChars = mergedChars;
      mergedChars = JSON.stringify(merged).length;
      if (mergedChars === prevChars) break; // nothing changed — structural floor reached
    }

    // If still over, swap to minimal structure. For extremely tiny inputs the
    // GroupSummary schema itself may exceed totalInputChars — that's a physical
    // limit the caller must tolerate.
    if (mergedChars > totalInputChars) {
      merged.summary = "";
      merged.keyFacts = [];
      merged.risks = [];
      merged.opportunities = [];
      merged.evidencePages = [];
      merged.groupName = merged.groupName.length > 10
        ? merged.groupName.slice(0, 10) + "..."
        : merged.groupName;
      mergedChars = JSON.stringify(merged).length;
    }

    return merged;
  }

  private dedupeAndCap(items: string[], cap: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
      if (result.length >= cap) break;
    }
    return result;
  }
}
