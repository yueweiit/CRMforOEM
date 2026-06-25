import type { ResearchContextLike } from "./research-context-builder";

// ── Research evidence types ──

export type ResearchEvidenceKind =
  | "CUSTOMER_PROFILE"
  | "WEBSITE_PAGE"
  | "WEBSITE_PRODUCT"
  | "WEBSITE_CONTACT"
  | "PUBLIC_SEARCH"
  | "KNOWLEDGE_PRODUCT"
  | "KNOWLEDGE_CAPABILITY"
  | "KNOWLEDGE_CASE_STUDY"
  | "CRM_CONTACT"
  | "FOLLOWUP_TASK";

export type ResearchEvidenceItem =
  | { sourceId: string; kind: "CUSTOMER_PROFILE"; name: string; websiteUrl?: string | null; country?: string | null; language?: string | null; typeName?: string | null }
  | { sourceId: string; kind: "WEBSITE_PAGE"; url: string; pageType: string; title?: string | null; textSummary?: string | null }
  | { sourceId: string; kind: "WEBSITE_PRODUCT"; name: string; category?: string | null; description?: string | null; keywords?: string[] | null }
  | { sourceId: string; kind: "WEBSITE_CONTACT"; type: string; value: string; sourceUrl?: string | null }
  | { sourceId: string; kind: "PUBLIC_SEARCH"; title?: string; url?: string; snippet?: string }
  | { sourceId: string; kind: "KNOWLEDGE_PRODUCT"; name: string; category?: string | null; description?: string | null; tags?: string[] }
  | { sourceId: string; kind: "KNOWLEDGE_CAPABILITY"; name: string; category?: string | null; description?: string | null }
  | { sourceId: string; kind: "KNOWLEDGE_CASE_STUDY"; title: string; market?: string | null; category?: string | null; summary?: string | null }
  | { sourceId: string; kind: "CRM_CONTACT"; name?: string | null; title?: string | null; email?: string | null; qualityScore?: number | null }
  | { sourceId: string; kind: "FOLLOWUP_TASK"; title: string; status?: string; dueAt?: string; type?: string };

// ── Research groups ──

export type ResearchGroupName =
  | "customer_profile"
  | "website_summary"
  | "public_search"
  | "product_fit"
  | "contact_signals"
  | "risks"
  | "opportunities"
  | "followup_context";

export type ResearchEvidenceGroup = {
  groupName: ResearchGroupName;
  items: ResearchEvidenceItem[];
  sourceIds: string[];
};

const ALL_RESEARCH_GROUP_NAMES: ResearchGroupName[] = [
  "customer_profile",
  "website_summary",
  "public_search",
  "product_fit",
  "contact_signals",
  "risks",
  "opportunities",
  "followup_context"
];

// ── Evidence inventory builder ──

