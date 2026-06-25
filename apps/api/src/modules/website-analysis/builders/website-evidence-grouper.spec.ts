import * as assert from "node:assert/strict";
import type { WebsiteAnalysisResult } from "@oem-crm/shared";
import { buildWebsiteEvidenceInventory, buildSourceIndex } from "./website-evidence-inventory.builder";
import { assignWebsiteEvidenceGroup, buildWebsiteGroups } from "./website-evidence-grouper";
import type { WebsiteEvidenceItem } from "../website-analysis.types";

function makePage(overrides: Partial<WebsiteAnalysisResult["pages"][number]> = {}): WebsiteAnalysisResult["pages"][number] {
  return {
    url: "https://example.com",
    pageType: "OTHER",
    title: "Test Page",
    headings: [],
    links: [],
    images: [],
    contacts: [],
    priceSignals: [],
    depth: 0,
    ...overrides
  };
}

const baseResult: WebsiteAnalysisResult = {
  crawledUrls: [],
  pages: [],
  contacts: [],
  productCategories: [],
  products: [],
  missingCategories: [],
  cooperationOpportunities: [],
  risks: []
};

function run() {
  // ── Inventory ──
  {
    const result: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Home" }),
        makePage({ url: "https://example.com/products", pageType: "PRODUCT_LIST", title: "Products" })
      ],
      contacts: [{ type: "email" as const, value: "a@b.com" }],
      products: [{ name: "Widget", category: "A", description: "desc", keywords: [], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: [], confidence: 80 }]
    };
    const evidence = buildWebsiteEvidenceInventory(result);
    assert.ok(evidence.length >= 3, "inventory contains pages + products + contacts");
    assert.ok(evidence.some((e) => e.sourceId === "page:0" && e.kind === "PAGE"), "page:0 is a page");
    assert.ok(evidence.some((e) => e.sourceId === "page:1" && e.kind === "PAGE"), "page:1 is a page");
    assert.ok(evidence.some((e) => e.sourceId === "product:0" && e.kind === "PRODUCT"), "product:0 is a product");
    assert.ok(evidence.some((e) => e.sourceId === "contact:0" && e.kind === "CONTACT"), "contact:0 is a contact");

    const index = buildSourceIndex(evidence);
    assert.ok(index.has("page:0"), "source index has page:0");
    assert.ok(index.has("product:0"), "source index has product:0");
    assert.ok(index.has("contact:0"), "source index has contact:0");
  }

  // ── Grouping: HOME → brand_about ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com"],
      pages: [makePage({ url: "https://example.com", pageType: "HOME", title: "Our Brand" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "brand_about", "HOME page → brand_about");
    assert.ok(assignment.confidence > 0.5, "HOME page confidence > 0.5");
    assert.ok(assignment.selectedForAi, "HOME page selected for AI");
  }

  // ── Grouping: PRODUCT_DETAIL → product_catalog ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/product/1"],
      pages: [makePage({ url: "https://example.com/product/1", pageType: "PRODUCT_DETAIL", title: "Product X" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "product_catalog", "PRODUCT_DETAIL → product_catalog");
    assert.ok(assignment.confidence >= 0.95, "product detail confidence high");
  }

  // ── Grouping: CONTACT → contact_channel ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/contact"],
      pages: [makePage({ url: "https://example.com/contact", pageType: "CONTACT", title: "Contact Us", contacts: [{ type: "email", value: "hi@ex.com" }] })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "contact_channel", "CONTACT page → contact_channel");
  }

  // ── Grouping: ABOUT → brand_about ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/about"],
      pages: [makePage({ url: "https://example.com/about", pageType: "ABOUT", title: "About Us" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "brand_about", "ABOUT page → brand_about");
  }

  // ── Grouping: PRODUCT_LIST → product_catalog ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/products"],
      pages: [makePage({ url: "https://example.com/products", pageType: "PRODUCT_LIST", title: "Our Products" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "product_catalog", "PRODUCT_LIST → product_catalog");
  }

  // ── Grouping: FAQ page → risk_signal (low value auxiliary page) ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/faq"],
      pages: [makePage({ url: "https://example.com/faq", pageType: "SUPPORT", title: "FAQ" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "risk_signal", "SUPPORT page with /faq URL → risk_signal");
    assert.ok(!assignment.selectedForAi, "low confidence page not selected for AI");
  }
  // ── Grouping: bare SUPPORT page without URL signals → uncertain ──
  {
    const pageItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      crawledUrls: ["https://example.com/unknown-page"],
      pages: [makePage({ url: "https://example.com/unknown-page", pageType: "SUPPORT", title: "Support Page" })]
    })[0];
    const assignment = assignWebsiteEvidenceGroup(pageItem);
    assert.equal(assignment.primaryGroup, "uncertain", "SUPPORT page without URL signals → uncertain");
  }

  // ── Grouping: PRODUCT kind → product_catalog ──
  {
    const productItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      products: [{ name: "Widget", category: "A", description: "desc", keywords: ["widget"], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: ["$10"], confidence: 80 }]
    }).find((e) => e.kind === "PRODUCT")!;
    const assignment = assignWebsiteEvidenceGroup(productItem);
    assert.equal(assignment.primaryGroup, "product_catalog", "PRODUCT → product_catalog");
    assert.equal(assignment.groups.length, 1, "price_region score 30 below 55 threshold for secondary group");
  }

  // ── Grouping: CONTACT kind → contact_channel ──
  {
    const contactItem = buildWebsiteEvidenceInventory({
      ...baseResult,
      contacts: [{ type: "email" as const, value: "a@b.com" }]
    }).find((e) => e.kind === "CONTACT")!;
    const assignment = assignWebsiteEvidenceGroup(contactItem);
    assert.equal(assignment.primaryGroup, "contact_channel", "CONTACT → contact_channel");
  }

  // ── buildWebsiteGroups: basic grouping (not small website) ──
  {
    const result: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com", "https://example.com/products", "https://example.com/contact", "https://example.com/about"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Home" }),
        makePage({ url: "https://example.com/products", pageType: "PRODUCT_LIST", title: "Products" }),
        makePage({ url: "https://example.com/contact", pageType: "CONTACT", title: "Contact" }),
        makePage({ url: "https://example.com/about", pageType: "ABOUT", title: "About" })
      ],
      contacts: [{ type: "email" as const, value: "a@b.com" }],
      products: [
        { name: "Widget", category: "A", description: "desc", keywords: [], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: [], confidence: 80 },
        { name: "Gadget", category: "B", description: "desc2", keywords: [], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: [], confidence: 80 }
      ]
    };
    const evidence = buildWebsiteEvidenceInventory(result);
    const groups = buildWebsiteGroups(evidence, result);
    assert.ok(groups.length >= 2, "multiple groups created");
    const brandGroup = groups.find((g) => g.groupName === "brand_about");
    assert.ok(brandGroup, "brand_about group exists");
    assert.ok(brandGroup!.sourceIds.includes("page:0"), "HOME page in brand_about");
    const productGroup = groups.find((g) => g.groupName === "product_catalog");
    assert.ok(productGroup, "product_catalog group exists");
    assert.ok(productGroup!.sourceIds.includes("product:0"), "Product in product_catalog");
    const contactGroup = groups.find((g) => g.groupName === "contact_channel");
    assert.ok(contactGroup, "contact_channel group exists");
    assert.ok(contactGroup!.sourceIds.includes("contact:0"), "Contact in contact_channel");
  }

  // ── buildWebsiteGroups: product fallback (not small website) ──
  {
    const resultNoProductPages: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com", "https://example.com/about", "https://example.com/contact", "https://example.com/brand"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Home" }),
        makePage({ url: "https://example.com/about", pageType: "ABOUT", title: "About" }),
        makePage({ url: "https://example.com/contact", pageType: "CONTACT", title: "Contact" }),
        makePage({ url: "https://example.com/brand", pageType: "BRAND", title: "Brand" })
      ],
      products: [{ name: "Widget", category: "A", description: "desc", keywords: [], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: [], confidence: 80 }]
    };
    const evidence = buildWebsiteEvidenceInventory(resultNoProductPages);
    const groups = buildWebsiteGroups(evidence, resultNoProductPages);
    const productGroup = groups.find((g) => g.groupName === "product_catalog");
    assert.ok(productGroup, "product fallback group created from crawler products");
    assert.ok(productGroup!.items.length > 0, "fallback group has product items");
  }

  // ── buildWebsiteGroups: contact fallback (not small website) ──
  {
    const resultNoContactPages: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com", "https://example.com/about", "https://example.com/products", "https://example.com/brand"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Home" }),
        makePage({ url: "https://example.com/about", pageType: "ABOUT", title: "About" }),
        makePage({ url: "https://example.com/products", pageType: "PRODUCT_LIST", title: "Products" }),
        makePage({ url: "https://example.com/brand", pageType: "BRAND", title: "Brand" })
      ],
      contacts: [{ type: "email" as const, value: "a@b.com" }]
    };
    const evidence = buildWebsiteEvidenceInventory(resultNoContactPages);
    const groups = buildWebsiteGroups(evidence, resultNoContactPages);
    const contactGroup = groups.find((g) => g.groupName === "contact_channel");
    assert.ok(contactGroup, "contact fallback group created from crawler contacts");
    assert.ok(contactGroup!.items.length > 0, "fallback group has contact items");
  }

  // ── buildWebsiteGroups: small website → lightweight whole-site group ──
  {
    const smallResult: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Home" }),
        makePage({ url: "https://example.com/about", pageType: "ABOUT", title: "About" })
      ],
      products: [{ name: "Widget", category: "A", description: "desc", keywords: [], evidenceUrls: ["https://example.com"], imageUrls: [], priceSignals: [], confidence: 80 }]
    };
    const evidence = buildWebsiteEvidenceInventory(smallResult);
    const groups = buildWebsiteGroups(evidence, smallResult);
    assert.equal(groups.length, 1, "small website → one lightweight group");
    assert.equal(groups[0].groupName, "brand_about", "small website group is brand_about");
  }

  // ── Dedupe: same sourceId only appears once per group ──
  {
    const result: WebsiteAnalysisResult = {
      ...baseResult,
      crawledUrls: ["https://example.com"],
      pages: [
        makePage({ url: "https://example.com", pageType: "HOME", title: "Brand & Products", textSummary: "product catalog and brand story", contacts: [{ type: "email", value: "hi@ex.com" }] })
      ],
      products: [],
      contacts: []
    };
    const evidence = buildWebsiteEvidenceInventory(result);
    const assignment = assignWebsiteEvidenceGroup(evidence[0]);
    const groupIds = new Set(assignment.groups);
    assert.equal(groupIds.size, assignment.groups.length, "no duplicate group entries");
  }

  console.log("website-evidence-grouper.spec.ts OK");
}

run();
