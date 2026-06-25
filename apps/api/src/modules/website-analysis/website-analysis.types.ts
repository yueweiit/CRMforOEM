import type { WebsiteAnalysisResult } from "@oem-crm/shared";

/**
 * Parsed AI insight object stored inside websiteAnalysis.rawResult.aiInsights.
 * 解析后的 AI 洞察对象存储在 websiteAnalysis.rawResult.aiInsights 中。 
 */
export type WebsiteAiInsights = {
  business_summary: string;
  customer_profile: string;
  main_business: string;
  product_line_analysis: string;
  brand_positioning: string;
  market_channel_signals: string;
  oem_opportunity_assessment: string;
  cooperation_opportunities: string[];
  sales_entry_points: string[];
  suggested_next_actions: string[];
  risk_notes: string[];
  evidence_pages: Array<{ title: string; url: string; reason: string }>;
  missing_categories_gap: Array<{
    category: string;
    customer_has: string;
    we_can_supply: string;
    opportunity_score: number;
    reason: string;
    data_quality_note: string;
  }>;
   price_competitiveness: {
    level: "competitive" | "neutral" | "challenging" | "unknown";
    summary: string;
    price_nature_note: string;
  };
  unknown_factors: string[];
  our_data_quality_note: string;
};

/**
 * Company profile slice used to enrich website analysis AI input.
 */
export type WebsiteAnalysisCompanyProfile = {
  products: Array<{
    name: string;
    category: string;
    material: string | null;
    priceMin: unknown;
    priceMax: unknown;
    currency: string | null;
    tags: string[];
  }>;
  capabilities: Array<{
    name: string;
    category: string;
    moq: string | null;
    leadTime: string | null;
  }>;
} | null;

/**
 * Website crawler result type alias used by analysis helpers.
 */
export type WebsiteCrawlerResult = WebsiteAnalysisResult;
