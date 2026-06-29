import { getDefaultAnalysisHistoryId, getNextAnalysisHistorySelection, sortAnalysisHistoryByCreatedAt } from "./analysis-history-state";

export function shouldShowWebsiteAnalysisReport(status: string | undefined, hasCrawlerData: boolean) {
  if (!status) return false;
  if (status === "SUCCEEDED") return true;
  if (status === "FAILED") return hasCrawlerData;
  return false;
}

export type WebsiteAnalysisStateItem = {
  id: string;
  status?: string;
  createdAt?: string;
  rawResult?: unknown;
  productCategories?: unknown[];
  pages?: Array<{ errorMessage?: string | null }>;
};

export function hasWebsiteAnalysisCrawlerData(analysis: WebsiteAnalysisStateItem | undefined) {
  if (!analysis) return false;
  const validPages = (analysis.pages ?? []).filter((page) => !page.errorMessage);
  return Boolean(analysis.rawResult) || validPages.length > 0 || (analysis.productCategories ?? []).length > 0;
}

export function sortWebsiteAnalysesByCreatedAt<T extends WebsiteAnalysisStateItem>(analyses: T[]) {
  return sortAnalysisHistoryByCreatedAt(analyses);
}

export function getDefaultWebsiteAnalysisId<T extends WebsiteAnalysisStateItem>(analyses: T[]) {
  return getDefaultAnalysisHistoryId(analyses, (analysis) =>
    shouldShowWebsiteAnalysisReport(analysis.status, hasWebsiteAnalysisCrawlerData(analysis))
  );
}

export function getNextWebsiteAnalysisSelection<T extends WebsiteAnalysisStateItem>(
  analyses: T[],
  currentSelectedId: string,
  userSelected: boolean
) {
  return getNextAnalysisHistorySelection(analyses, currentSelectedId, userSelected, (analysis) =>
    shouldShowWebsiteAnalysisReport(analysis.status, hasWebsiteAnalysisCrawlerData(analysis))
  );
}
