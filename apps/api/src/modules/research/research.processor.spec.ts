import * as assert from "node:assert/strict";
import { AiProviderError } from "../ai/ai-provider.service";
import { AiSummaryCache } from "../ai/services/ai-summary-cache.service";
import { ResearchProcessor } from "./research.processor";

function buildLargeResearchContext() {
  const pages = Array.from({ length: 60 }, (_, index) => ({
    url: `https://onlyphones.example/products/${index}`,
    pageType: "PRODUCT_DETAIL",
    title: `Onlyphones product page ${index}`,
    textSummary: `Phone accessory catalogue evidence ${index}. `.repeat(30)
  }));

  const products = Array.from({ length: 50 }, (_, index) => ({
    name: `Case model ${index}`,
    category: "phone case",
    description: `Protective phone case with material and fit details ${index}. `.repeat(12),
    keywords: ["case", "phone", "accessory"]
  }));

  return {
    customer: {
      name: "onlyphones",
      websiteUrl: "https://onlyphones.example",
      country: "RU",
      language: "ru",
      typeName: "Retailer",
      sourceName: "CRM"
    },
    contacts: Array.from({ length: 8 }, (_, index) => ({
      name: `Buyer ${index}`,
      title: "Purchasing manager",
      email: `buyer${index}@onlyphones.example`,
      qualityScore: 80
    })),
    websiteSummary: {
      status: "SUCCEEDED",
      productCount: products.length,
      pricePositioning: "Prices visible for selected accessories.",
      websiteCompleteness: 80,
      productCategories: ["phone case", "screen protector"],
      pages,
      products,
      contacts: [{ type: "email", value: "sales@onlyphones.example", sourceUrl: "https://onlyphones.example/contact" }]
    },
    websiteInsights: {
      businessSummary: "Phone accessory retailer with a broad catalogue. ".repeat(30),
      customerProfile: "Consumer electronics accessory seller. ".repeat(30),
      mainBusiness: "Phone cases and accessories. ".repeat(30),
      productLineAnalysis: "Large phone accessory catalogue. ".repeat(30),
      brandPositioning: "Mid-market accessory retailer. ".repeat(30),
      marketChannelSignals: "Website catalogue and direct contact channel. ".repeat(30)
    },
    publicSearch: {
      enabled: true,
      warning: undefined,
      results: Array.from({ length: 8 }, (_, index) => ({
        title: `Search result ${index}`,
        url: `https://search.example/${index}`,
        snippet: `Public search snippet ${index}. `.repeat(20)
      }))
    },
    companyKnowledge: {
      products: [{ name: "OEM phone case", category: "phone case", description: "Supplier product", tags: ["OEM"] }],
      capabilities: Array.from({ length: 8 }, (_, index) => ({
        name: `Capability ${index}`,
        category: "manufacturing",
        description: `Case production and finishing capability ${index}. `.repeat(20)
      })),
      caseStudies: Array.from({ length: 6 }, (_, index) => ({
        title: `Case study ${index}`,
        market: "EU",
        category: "phone case",
        summary: `OEM accessory cooperation example ${index}. `.repeat(20)
      }))
    },
    followUpTasks: [],
    sourceEvidence: {},
    salesNotes: "Sales team notes about target products, purchasing needs, and risks. ".repeat(40)
  };
}

async function main() {
  const aiProvider = {
    complete: async () => {
      throw new AiProviderError("AI provider returned an empty response body", { statusCode: 200 });
    }
  };

  const processor = new ResearchProcessor(
    aiProvider as never,
    new AiSummaryCache(),
    {} as never,
    {} as never
  );

  const outcome = await (processor as unknown as {
    generateAiInsights(
      context: ReturnType<typeof buildLargeResearchContext>,
      organizationId: string,
      customerId: string
    ): Promise<{
      aiMeta: { mode: string; status: string; errorKind?: string };
      summaryPipeline?: { mode: string; status: string; groups: Record<string, { status: string; failedBatchCount: number }> };
      parseOk: boolean;
    }>;
  }).generateAiInsights(buildLargeResearchContext(), "org-1", "customer-1");

  assert.equal(outcome.parseOk, false);
  assert.equal(outcome.aiMeta.mode, "BATCH_SUMMARY");
  assert.equal(outcome.aiMeta.status, "FAILED");
  assert.equal(outcome.aiMeta.errorKind, "EMPTY_RESPONSE");
  assert.ok(outcome.summaryPipeline, "BATCH_SUMMARY provider failure should still persist summaryPipeline metadata");
  assert.equal(outcome.summaryPipeline?.mode, "BATCH_SUMMARY");
  assert.equal(outcome.summaryPipeline?.status, "failed");
  assert.ok(Object.keys(outcome.summaryPipeline?.groups ?? {}).length > 0, "summaryPipeline should keep group statuses");
}

void main();
