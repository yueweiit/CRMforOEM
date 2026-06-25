export type ResearchAiMetaView = {
  mode: string;
  status: string;
  inputChars: number;
  errorKind?: string;
  errorMessage?: string;
};

export type ResearchSourceEvidenceView = {
  websiteUrls: string[];
  websitePages: unknown[];
  products: unknown[];
  capabilities: unknown[];
  caseStudies: unknown[];
  publicSearchResults: unknown[];
  crmContacts: unknown[];
  followups: unknown[];
  sourceBasis: unknown[];
  hasNewFormat: boolean;
};

export function buildResearchSourceEvidenceView(evidence?: unknown, reportJson?: unknown): ResearchSourceEvidenceView {
  const record = asRecord(evidence);
  const report = asRecord(reportJson);

  // Detect new format: check v2-only short keys (pages/contacts/products/capabilities/caseStudies/followups)
  // publicSearchResults is shared by both formats — not used for format detection
  // customer is an array from backend — asRecord would miss it, so excluded from detection
  const newPages = asArray(record.pages);
  const newContacts = asArray(record.contacts);
  const newProducts = asArray(record.products);
  const newCapabilities = asArray(record.capabilities);
  const newCaseStudies = asArray(record.caseStudies);
  const newFollowups = asArray(record.followups);
  const hasNewFormat = newPages.length > 0 || newContacts.length > 0 || newProducts.length > 0
    || newCapabilities.length > 0 || newCaseStudies.length > 0 || newFollowups.length > 0;

  if (hasNewFormat) {
    return {
      websiteUrls: getStringArray(record.websiteUrls).slice(0, 12),
      websitePages: newPages.slice(0, 12),
      products: newProducts.slice(0, 12),
      capabilities: newCapabilities.slice(0, 8),
      caseStudies: newCaseStudies.slice(0, 6),
      publicSearchResults: asArray(record.publicSearchResults).slice(0, 8),
      crmContacts: newContacts.slice(0, 8),
      followups: newFollowups.slice(0, 8),
      sourceBasis: asArray(report.source_basis).slice(0, 12),
      hasNewFormat: true
    };
  }

  // Legacy format
  return {
    websiteUrls: getStringArray(record.websiteUrls).slice(0, 12),
    websitePages: asArray(record.websitePages).slice(0, 12),
    products: [],
    capabilities: [],
    caseStudies: [],
    publicSearchResults: asArray(record.publicSearchResults).slice(0, 8),
    crmContacts: asArray(record.crmContacts).slice(0, 8),
    followups: [],
    sourceBasis: asArray(report.source_basis).slice(0, 12),
    hasNewFormat: false
  };
}

export function hasResearchSourceEvidence(view: ResearchSourceEvidenceView) {
  return Boolean(
    view.websiteUrls.length ||
    view.websitePages.length ||
    view.products.length ||
    view.capabilities.length ||
    view.caseStudies.length ||
    view.publicSearchResults.length ||
    view.crmContacts.length ||
    view.followups.length ||
    view.sourceBasis.length
  );
}

export function formatSourceBasisItem(item: unknown, index: number) {
  const record = asRecord(item);
  const section = getText(record, "section");
  const source = getText(record, "source");
  const evidence = getText(record, "evidence");
  return [section, source, evidence].filter(Boolean).join(" · ") || `来源依据 ${index + 1}`;
}

export function getResearchAiMeta(reportJson?: unknown): ResearchAiMetaView | undefined {
  const report = asRecord(reportJson);
  const meta = asRecord(report.aiMeta);
  if (!Object.keys(meta).length) return undefined;
  return {
    mode: getText(meta, "mode"),
    status: getText(meta, "status"),
    inputChars: typeof meta.inputChars === "number" ? meta.inputChars : 0,
    errorKind: getText(meta, "errorKind") || undefined,
    errorMessage: getText(meta, "errorMessage") || undefined
  };
}

// ── Helpers ──

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