export function buildResearchEvidenceInventory(context: ResearchContextLike): ResearchEvidenceItem[] {
  const evidence: ResearchEvidenceItem[] = [];

  // Customer profile
  evidence.push({
    sourceId: "customer:main",
    kind: "CUSTOMER_PROFILE",
    name: context.customer.name,
    websiteUrl: context.customer.websiteUrl,
    country: context.customer.country,
    language: context.customer.language,
    typeName: context.customer.typeName
  });

  // Website pages
  if (context.websiteSummary?.pages) {
    for (const [index, page] of context.websiteSummary.pages.entries()) {
      evidence.push({
        sourceId: `website:page:${index}`,
        kind: "WEBSITE_PAGE",
        url: page.url,
        pageType: page.pageType,
        title: page.title,
        textSummary: page.textSummary
      });
    }
  }

  // Website products (from websiteAnalysis.products if available)
  const websiteProducts = asArray((context.websiteSummary as Record<string, unknown> | null)?.["products"]);
  for (const [index, product] of websiteProducts.entries()) {
    const item = asRecord(product);
    evidence.push({
      sourceId: `website:product:${index}`,
      kind: "WEBSITE_PRODUCT",
      name: asText(item.name) || `产品 ${index + 1}`,
      category: item.category as string | null | undefined,
      description: item.description as string | null | undefined,
      keywords: item.keywords as string[] | null | undefined
    });
  }

  // Website contacts (from websiteAnalysis if available)
  const contacts = asArray((context.websiteSummary as Record<string, unknown> | null)?.["contacts"]);
  for (const [index, contact] of contacts.entries()) {
    const item = asRecord(contact);
    evidence.push({
      sourceId: `website:contact:${index}`,
      kind: "WEBSITE_CONTACT",
      type: asText(item.type) || "unknown",
      value: asText(item.value) || "",
      sourceUrl: item.sourceUrl as string | null | undefined
    });
  }

  // Public search results
  if (context.publicSearch.results) {
    for (const [index, result] of context.publicSearch.results.entries()) {
      evidence.push({
        sourceId: `search:${index}`,
        kind: "PUBLIC_SEARCH",
        title: result.title,
        url: result.url,
        snippet: result.snippet
      });
    }
  }

  // Company knowledge products
  if (context.companyKnowledge?.products) {
    for (const [index, product] of context.companyKnowledge.products.entries()) {
      evidence.push({
        sourceId: `knowledge:product:${index}`,
        kind: "KNOWLEDGE_PRODUCT",
        name: product.name,
        category: product.category,
        description: product.description,
        tags: product.tags
      });
    }
  }

  // Company knowledge capabilities
  if (context.companyKnowledge?.capabilities) {
    for (const [index, capability] of context.companyKnowledge.capabilities.entries()) {
      evidence.push({
        sourceId: `knowledge:capability:${index}`,
        kind: "KNOWLEDGE_CAPABILITY",
        name: capability.name,
        category: capability.category,
        description: capability.description
      });
    }
  }

  // Company knowledge case studies
  if (context.companyKnowledge?.caseStudies) {
    for (const [index, caseStudy] of context.companyKnowledge.caseStudies.entries()) {
      evidence.push({
        sourceId: `knowledge:case:${index}`,
        kind: "KNOWLEDGE_CASE_STUDY",
        title: caseStudy.title,
        market: caseStudy.market,
        category: caseStudy.category,
        summary: caseStudy.summary
      });
    }
  }

  // CRM contacts
  if (context.contacts) {
    for (const [index, contact] of context.contacts.entries()) {
      evidence.push({
        sourceId: `contact:${index}`,
        kind: "CRM_CONTACT",
        name: contact.name,
        title: contact.title,
        email: contact.email,
        qualityScore: contact.qualityScore
      });
    }
  }

  // Follow-up tasks
  if (context.followUpTasks) {
    for (const [index, task] of context.followUpTasks.entries()) {
      evidence.push({
        sourceId: `followup:${index}`,
        kind: "FOLLOWUP_TASK",
        title: task.title,
        status: task.status,
        dueAt: task.dueAt,
        type: task.type
      });
    }
  }

  return evidence;
}

// ── Group builder ──

export function buildResearchGroups(evidence: ResearchEvidenceItem[]): ResearchEvidenceGroup[] {
  const groupMap = new Map<ResearchGroupName, ResearchEvidenceItem[]>();

  for (const item of evidence) {
    const groupName = assignResearchGroup(item);
    const existing = groupMap.get(groupName) ?? [];
    if (!existing.some((e) => e.sourceId === item.sourceId)) {
      existing.push(item);
    }
    groupMap.set(groupName, existing);
  }

  const groups: ResearchEvidenceGroup[] = [];
  for (const groupName of ALL_RESEARCH_GROUP_NAMES) {
    const items = groupMap.get(groupName);
    if (items && items.length) {
      groups.push({ groupName, items, sourceIds: items.map((item) => item.sourceId) });
    }
  }

  return groups;
}

function assignResearchGroup(item: ResearchEvidenceItem): ResearchGroupName {
  switch (item.kind) {
    case "CUSTOMER_PROFILE":
      return "customer_profile";
    case "WEBSITE_PAGE":
    case "WEBSITE_PRODUCT":
    case "WEBSITE_CONTACT":
      return "website_summary";
    case "PUBLIC_SEARCH":
      return "public_search";
    case "KNOWLEDGE_PRODUCT":
    case "KNOWLEDGE_CAPABILITY":
      return "product_fit";
    case "KNOWLEDGE_CASE_STUDY":
      return "opportunities";
    case "CRM_CONTACT":
      return "contact_signals";
    case "FOLLOWUP_TASK":
      return "followup_context";
  }
}

// ── Source index builder ──

export function buildResearchSourceIndex(evidence: ResearchEvidenceItem[]): Set<string> {
  return new Set(evidence.map((item) => item.sourceId));
}

// ── Helpers ──

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
