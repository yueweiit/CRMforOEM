export function shouldShowWebsiteAnalysisReport(status: string | undefined, hasCrawlerData: boolean) {
  if (!status) return false;
  if (status === "SUCCEEDED") return true;
  if (status === "FAILED") return hasCrawlerData;
  return false;
}
