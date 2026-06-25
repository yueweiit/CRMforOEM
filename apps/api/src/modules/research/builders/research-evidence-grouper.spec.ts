import * as assert from "node:assert/strict";
import {
  buildResearchEvidenceInventory,
  buildResearchGroups,
  buildResearchSourceIndex,
  type ResearchEvidenceItem,
  type ResearchGroupName
} from "./research-evidence-grouper";
import type { ResearchContextLike } from "./research-context-builder";

const baseContext: ResearchContextLike = {
  customer: {
    name: "Test Customer Co.",
    websiteUrl: "https://example.com",
    country: "US",
    language: "en",
    typeName: "Brand",
    sourceName: "Trade Show"
  },
  contacts: [
    { name: "John Doe", title: "CEO", email: "john@example.com", qualityScore: 80 },
    { name: "Jane Smith", title: "Procurement Manager", email: "jane@example.com", qualityScore: 90 }
  ],
  websiteSummary: {
    status: "SUCCEEDED",
    productCount: 5,
    pricePositioning: "mid",
    websiteCompleteness: 75,
    productCategories: [{ name: "Accessories", productCount: 3 }],
    pages: [
      { url: "https://example.com", pageType: "HOME", title: "Home", textSummary: "Homepage" },
      { url: "https://example.com/products", pageType: "PRODUCT_LIST", title: "Products", textSummary: "Product listing" }
    ]
  },
  websiteInsights: {
    business_summary: "A test company.",
    main_business: "Accessories manufacturing."
  },
  companyKnowledge: {
    products: [
      { name: "Phone Case", category: "Accessories", description: "Durable case", tags: ["case"] },
      { name: "Charger", category: "Power", description: "Fast charger", tags: ["charger"] }
    ],
    capabilities: [
      { name: "Injection Molding", category: "Manufacturing", description: "Plastic injection" }
    ],
    caseStudies: [
      { title: "Major Brand Partnership", market: "US", category: "Accessories", summary: "Supplied 1M units." }
    ]
  },
  publicSearch: {
    enabled: true,
    warning: undefined,
    results: [
      { title: "Test Customer on LinkedIn", url: "https://linkedin.com/company/test", snippet: "Company profile" },
      { title: "Test Customer News", url: "https://news.example.com", snippet: "Recent funding" }
    ]
  }
};

const CONTEXT_WITH_CONTACTS: ResearchContextLike = {
  ...baseContext,
  websiteSummary: {
    ...baseContext.websiteSummary!,
    contacts: [
      { type: "email", value: "sales@example.com" },
      { type: "phone", value: "+1-555-0100" }
    ]
  } as ResearchContextLike["websiteSummary"] & { contacts?: unknown }
} as ResearchContextLike;

