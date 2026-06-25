import type { WebsiteAnalysisResult } from "@oem-crm/shared";
import type { WebsiteEvidenceItem } from "../website-analysis.types";

export function buildWebsiteEvidenceInventory(
  result: WebsiteAnalysisResult
): WebsiteEvidenceItem[] {
  const evidence: WebsiteEvidenceItem[] = [];

  for (const [index, page] of result.pages.entries()) {
    evidence.push({
      sourceId: `page:${index}`,
      kind: "PAGE",
      url: page.url,
      title: page.title,
      pageType: page.pageType,
      textSummary: page.textSummary,
      headings: page.headings,
      contacts: page.contacts,
      priceSignals: page.priceSignals,
      depth: page.depth,
      httpStatus: page.httpStatus,
      errorMessage: page.errorMessage
    });
  }

  for (const [index, product] of result.products.entries()) {
    evidence.push({
      sourceId: `product:${index}`,
      kind: "PRODUCT",
      name: product.name,
      category: product.category,
      description: product.description,
      keywords: product.keywords,
      evidenceUrls: product.evidenceUrls,
      priceSignals: product.priceSignals,
      confidence: product.confidence
    });
  }

  for (const [index, contact] of result.contacts.entries()) {
    evidence.push({
      sourceId: `contact:${index}`,
      kind: "CONTACT",
      type: contact.type,
      value: contact.value,
      sourceUrl: contact.sourceUrl
    });
  }

  return evidence;
}

export function buildSourceIndex(evidence: WebsiteEvidenceItem[]): Set<string> {
  return new Set(evidence.map((item) => item.sourceId));
}
