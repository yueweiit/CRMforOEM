import type { ResearchEvidenceGroup, ResearchEvidenceItem, ResearchGroupName } from "./research-evidence-grouper";

export type ResearchBatchGroupSummary = {
  groupName: ResearchGroupName;
  sourceIds: string[];
  itemCount: number;
  items: ResearchBatchGroupItem[];
};

export type ResearchBatchGroupItem =
  | { sourceId: string; name: string; websiteUrl?: string | null; country?: string | null }
  | { sourceId: string; url: string; pageType: string; title?: string | null; textSummary?: string | null }
  | { sourceId: string; name: string; category?: string | null; description?: string | null }
  | { sourceId: string; type: string; value: string }
  | { sourceId: string; title?: string; url?: string; snippet?: string }
  | { sourceId: string; name?: string | null; title?: string | null; email?: string | null; qualityScore?: number | null };

export type ResearchBatchAiInput = {
  groups: ResearchBatchGroupSummary[];
  customerName: string;
  promptVersion: string;
};

export function buildResearchBatchAiInput(
  groups: ResearchEvidenceGroup[],
  customerName: string
): ResearchBatchAiInput {
  const groupSummaries: ResearchBatchGroupSummary[] = groups.map((group) => ({
    groupName: group.groupName,
    sourceIds: group.sourceIds,
    itemCount: group.items.length,
    items: group.items.map(compactResearchEvidenceItem)
  }));

  return {
    groups: groupSummaries,
    customerName,
    promptVersion: "research-report-v5"
  };
}

function compactResearchEvidenceItem(item: ResearchEvidenceItem): ResearchBatchGroupItem {
  switch (item.kind) {
    case "CUSTOMER_PROFILE":
      return {
        sourceId: item.sourceId,
        name: item.name,
        websiteUrl: item.websiteUrl,
        country: item.country
      };
    case "WEBSITE_PAGE":
      return {
        sourceId: item.sourceId,
        url: item.url,
        pageType: item.pageType,
        title: item.title,
        textSummary: item.textSummary?.slice(0, 400)
      };
    case "WEBSITE_PRODUCT":
      return {
        sourceId: item.sourceId,
        name: item.name,
        category: item.category,
        description: item.description?.slice(0, 200)
      };
    case "WEBSITE_CONTACT":
      return {
        sourceId: item.sourceId,
        type: item.type,
        value: item.value
      };
    case "PUBLIC_SEARCH":
      return {
        sourceId: item.sourceId,
        title: item.title,
        url: item.url,
        snippet: item.snippet?.slice(0, 300)
      };
    case "KNOWLEDGE_PRODUCT":
    case "KNOWLEDGE_CAPABILITY":
      return {
        sourceId: item.sourceId,
        name: item.name,
        category: item.category,
        description: item.description?.slice(0, 200)
      };
    case "KNOWLEDGE_CASE_STUDY":
      return {
        sourceId: item.sourceId,
        title: item.title,
        url: undefined,
        snippet: item.summary?.slice(0, 300)
      };
    case "CRM_CONTACT":
      return {
        sourceId: item.sourceId,
        name: item.name,
        title: item.title,
        email: item.email,
        qualityScore: item.qualityScore
      };
    case "FOLLOWUP_TASK":
      return {
        sourceId: item.sourceId,
        title: item.title,
        url: undefined,
        snippet: `${item.status ?? "unknown"} ${item.type ?? ""} ${item.dueAt ?? ""}`.trim() || undefined
      };
  }
}
