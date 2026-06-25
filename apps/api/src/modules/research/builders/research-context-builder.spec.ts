import * as assert from "node:assert/strict";
import { ResearchContextBuilder } from "./research-context-builder";

const websitePages = [
  {
    url: "https://example.com",
    pageType: "HOME",
    title: "Example Home",
    textSummary: "Home page",
    errorMessage: null
  },
  {
    url: "https://example.com/contact",
    pageType: "CONTACT",
    title: "Contact",
    textSummary: "Contact page",
    errorMessage: null
  }
];

const contacts = [
  {
    name: "Alice",
    title: "Sales",
    email: "alice@example.com",
    qualityScore: 92
  }
];

const prisma = {
  customer: {
    findFirstOrThrow: async () => ({
      id: "customer-1",
      name: "Example",
      websiteUrl: "https://example.com",
      country: "US",
      language: "en",
      source: { name: "Import" },
      type: { name: "Retailer" }
    })
  },
  websiteAnalysis: {
    findFirst: async () => ({
      status: "SUCCEEDED",
      crawledUrls: ["https://example.com", "https://example.com/contact"],
      productCount: 3,
      pricePositioning: "unknown",
      websiteCompleteness: 80,
      productCategories: [],
      products: [],
      contactEvidence: [{ type: "email", value: "sales@example.com" }],
      rawResult: {
        aiInsights: {
          evidence_pages: [{ title: "Example Home", url: "https://example.com", reason: "homepage evidence" }]
        }
      },
      pages: websitePages
    })
  },
  companyProfile: {
    findMany: async () => []
  },
  contact: {
    findMany: async () => contacts
  },
  followUpTask: {
    findMany: async () => []
  }
};

const searchResults = [
  { title: "Example search result", url: "https://news.example.com/example", snippet: "Public source" }
];

const searchProvider = {
  searchCustomer: async () => ({ enabled: true, results: searchResults })
};

async function main() {
  const builder = new ResearchContextBuilder(prisma as never, searchProvider as never);
  const context = await builder.build("org-1", "customer-1");
  const evidence = context.sourceEvidence as Record<string, unknown>;

  assert.deepEqual(evidence.websiteUrls, ["https://example.com", "https://example.com/contact"]);
  assert.deepEqual(evidence.websitePages, [
    { url: "https://example.com/contact", pageType: "CONTACT", title: "Contact" },
    { url: "https://example.com", pageType: "HOME", title: "Example Home" }
  ]);
  assert.deepEqual(evidence.publicSearchResults, [
    { title: "Example search result", url: "https://news.example.com/example" }
  ]);
  assert.deepEqual(evidence.crmContacts, [
    { name: "Alice", title: "Sales", email: "alice@example.com" }
  ]);
  assert.deepEqual((context.websiteSummary as Record<string, unknown>)?.contacts, [
    { type: "email", value: "sales@example.com" }
  ]);
}

void main();
