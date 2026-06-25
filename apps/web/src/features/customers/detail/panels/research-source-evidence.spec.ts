import * as assert from "node:assert/strict";
import {
  buildResearchSourceEvidenceView,
  formatSourceBasisItem,
  hasResearchSourceEvidence,
  getResearchAiMeta
} from "./research-source-evidence";

// ── Legacy format (websitePages / crmContacts) ──
{
  const view = buildResearchSourceEvidenceView(
    {},
    {
      source_basis: [
        { section: "Core business", source: "Website", evidence: "https://example.com/products" }
      ]
    }
  );
  assert.equal(hasResearchSourceEvidence(view), true);
  assert.equal(view.sourceBasis.length, 1);
  assert.equal(view.hasNewFormat, false);
  assert.equal(formatSourceBasisItem(view.sourceBasis[0], 0), ["Core business", "Website", "https://example.com/products"].join(" · "));
}

// ── New format (pages / contacts / products / capabilities / caseStudies / followups) ──
{
  const view = buildResearchSourceEvidenceView({
    pages: [{ sourceId: "p1", url: "https://example.com", title: "Home", pageType: "HOME" }],
    products: [{ sourceId: "prod1", name: "Widget", category: "Accessories" }],
    capabilities: [{ sourceId: "cap1", name: "Injection Molding", category: "Manufacturing" }],
    caseStudies: [{ sourceId: "cs1", title: "Project Alpha", market: "EU" }],
    contacts: [{ sourceId: "c1", name: "Alice", title: "Sales", email: "alice@example.com" }],
    followups: [{ sourceId: "f1", title: "Send quote", status: "OPEN", dueAt: "2026-07-01" }],
    publicSearchResults: [{ title: "News", url: "https://news.com/1" }],
    websiteUrls: ["https://example.com"]
  });
  assert.equal(view.hasNewFormat, true);
  assert.equal(view.websitePages.length, 1);
  assert.equal(view.products.length, 1);
  assert.equal(view.capabilities.length, 1);
  assert.equal(view.caseStudies.length, 1);
  assert.equal(view.crmContacts.length, 1);
  assert.equal(view.followups.length, 1);
  assert.equal(view.publicSearchResults.length, 1);
  assert.equal(hasResearchSourceEvidence(view), true);
}

// ── Empty evidence ──
{
  const view = buildResearchSourceEvidenceView({}, {});
  assert.equal(hasResearchSourceEvidence(view), false);
}

// ── New format detected even without pages/contacts ──
{
  // Only products
  const view = buildResearchSourceEvidenceView({ products: [{ sourceId: "p1", name: "Widget" }] });
  assert.equal(view.hasNewFormat, true);
  assert.equal(view.products.length, 1);
}
{
  // Only publicSearchResults — legacy format (shared field, not format-specific)
  const view = buildResearchSourceEvidenceView({ publicSearchResults: [{ title: "News", url: "https://n.com" }] });
  assert.equal(view.hasNewFormat, false);
  assert.equal(view.publicSearchResults.length, 1);
}
{
  // Only capabilities (no pages, no contacts)
  const view = buildResearchSourceEvidenceView({ capabilities: [{ sourceId: "c1", name: "Plastic Molding" }] });
  assert.equal(view.hasNewFormat, true);
  assert.equal(view.capabilities.length, 1);
}
{
  // Only caseStudies
  const view = buildResearchSourceEvidenceView({ caseStudies: [{ sourceId: "cs1", title: "Project X" }] });
  assert.equal(view.hasNewFormat, true);
  assert.equal(view.caseStudies.length, 1);
}
{
  // Only followups
  const view = buildResearchSourceEvidenceView({ followups: [{ sourceId: "f1", title: "Task 1" }] });
  assert.equal(view.hasNewFormat, true);
  assert.equal(view.followups.length, 1);
}
{
  // Only customer (backend outputs array, asRecord returns {} — cannot trigger new format)
  const view = buildResearchSourceEvidenceView({ customer: [{ sourceId: "c1", name: "Acme", country: "US" }] });
  assert.equal(view.hasNewFormat, false);
}
{
  // Legacy websitePages + crmContacts + publicSearchResults — should remain legacy
  const view = buildResearchSourceEvidenceView({
    websitePages: [{ url: "https://x.com", pageType: "HOME", title: "X" }],
    crmContacts: [{ name: "Bob", email: "b@x.com" }],
    publicSearchResults: [{ title: "News", url: "https://n.com" }]
  });
  assert.equal(view.hasNewFormat, false);
  assert.equal(view.websitePages.length, 1);
  assert.equal(view.crmContacts.length, 1);
  assert.equal(view.publicSearchResults.length, 1);
  assert.equal(view.products.length, 0);
  assert.equal(view.followups.length, 0);
}

// ── getResearchAiMeta ──
{
  const meta = getResearchAiMeta({
    aiMeta: { mode: "DIRECT", status: "SUCCEEDED", inputChars: 5000 }
  });
  assert.equal(meta?.mode, "DIRECT");
  assert.equal(meta?.status, "SUCCEEDED");
}

{
  const meta = getResearchAiMeta({});
  assert.equal(meta, undefined);
}

console.log("research-source-evidence.spec.ts OK");