function run() {
  // ── buildResearchEvidenceInventory ──

  {
    const evidence = buildResearchEvidenceInventory(baseContext);
    assert.ok(evidence.length > 0, "produces non-empty evidence array");

    // Customer profile
    const customerItems = evidence.filter((e) => e.kind === "CUSTOMER_PROFILE");
    assert.equal(customerItems.length, 1, "one customer profile entry");
    assert.equal(customerItems[0].sourceId, "customer:main");

    // Website pages
    const pageItems = evidence.filter((e) => e.kind === "WEBSITE_PAGE");
    assert.equal(pageItems.length, 2, "two website pages");
    assert.equal(pageItems[0].sourceId, "website:page:0");
    assert.equal(pageItems[1].sourceId, "website:page:1");

    // Public search results
    const searchItems = evidence.filter((e) => e.kind === "PUBLIC_SEARCH");
    assert.equal(searchItems.length, 2, "two search results");
    assert.equal(searchItems[0].sourceId, "search:0");
    assert.equal(searchItems[1].sourceId, "search:1");

    // Company knowledge products
    const knowledgeProducts = evidence.filter((e) => e.kind === "KNOWLEDGE_PRODUCT");
    assert.equal(knowledgeProducts.length, 2, "two knowledge products");
    assert.equal(knowledgeProducts[0].sourceId, "knowledge:product:0");

    // Company knowledge capabilities
    const knowledgeCapabilities = evidence.filter((e) => e.kind === "KNOWLEDGE_CAPABILITY");
    assert.equal(knowledgeCapabilities.length, 1, "one knowledge capability");
    assert.equal(knowledgeCapabilities[0].sourceId, "knowledge:capability:0");

    // Company knowledge case studies
    const knowledgeCases = evidence.filter((e) => e.kind === "KNOWLEDGE_CASE_STUDY");
    assert.equal(knowledgeCases.length, 1, "one case study");
    assert.equal(knowledgeCases[0].sourceId, "knowledge:case:0");

    // CRM contacts
    const crmContacts = evidence.filter((e) => e.kind === "CRM_CONTACT");
    assert.equal(crmContacts.length, 2, "two CRM contacts");
    assert.equal(crmContacts[0].sourceId, "contact:0");
    assert.equal(crmContacts[1].sourceId, "contact:1");
  }

  // ── Empty context produces minimal evidence ──
  {
    const empty: ResearchContextLike = {
      customer: { name: "Minimal" },
      publicSearch: { enabled: false }
    };
    const evidence = buildResearchEvidenceInventory(empty);
    assert.ok(evidence.length >= 1, "at least customer profile exists");
    assert.equal(evidence[0].kind, "CUSTOMER_PROFILE");
    assert.equal(evidence[0].sourceId, "customer:main");
  }

  // ── buildResearchEvidenceInventory with website contacts ──
  {
    const evidence = buildResearchEvidenceInventory(CONTEXT_WITH_CONTACTS);
    const websiteContacts = evidence.filter((e) => e.kind === "WEBSITE_CONTACT");
    assert.equal(websiteContacts.length, 2, "two website contacts");
    assert.equal(websiteContacts[0].sourceId, "website:contact:0");
    assert.equal(websiteContacts[1].sourceId, "website:contact:1");
  }

  // ── buildResearchGroups ──
  {
    const evidence = buildResearchEvidenceInventory(baseContext);
    const groups = buildResearchGroups(evidence);
    assert.ok(groups.length > 0, "produces non-empty groups");

    const groupNames = new Set(groups.map((g) => g.groupName));

    // Customer profile group
    assert.ok(groupNames.has("customer_profile"), "has customer_profile group");
    const customerGroup = groups.find((g) => g.groupName === "customer_profile")!;
    assert.ok(customerGroup.sourceIds.includes("customer:main"));

    // Website summary group
    assert.ok(groupNames.has("website_summary"), "has website_summary group");
    const websiteGroup = groups.find((g) => g.groupName === "website_summary")!;
    assert.ok(websiteGroup.sourceIds.some((id) => id.startsWith("website:page:")), "website pages in website_summary");

    // Public search group
    assert.ok(groupNames.has("public_search"), "has public_search group");
    const searchGroup = groups.find((g) => g.groupName === "public_search")!;
    assert.ok(searchGroup.sourceIds.some((id) => id.startsWith("search:")), "search results in public_search");

    // Product fit group
    assert.ok(groupNames.has("product_fit"), "has product_fit group");
    const productGroup = groups.find((g) => g.groupName === "product_fit")!;
    assert.ok(productGroup.sourceIds.some((id) => id.startsWith("knowledge:product:")), "knowledge products in product_fit");
    assert.ok(productGroup.sourceIds.some((id) => id.startsWith("knowledge:capability:")), "knowledge capabilities in product_fit");

    // Contact signals group
    assert.ok(groupNames.has("contact_signals"), "has contact_signals group");
    const contactGroup = groups.find((g) => g.groupName === "contact_signals")!;
    assert.ok(contactGroup.sourceIds.some((id) => id.startsWith("contact:")), "CRM contacts in contact_signals");

    // Opportunities group (case studies)
    assert.ok(groupNames.has("opportunities"), "has opportunities group");
    const oppGroup = groups.find((g) => g.groupName === "opportunities")!;
    assert.ok(oppGroup.sourceIds.some((id) => id.startsWith("knowledge:case:")), "case studies in opportunities");

    // Groups without data are not emitted
    assert.ok(!groupNames.has("followup_context"), "no followup_context without followup data");
    assert.ok(!groupNames.has("risks"), "no risks without risk data");

    // Each group has items and sourceIds in sync
    for (const group of groups) {
      assert.equal(group.items.length, group.sourceIds.length, `${group.groupName}: items and sourceIds length match`);
      for (const sourceId of group.sourceIds) {
        assert.ok(group.items.some((item) => item.sourceId === sourceId), `${group.groupName}: sourceId ${sourceId} has matching item`);
      }
    }
  }

  // ── buildResearchSourceIndex ──
  {
    const evidence = buildResearchEvidenceInventory(baseContext);
    const index = buildResearchSourceIndex(evidence);
    assert.ok(index.has("customer:main"));
    assert.ok(index.has("website:page:0"));
    assert.ok(index.has("search:0"));
    assert.ok(index.has("knowledge:product:0"));
    assert.ok(index.has("contact:0"));
    assert.equal(index.size, evidence.length, "index size matches evidence count");
  }

  // ── Group deduplication by sourceId ──
  {
    const evidence = buildResearchEvidenceInventory(baseContext);
    // Duplicate the evidence to test dedup
    const doubled = [...evidence, ...evidence];
    const groups = buildResearchGroups(doubled);
    for (const group of groups) {
      const uniqueIds = new Set(group.sourceIds);
      assert.equal(group.sourceIds.length, uniqueIds.size, `${group.groupName}: no duplicate sourceIds`);
    }
  }

  console.log("research-evidence-grouper.spec.ts OK");
}

void run();
