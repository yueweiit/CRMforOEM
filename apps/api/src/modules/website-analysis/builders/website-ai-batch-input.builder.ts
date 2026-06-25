import type { WebsiteEvidenceGroup } from "../website-analysis.types";
import type { WebsiteAnalysisCompanyProfile } from "../website-analysis.types";

export type BatchGroupSummary = {
  groupName: string;
  sourceIds: string[];
  itemCount: number;
  items: BatchGroupItem[];
};

export type BatchGroupItem =
  | { sourceId: string; url: string; title?: string; pageType: string; textSummary?: string }
  | { sourceId: string; name: string; category?: string; description?: string }
  | { sourceId: string; type: string; value: string };

export type BatchAiInput = {
  groups: BatchGroupSummary[];
  companyProfile: {
    productCategories: string[];
    productCount: number;
    capabilityCategories: string[];
  } | null;
};

export function buildWebsiteAiBatchInput(
  groups: WebsiteEvidenceGroup[],
  companyProfile?: WebsiteAnalysisCompanyProfile
): BatchAiInput {
  const groupSummaries: BatchGroupSummary[] = groups.map((group) => ({
    groupName: group.groupName,
    sourceIds: group.sourceIds,
    itemCount: group.items.length,
    items: group.items.map((item) => {
      if (item.kind === "PAGE") return {
        sourceId: item.sourceId,
        url: item.url,
        title: item.title,
        pageType: item.pageType,
        textSummary: item.textSummary?.slice(0, 600)
      };
      if (item.kind === "PRODUCT") return {
        sourceId: item.sourceId,
        name: item.name,
        category: item.category,
        description: item.description?.slice(0, 300)
      };
      return {
        sourceId: item.sourceId,
        type: item.type,
        value: item.value
      };
    })
  }));

  return {
    groups: groupSummaries,
    companyProfile: companyProfile
      ? {
          productCategories: [...new Set(companyProfile.products.map((p) => p.category))].slice(0, 20),
          productCount: companyProfile.products.length,
          capabilityCategories: [...new Set(companyProfile.capabilities.map((c) => c.category))].slice(0, 10)
        }
      : null
  };
}
