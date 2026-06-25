import * as assert from "node:assert/strict";
import type { WebsiteAnalysisResult } from "@oem-crm/shared";
import { parseWebsiteAiInsights, fallbackWebsiteAiInsights } from "./website-ai-insight.parser";

const baseResult: WebsiteAnalysisResult = {
  crawledUrls: ["https://example.com"],
  pages: [
    {
      url: "https://example.com",
      pageType: "HOME",
      title: "Example Home",
      language: "en",
      textSummary: "Homepage of example company",
      headings: ["Welcome"],
      links: [],
      images: [],
      contacts: [{ type: "email", value: "sales@example.com", sourceUrl: "https://example.com" }],
      priceSignals: [],
      depth: 0
    }
  ],
  detectedLanguage: "en",
  contacts: [{ type: "email", value: "sales@example.com", sourceUrl: "https://example.com" }],
  productCategories: [{ name: "Accessories", productCount: 3, evidenceUrls: ["https://example.com"], keywords: ["case", "charger"] }],
  productCount: 3,
  products: [
    {
      name: "Phone Case",
      category: "Accessories",
      description: "Durable phone case",
      keywords: ["case"],
      evidenceUrls: ["https://example.com"],
      imageUrls: [],
      priceSignals: [],
      confidence: 80
    }
  ],
  websiteCompleteness: 75,
  pricePositioning: "mid",
  missingCategories: [],
  cooperationOpportunities: ["OEM partnership potential"],
  risks: ["Limited contact info"]
};

