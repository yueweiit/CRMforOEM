import * as assert from "node:assert/strict";
import { ServiceUnavailableException } from "@nestjs/common";
import { WebsiteAnalysisResult } from "@oem-crm/shared";
import { WebsiteAnalysisProcessor } from "./website-analysis.processor";

const crawlerResult: WebsiteAnalysisResult = {
  crawledUrls: ["https://example.com"],
  pages: [
    {
      url: "https://example.com",
      pageType: "HOME",
      title: "Example",
      language: "en",
      textSummary: "Example homepage",
      headings: ["Example"],
      links: [],
      images: [],
      contacts: [{ type: "email", value: "sales@example.com", sourceUrl: "https://example.com" }],
      priceSignals: [],
      depth: 0
    }
  ],
  detectedLanguage: "en",
  contacts: [{ type: "email", value: "sales@example.com", sourceUrl: "https://example.com" }],
  productCategories: [{ name: "Accessories", productCount: 1, evidenceUrls: ["https://example.com"], keywords: ["accessories"] }],
  productCount: 1,
  products: [
    {
      name: "Phone case",
      category: "Accessories",
      description: "Protective phone case",
      keywords: ["case"],
      evidenceUrls: ["https://example.com"],
      imageUrls: [],
      priceSignals: [],
      confidence: 80
    }
  ],
  websiteCompleteness: 80,
  pricePositioning: "unknown",
  missingCategories: [],
  cooperationOpportunities: ["Use visible product category as opening"],
  risks: []
};

const websiteAnalysisUpdates: unknown[] = [];
const pagesCreated: unknown[] = [];
const productsCreated: unknown[] = [];
const aiFailures: string[] = [];

const prisma = {
  websiteAnalysis: {
    findUniqueOrThrow: async () => ({
      id: "analysis-1",
      aiGenerationRunId: "run-1",
      customer: { organizationId: "org-1" }
    }),
    update: async (input: unknown) => {
      websiteAnalysisUpdates.push(input);
      return input;
    }
  },
  companyProfile: {
    findFirst: async () => ({ products: [], capabilities: [] })
  },
  websiteAnalysisPage: {
    createMany: async (input: { data: unknown[] }) => {
      pagesCreated.push(...input.data);
      return { count: input.data.length };
    }
  },
  websiteAnalysisProduct: {
    createMany: async (input: { data: unknown[] }) => {
      productsCreated.push(...input.data);
      return { count: input.data.length };
    }
  }
};

const processor = new WebsiteAnalysisProcessor(
  prisma as never,
  { analyze: async () => crawlerResult } as never,
  {
    complete: async () => {
      throw new ServiceUnavailableException("AI provider returned non-JSON response. Body:");
    }
  } as never,
  {
    markSucceeded: async () => undefined,
    addRawAiVersion: async () => undefined,
    markFailed: async (_runId: string, message: string) => {
      aiFailures.push(message);
    }
  } as never
);

async function main() {
  await processor.process({ data: { analysisId: "analysis-1", customerId: "customer-1", websiteUrl: "https://example.com" } } as never);

  const finalUpdate = websiteAnalysisUpdates.at(-1) as { data?: Record<string, unknown> } | undefined;
  assert.equal(finalUpdate?.data?.status, "SUCCEEDED", "crawler result should still complete when only AI summary fails");
  assert.equal(pagesCreated.length, 1, "crawler pages should be persisted before/after AI failure");
  assert.equal(productsCreated.length, 1, "crawler products should be persisted before/after AI failure");
  assert.equal(aiFailures.length, 1, "AI generation run should record the provider failure");
  assert.ok(
    String(finalUpdate?.data?.errorMessage ?? "").includes("AI provider returned non-JSON response"),
    "analysis should keep an AI warning message for the UI"
  );
}

void main();
