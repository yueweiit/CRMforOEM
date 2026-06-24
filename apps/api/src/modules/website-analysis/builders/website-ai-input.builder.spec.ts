import * as assert from "node:assert/strict";
import { WebsiteAnalysisResult } from "@oem-crm/shared";
import {
  buildBoundedWebsiteAiInput,
  WEBSITE_AI_INPUT_CHAR_LIMIT
} from "./website-ai-input.builder";

function makeLargeWebsiteResult(): WebsiteAnalysisResult {
  const pages = Array.from({ length: 40 }, (_, index) => ({
    url: `https://example.com/products/category-${index}`,
    pageType: index === 0 ? ("HOME" as const) : index % 3 === 0 ? ("PRODUCT_DETAIL" as const) : ("PRODUCT_LIST" as const),
    title: `Large page ${index}`,
    language: "en",
    textSummary: `Page ${index} `.repeat(1_500),
    headings: Array.from({ length: 30 }, (__, headingIndex) => `Heading ${index}-${headingIndex}`),
    links: [],
    images: [],
    contacts: [],
    priceSignals: [`$${index + 10}`],
    depth: index % 4
  }));

  return {
    crawledUrls: pages.map((page) => page.url),
    pages,
    detectedLanguage: "en",
    contacts: Array.from({ length: 20 }, (_, index) => ({
      type: "email" as const,
      value: `contact-${index}@example.com`,
      sourceUrl: pages[0].url
    })),
    productCategories: Array.from({ length: 30 }, (_, index) => ({
      name: `Category ${index}`,
      productCount: 20,
      evidenceUrls: pages.slice(0, 5).map((page) => page.url),
      keywords: Array.from({ length: 16 }, (__, keywordIndex) => `keyword-${index}-${keywordIndex}`)
    })),
    productCount: 120,
    products: Array.from({ length: 80 }, (_, index) => ({
      name: `Product ${index}`,
      category: `Category ${index % 10}`,
      description: `Description ${index} `.repeat(200),
      keywords: Array.from({ length: 12 }, (__, keywordIndex) => `product-keyword-${index}-${keywordIndex}`),
      evidenceUrls: pages.slice(0, 4).map((page) => page.url),
      imageUrls: [],
      priceSignals: [`$${index + 20}`],
      confidence: 80
    })),
    priceRange: { min: 10, max: 200, currency: "USD" },
    imageStyle: "Many product lifestyle images",
    websiteCompleteness: 90,
    pricePositioning: "mid",
    missingCategories: Array.from({ length: 20 }, (_, index) => `Missing ${index}`),
    cooperationOpportunities: Array.from({ length: 30 }, (_, index) => `Opportunity ${index} `.repeat(80)),
    risks: Array.from({ length: 30 }, (_, index) => `Risk ${index} `.repeat(80))
  };
}

const companyProfile = {
  products: Array.from({ length: 100 }, (_, index) => ({
    name: `Our product ${index}`,
    category: `Our category ${index % 20}`,
    material: `Material ${index}`,
    priceMin: index + 1,
    priceMax: index + 5,
    currency: "USD",
    tags: Array.from({ length: 12 }, (__, tagIndex) => `tag-${index}-${tagIndex}`)
  })),
  capabilities: Array.from({ length: 80 }, (_, index) => ({
    name: `Capability ${index}`,
    category: `Capability category ${index % 10}`,
    moq: `MOQ ${index}`,
    leadTime: `${index + 10} days`
  }))
};

const input = buildBoundedWebsiteAiInput(makeLargeWebsiteResult(), companyProfile);
const payload = JSON.stringify(input);

assert.ok(
  payload.length <= WEBSITE_AI_INPUT_CHAR_LIMIT,
  `expected AI input JSON to stay within ${WEBSITE_AI_INPUT_CHAR_LIMIT} chars, got ${payload.length}`
);
assert.ok(input.pages.length <= 15, `expected at most 15 pages, got ${input.pages.length}`);
assert.ok(
  input.pages.every((page) => !page.textSummary || page.textSummary.length <= 1_200),
  "expected every page summary to be trimmed"
);
assert.ok(input.products.length <= 12, `expected at most 12 crawled products, got ${input.products.length}`);
assert.ok(input.ourProducts.length <= 20, `expected at most 20 profile products, got ${input.ourProducts.length}`);
assert.ok(input.ourCapabilities.length <= 20, `expected at most 20 capabilities, got ${input.ourCapabilities.length}`);
