import { WebsiteAnalysisResult } from "@oem-crm/shared";
import { WebsiteAnalysisCompanyProfile } from "../website-analysis.types";

export const WEBSITE_AI_INPUT_CHAR_LIMIT = 30_000;

type CappedInputOptions = {
  pageLimit: number;
  pageSummaryLimit: number;
  pageHeadingLimit: number;
  categoryLimit: number;
  categoryEvidenceLimit: number;
  categoryKeywordLimit: number;
  productLimit: number;
  productDescriptionLimit: number;
  profileProductLimit: number;
  profileProductTagLimit: number;
  capabilityLimit: number;
  contactLimit: number;
  listItemLimit: number;
  listTextLimit: number;
};

const DEFAULT_OPTIONS: CappedInputOptions = {
  pageLimit: 15,
  pageSummaryLimit: 1_200,
  pageHeadingLimit: 8,
  categoryLimit: 12,
  categoryEvidenceLimit: 3,
  categoryKeywordLimit: 8,
  productLimit: 12,
  productDescriptionLimit: 500,
  profileProductLimit: 20,
  profileProductTagLimit: 6,
  capabilityLimit: 20,
  contactLimit: 8,
  listItemLimit: 8,
  listTextLimit: 180
};

const SHRINK_STEPS: CappedInputOptions[] = [
  DEFAULT_OPTIONS,
  {
    ...DEFAULT_OPTIONS,
    pageLimit: 10,
    pageSummaryLimit: 800,
    productLimit: 8,
    profileProductLimit: 14,
    capabilityLimit: 14,
    categoryLimit: 10
  },
  {
    ...DEFAULT_OPTIONS,
    pageLimit: 6,
    pageSummaryLimit: 450,
    pageHeadingLimit: 5,
    categoryLimit: 8,
    productLimit: 5,
    productDescriptionLimit: 280,
    profileProductLimit: 8,
    capabilityLimit: 8,
    contactLimit: 5,
    listItemLimit: 5,
    listTextLimit: 120
  },
  {
    ...DEFAULT_OPTIONS,
    pageLimit: 3,
    pageSummaryLimit: 220,
    pageHeadingLimit: 3,
    categoryLimit: 5,
    categoryEvidenceLimit: 2,
    categoryKeywordLimit: 4,
    productLimit: 3,
    productDescriptionLimit: 160,
    profileProductLimit: 5,
    profileProductTagLimit: 3,
    capabilityLimit: 5,
    contactLimit: 3,
    listItemLimit: 3,
    listTextLimit: 100
  }
];

export type BoundedWebsiteAiInput = ReturnType<typeof buildBoundedWebsiteAiInput>;

export function buildBoundedWebsiteAiInput(
  result: WebsiteAnalysisResult,
  companyProfile?: WebsiteAnalysisCompanyProfile
) {
  for (const options of SHRINK_STEPS) {
    const input = buildWebsiteAiInput(result, companyProfile, options);
    if (JSON.stringify(input).length <= WEBSITE_AI_INPUT_CHAR_LIMIT) {
      return input;
    }
  }

  return buildMinimalWebsiteAiInput(result, companyProfile);
}

function buildWebsiteAiInput(
  result: WebsiteAnalysisResult,
  companyProfile: WebsiteAnalysisCompanyProfile | undefined,
  options: CappedInputOptions
) {
  const profileProducts = selectProfileProducts(companyProfile, options);
  const profileCapabilities = (companyProfile?.capabilities ?? [])
    .slice(0, options.capabilityLimit)
    .map((capability) => ({
      name: truncateText(capability.name, 120),
      category: truncateText(capability.category, 80),
      moq: truncateOptionalText(capability.moq, 80),
      leadTime: truncateOptionalText(capability.leadTime, 80)
    }));

  return {
    detectedLanguage: truncateOptionalText(result.detectedLanguage, 40),
    websiteCompleteness: result.websiteCompleteness,
    pricePositioning: truncateOptionalText(result.pricePositioning, 80),
    contacts: result.contacts.slice(0, options.contactLimit).map((contact) => ({
      type: contact.type,
      value: truncateText(contact.value, 180),
      sourceUrl: truncateOptionalText(contact.sourceUrl, 260)
    })),
    productCategories: result.productCategories.slice(0, options.categoryLimit).map((category) => ({
      name: truncateText(category.name, 120),
      productCount: category.productCount,
      evidenceUrls: category.evidenceUrls.slice(0, options.categoryEvidenceLimit).map((url) => truncateText(url, 260)),
      keywords: category.keywords.slice(0, options.categoryKeywordLimit).map((keyword) => truncateText(keyword, 80))
    })),
    products: result.products.slice(0, options.productLimit).map((product) => ({
      name: truncateText(product.name, 160),
      category: truncateOptionalText(product.category, 100),
      description: truncateOptionalText(product.description, options.productDescriptionLimit),
      keywords: product.keywords.slice(0, 6).map((keyword) => truncateText(keyword, 80)),
      evidenceUrls: product.evidenceUrls.slice(0, 3).map((url) => truncateText(url, 260)),
      priceSignals: product.priceSignals.slice(0, 4).map((signal) => truncateText(signal, 80)),
      confidence: product.confidence
    })),
    opportunities: capTextList(result.cooperationOpportunities, options.listItemLimit, options.listTextLimit),
    risks: capTextList(result.risks, options.listItemLimit, options.listTextLimit),
    priceRange: result.priceRange,
    pages: selectUsefulPages(result.pages, options.pageLimit).map((page) => ({
      url: truncateText(page.url, 260),
      pageType: page.pageType,
      title: truncateOptionalText(page.title, 160),
      headings: page.headings.slice(0, options.pageHeadingLimit).map((heading) => truncateText(heading, 120)),
      textSummary: truncateOptionalText(page.textSummary, options.pageSummaryLimit)
    })),
    ourProducts: profileProducts,
    ourCapabilities: profileCapabilities,
    ourDataQuality: {
      productCount: companyProfile?.products.length ?? 0,
      capabilityCount: companyProfile?.capabilities.length ?? 0,
      isLikelyIncomplete: (companyProfile?.products.length ?? 0) < 10
    }
  };
}

