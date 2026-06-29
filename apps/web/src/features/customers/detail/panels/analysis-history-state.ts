export type AnalysisHistoryItem = {
  id: string;
  status?: string;
  createdAt?: string;
};

export function sortAnalysisHistoryByCreatedAt<T extends AnalysisHistoryItem>(items: T[]) {
  return [...items].sort((left, right) => getTime(right.createdAt) - getTime(left.createdAt));
}

export function getDefaultAnalysisHistoryId<T extends AnalysisHistoryItem>(
  items: T[],
  canShow: (item: T) => boolean
) {
  const sorted = sortAnalysisHistoryByCreatedAt(items);
  const reportable = sorted.find(canShow);
  return reportable?.id ?? sorted[0]?.id ?? "";
}

export function getNextAnalysisHistorySelection<T extends AnalysisHistoryItem>(
  items: T[],
  currentSelectedId: string,
  userSelected: boolean,
  canShow: (item: T) => boolean
) {
  const defaultId = getDefaultAnalysisHistoryId(items, canShow);
  const selectedStillExists = items.some((item) => item.id === currentSelectedId);
  if (!selectedStillExists || !currentSelectedId) return defaultId;
  if (!userSelected && currentSelectedId !== defaultId) return defaultId;
  return currentSelectedId;
}

export function getAnalysisEmptyState(hasSelectedItem: boolean, isGenerating: boolean) {
  if (hasSelectedItem) return "hidden";
  return isGenerating ? "generating" : "empty";
}

export function getAnalysisDetailLoadState(
  shouldLoadDetail: boolean,
  query: { isLoading: boolean; isFetching?: boolean; isError: boolean }
) {
  if (!shouldLoadDetail) return "idle";
  if (query.isError) return "error";
  if (query.isLoading || query.isFetching) return "loading";
  return "ready";
}

function getTime(value: string | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
