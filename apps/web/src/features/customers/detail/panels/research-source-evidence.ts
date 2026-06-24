export type ResearchSourceEvidenceView = {
  websiteUrls: string[];
  websitePages: unknown[];
  publicSearchResults: unknown[];
  crmContacts: unknown[];
  sourceBasis: unknown[];
};

export function buildResearchSourceEvidenceView(evidence?: unknown, reportJson?: unknown): ResearchSourceEvidenceView {
  const record = asRecord(evidence);
  const report = asRecord(reportJson);
  return {
    websiteUrls: getStringArray(record.websiteUrls).slice(0, 12),
    websitePages: asArray(record.websitePages).slice(0, 12),
    publicSearchResults: asArray(record.publicSearchResults).slice(0, 8),
    crmContacts: asArray(record.crmContacts).slice(0, 8),
    sourceBasis: asArray(report.source_basis).slice(0, 12)
  };
}

export function hasResearchSourceEvidence(view: ResearchSourceEvidenceView) {
  return Boolean(
    view.websiteUrls.length ||
    view.websitePages.length ||
    view.publicSearchResults.length ||
    view.crmContacts.length ||
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