function buildMinimalWebsiteAiInput(
  result: WebsiteAnalysisResult,
  companyProfile: WebsiteAnalysisCompanyProfile | undefined
) {
  return {
    detectedLanguage: truncateOptionalText(result.detectedLanguage, 20),
    websiteCompleteness: result.websiteCompleteness,
    pricePositioning: truncateOptionalText(result.pricePositioning, 40),
    contacts: [],
    productCategories: result.productCategories.slice(0, 2).map((category) => ({
      name: truncateText(category.name, 80),
      productCount: category.productCount,
      evidenceUrls: [],
      keywords: []
    })),
    products: [],
    opportunities: capTextList(result.cooperationOpportunities, 2, 80),
    risks: capTextList(result.risks, 2, 80),
    priceRange: result.priceRange,
    pages: selectUsefulPages(result.pages, 2).map((page) => ({
      url: truncateText(page.url, 180),
      pageType: page.pageType,
      title: truncateOptionalText(page.title, 80),
      headings: [],
      textSummary: truncateOptionalText(page.textSummary, 120)
    })),
    ourProducts: [],
    ourCapabilities: [],
    ourDataQuality: {
      productCount: companyProfile?.products.length ?? 0,
      capabilityCount: companyProfile?.capabilities.length ?? 0,
      isLikelyIncomplete: (companyProfile?.products.length ?? 0) < 10
    }
  };
}

function selectUsefulPages(pages: WebsiteAnalysisResult["pages"], limit: number) {
  return pages
    .filter((page) => !page.errorMessage)
    .map((page, index) => ({ page, index, score: pageScore(page) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.page);
}

function pageScore(page: WebsiteAnalysisResult["pages"][number]) {
  const scores: Record<string, number> = {
    HOME: 100,
    PRODUCT_DETAIL: 90,
    PRODUCT_LIST: 85,
    CONTACT: 70,
    ABOUT: 65,
    BRAND: 60,
    SUPPORT: 30,
    OTHER: 10
  };
  return (scores[page.pageType] ?? 0) - page.depth;
}

function selectProfileProducts(
  companyProfile: WebsiteAnalysisCompanyProfile | undefined,
  options: CappedInputOptions
) {
  const rawProducts = (companyProfile?.products ?? []).map((product) => {
    const priceMin = product.priceMin != null ? Number(product.priceMin) : undefined;
    const priceMax = product.priceMax != null ? Number(product.priceMax) : undefined;
    return {
      name: product.name,
      category: product.category,
      material: product.material,
      priceMin: priceMin != null && Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: priceMax != null && Number.isFinite(priceMax) ? priceMax : undefined,
      currency: product.currency,
      tags: product.tags
    };
  });
  const groupedProducts = new Map<string, typeof rawProducts>();

  for (const product of rawProducts) {
    const bucket = groupedProducts.get(product.category) ?? [];
    bucket.push(product);
    groupedProducts.set(product.category, bucket);
  }

  return Array.from(groupedProducts.values())
    .flatMap((bucket) => bucket.sort((left, right) => completenessScore(right) - completenessScore(left)).slice(0, 2))
    .slice(0, options.profileProductLimit)
    .map((product) => ({
      name: truncateText(product.name, 140),
      category: truncateText(product.category, 90),
      material: truncateOptionalText(product.material, 80),
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      currency: truncateOptionalText(product.currency, 20),
      tags: product.tags.slice(0, options.profileProductTagLimit).map((tag) => truncateText(tag, 60))
    }));
}

function completenessScore(product: {
  priceMin?: number;
  priceMax?: number;
  tags: string[];
  material: string | null;
}) {
  return (
    (product.priceMin != null && product.priceMax != null ? 2 : 0) +
    (product.tags.length > 0 ? 1 : 0) +
    (product.material ? 1 : 0)
  );
}

function capTextList(items: string[], limit: number, textLimit: number) {
  return items.slice(0, limit).map((item) => truncateText(item, textLimit)).filter(Boolean);
}

function truncateOptionalText(value: string | null | undefined, limit: number) {
  return value ? truncateText(value, limit) : undefined;
}

function truncateText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 3))}...` : normalized;
}