function run() {
  // ── Non-JSON returns ok=false ──
  {
    const result = parseWebsiteAiInsights("not json at all", baseResult);
    assert.equal(result.ok, false, "non-JSON should not succeed");
    assert.equal(result.reason, "INVALID_JSON", "reason should be INVALID_JSON");
    assert.ok(result.warnings.length > 0, "should contain warning");
    // fallback should still have usable data from crawler result
    assert.ok(result.fallback.business_summary.length > 0, "fallback has business summary");
    assert.ok(result.fallback.customer_profile.length > 0, "fallback has customer profile");
  }

  // ── Empty string returns ok=false ──
  {
    const result = parseWebsiteAiInsights("", baseResult);
    assert.equal(result.ok, false, "empty string should not succeed");
    assert.equal(result.reason, "INVALID_JSON");
  }

  // ── Empty object missing required fields returns ok=false ──
  {
    const result = parseWebsiteAiInsights("{}", baseResult);
    assert.equal(result.ok, false, "empty JSON object missing required fields");
    assert.equal(result.reason, "MISSING_REQUIRED_FIELDS");
    assert.ok(result.fallback.business_summary.length > 0, "fallback populated from crawler data");
  }

  // ── Object missing main_business (only business_summary) returns ok=false ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({ business_summary: "A test company summary." }),
      baseResult
    );
    assert.equal(result.ok, false, "missing main_business triggers MISSING_REQUIRED_FIELDS");
    assert.equal(result.reason, "MISSING_REQUIRED_FIELDS");
  }

  // ── Object missing business_summary (only main_business) returns ok=false ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({ main_business: "They sell accessories." }),
      baseResult
    );
    assert.equal(result.ok, false, "missing business_summary triggers MISSING_REQUIRED_FIELDS");
    // fallback main_business should still be populated
    assert.ok(result.fallback.main_business.length > 0, "fallback main_business from crawler");
  }

  // ── Valid minimal JSON returns ok=true ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "A leading accessory brand.",
        main_business: "Phone accessories manufacturing and retail."
      }),
      baseResult
    );
    assert.equal(result.ok, true, "valid minimal JSON should succeed");
    assert.ok(result.data.business_summary.length > 0);
    assert.ok(result.data.main_business.length > 0);
    // Optional fields should have fallback values from crawler
    assert.ok(result.data.customer_profile.length > 0, "customer_profile fallback populated");
    assert.ok(result.data.cooperation_opportunities.length > 0, "cooperation_opportunities fallback from crawler");
    assert.ok(result.data.evidence_pages.length > 0, "evidence_pages fallback from crawler pages");
    assert.equal(result.data.evidence_pages[0].sourceId, "page:0", "fallback evidence_pages include sourceId");
  }

  // ── Full valid JSON returns ok=true with all fields preserved ──
  {
    const fullJson = {
      business_summary: "A premium accessories OEM with 20 years of experience.",
      customer_profile: "Mid-to-high-end consumer electronics accessories brand.",
      main_business: "Design and manufacture of phone cases, chargers, and cables.",
      product_line_analysis: "Three main lines: cases, chargers, cables.",
      brand_positioning: "Premium lifestyle accessories brand targeting 25-40 urban consumers.",
      market_channel_signals: "Sells through Amazon, Shopify, and own website.",
      oem_opportunity_assessment: "Looking for new material suppliers and packaging partners.",
      cooperation_opportunities: ["Offer custom packaging solutions.", "Propose new eco-friendly materials."],
      sales_entry_points: ["Reference their latest product line and suggest complementary categories."],
      suggested_next_actions: ["Send product catalog.", "Schedule intro call with procurement."],
      risk_notes: ["Limited financial data available.", "Website only shows retail pricing."],
      evidence_pages: [
        { title: "Product Catalog", url: "https://example.com/products", reason: "Shows full product range" },
        { title: "About Us", url: "https://example.com/about", reason: "Company background and history" }
      ],
      missing_categories_gap: [
        {
          category: "Wireless Chargers",
          customer_has: "Not shown on website",
          we_can_supply: "Yes, Qi-certified wireless chargers",
          opportunity_score: 8,
          reason: "Growing market demand, complements their cable line",
          data_quality_note: ""
        }
      ],
      price_competitiveness: {
        level: "neutral",
        summary: "Customer retail prices are comparable to market average.",
        price_nature_note: "Prices observed are MSRP, not B2B wholesale."
      },
      unknown_factors: ["Procurement cycle", "Order volume", "Decision maker contact"],
      our_data_quality_note: ""
    };

    const result = parseWebsiteAiInsights(JSON.stringify(fullJson), baseResult);
    assert.equal(result.ok, true, "full valid JSON should succeed");
    assert.equal(result.data.business_summary, fullJson.business_summary);
    assert.equal(result.data.main_business, fullJson.main_business);
    assert.equal(result.data.cooperation_opportunities.length, 2);
    assert.equal(result.data.evidence_pages.length, 2);
    assert.equal(result.data.missing_categories_gap!.length, 1);
    assert.equal(result.data.missing_categories_gap![0].category, "Wireless Chargers");
    assert.equal(result.data.missing_categories_gap![0].opportunity_score, 8);
    assert.equal(result.data.price_competitiveness.level, "neutral");
    assert.equal(result.data.unknown_factors!.length, 3);
  }

  // ── Invalid price_competitiveness level falls back to unknown ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        price_competitiveness: { level: "invalid", summary: "test", price_nature_note: "" }
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.price_competitiveness.level, "unknown", "invalid level defaults to unknown");
  }

  // ── Invalid missing_categories_gap item without category is filtered ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        missing_categories_gap: [
          { we_can_supply: "Yes", opportunity_score: 7 },
          { category: "Valid Category", we_can_supply: "Yes", opportunity_score: 6 }
        ]
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.missing_categories_gap!.length, 1, "item without category is filtered out");
    assert.equal(result.data.missing_categories_gap![0].category, "Valid Category");
  }

  // ── Array fields accept arrays and return them ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        cooperation_opportunities: ["Op A", "Op B"],
        sales_entry_points: ["Point 1"],
        risk_notes: []
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.cooperation_opportunities.length, 2);
    assert.equal(result.data.sales_entry_points.length, 1);
    assert.equal(result.data.risk_notes.length, 1, "empty array falls back to crawler risk data");
  }

  // ── null/undefined for array fields uses crawler fallback ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        cooperation_opportunities: null,
        risk_notes: null
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.cooperation_opportunities.length > 0, "null array falls back to crawler data");
    assert.ok(result.data.risk_notes.length > 0, "null risk_notes falls back to crawler data");
  }

  // ── evidence_pages with valid sourceId are preserved ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        evidence_pages: [
          { sourceId: "page:0", title: "Home", url: "https://example.com", reason: "Valid page" }
        ]
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.evidence_pages.length, 1, "evidence page with valid sourceId is preserved");
    assert.equal(result.data.evidence_pages[0].title, "Example Home");
    assert.equal(result.data.evidence_pages[0].sourceId, "page:0", "valid sourceId is preserved in evidence page");
  }

  // ── evidence_pages with invalid sourceId are discarded, falls back to crawler pages ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        evidence_pages: [
          { sourceId: "page:999", title: "Ghost", url: "https://example.com/ghost", reason: "Invalid ref" }
        ]
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes("page:999")), "warning mentions invalid sourceId");
    // Falls back to crawler pages when all AI-supplied evidence pages are discarded
    assert.equal(result.data.evidence_pages.length, 1, "falls back to crawler evidence pages");
    assert.equal(result.data.evidence_pages[0].url, "https://example.com", "fallback page is from crawler result");
    assert.equal(result.data.evidence_pages[0].sourceId, "page:0", "fallback page includes correct original sourceId");
  }

  // ── evidence_pages without sourceId still accepted by URL ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        evidence_pages: [
          { title: "No Source", url: "https://example.com/nosource", reason: "No sourceId" }
        ]
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.evidence_pages.length, 1, "evidence page without sourceId is kept by URL");
    assert.equal(result.data.evidence_pages[0].sourceId, undefined, "no sourceId when AI didn't provide one");
  }

  // ── evidence_pages with mixed valid/invalid/no sourceId ──
  {
    const result = parseWebsiteAiInsights(
      JSON.stringify({
        business_summary: "Test.",
        main_business: "Test business.",
        evidence_pages: [
          { sourceId: "page:0", title: "Valid", url: "https://example.com", reason: "OK" },
          { sourceId: "page:999", title: "Invalid", url: "https://example.com/bad", reason: "Bad" },
          { title: "No Id", url: "https://example.com/noid", reason: "Legacy" }
        ]
      }),
      baseResult
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.evidence_pages.length, 2, "only invalid sourceId page is discarded");
    assert.equal(result.data.evidence_pages[0].sourceId, "page:0", "valid sourceId preserved in mixed set");
    assert.equal(result.data.evidence_pages[1].sourceId, undefined, "no-sourceId page has undefined sourceId");
    assert.ok(result.warnings.some((w) => w.includes("page:999")), "warning for invalid sourceId");
  }

  // ── fallbackWebsiteAiInsights builds from crawler result ──
  {
    const fallback = fallbackWebsiteAiInsights(baseResult);
    assert.ok(fallback.business_summary.includes("Accessories"), "fallback summary mentions categories");
    assert.ok(fallback.main_business.includes("Accessories"), "fallback main_business mentions categories");
    assert.equal(fallback.cooperation_opportunities.length, 1, "fallback uses crawler opportunities");
    assert.equal(fallback.risk_notes.length, 1, "fallback uses crawler risks");
    assert.equal(fallback.price_competitiveness.level, "unknown", "fallback price level is unknown");
    assert.equal(fallback.unknown_factors.length, 6, "fallback includes standard unknown factors");
    assert.ok(fallback.evidence_pages.length > 0, "fallback evidence pages from crawler pages");
  }

  // ── fallback with empty result still returns usable structure ──
  {
    const empty: WebsiteAnalysisResult = {
      crawledUrls: [],
      pages: [],
      contacts: [],
      productCategories: [],
      products: [],
      missingCategories: [],
      cooperationOpportunities: [],
      risks: []
    };
    const fallback = fallbackWebsiteAiInsights(empty);
    assert.ok(fallback.business_summary.length > 0, "fallback summary even with empty crawler data");
    assert.ok(fallback.customer_profile.length > 0, "fallback profile even with empty data");
    assert.ok(Array.isArray(fallback.cooperation_opportunities), "fallback opportunities is array");
    assert.ok(Array.isArray(fallback.evidence_pages), "fallback evidence pages is array");
    assert.equal(fallback.missing_categories_gap!.length, 0, "no missing categories without data");
  }

  console.log("website-ai-insight.parser.spec.ts OK");
}

void run();
