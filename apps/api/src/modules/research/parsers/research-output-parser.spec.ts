import * as assert from "node:assert/strict";
import { parseResearchOutput } from "./research-output-parser";
import { researchSystemPrompt } from "../builders/research-prompt-builder";

const commonSection = {
  confirmed_facts: ["Source-backed fact"],
  analysis: "Source-backed analysis",
  missing_info: []
};

function buildFixedSchemaOutput() {
  return {
    title: "Acme Research Report",
    sections: {
      company_basic_info: {
        ...commonSection,
        company_name: "Acme Outdoor",
        country: "United States",
        website: "https://acme.example",
        company_type: "Brand owner",
        main_business: "Outdoor drinkware",
        sales_markets: ["North America", "Europe"],
        contacts: ["sales@acme.example"],
        social_media_accounts: ["LinkedIn: Acme Outdoor"]
      },
      background_history: {
        ...commonSection,
        founded_year: "2016",
        development_milestones: ["Launched insulated bottle line"],
        brand_evolution: "Expanded from single product to outdoor lifestyle range",
        operating_scale: "Not confirmed",
        market_coverage: ["United States", "EU"]
      },
      core_business_product_lines: {
        ...commonSection,
        main_products: ["Insulated bottles"],
        product_categories: ["Drinkware"],
        hot_products: ["Ultra Bottle"],
        core_selling_points: ["BPA-free", "Leak-proof"],
        oem_odm_fit: "Medium fit"
      },
      market_competition: {
        ...commonSection,
        main_sales_markets: ["United States"],
        benchmark_competitors: ["Hydro Flask"],
        channel_types: ["DTC", "Amazon"],
        market_positioning: "Outdoor lifestyle mid-market",
        supply_chain_needs: ["New seasonal SKUs"]
      },
      brand_marketing: {
        ...commonSection,
        brand_tier: "Mid-range",
        website_visual_style: "Clean outdoor lifestyle photography",
        marketing_messages: ["Reusable hydration"],
        target_audience: ["Outdoor consumers"],
        social_media_activity: "Active on LinkedIn",
        promotion_direction: "Sustainability-led campaigns"
      },
      price_positioning: {
        ...commonSection,
        price_range: "$20-$40",
        tier_judgement: "Mid-range",
        quality_price_match: "Reasonable",
        suitable_supply_grade: "Mid-to-premium"
      },
      website_product_analysis: {
        ...commonSection,
        product_categories: ["Drinkware"],
        product_count: "24",
        image_style: "Lifestyle and white-background mix",
        selling_point_descriptions: ["Insulated", "Reusable"],
        hot_products: ["Ultra Bottle"],
        missing_product_lines: ["Travel mugs"],
        cooperation_entry_opportunities: ["Pitch travel mug line"]
      },
      summary_development_recommendations: {
        customer_value_rating: "中",
        development_priority: "中",
        recommended_products: ["Travel mug"],
        email_entry_points: ["Reference missing travel mug line"],
        cooperation_opportunities: ["Seasonal SKU expansion"],
        potential_risks: ["Pricing fit unconfirmed"],
        next_actions: ["Send short product comparison email"]
      }
    },
    source_basis: [],
    markdown_report: ""
  };
}

function main() {
  const parsed = parseResearchOutput(JSON.stringify(buildFixedSchemaOutput()), "Acme Outdoor");

  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Expected parse success");

  const company = parsed.data.sections.company_basic_info as Record<string, unknown>;
  assert.equal(company.company_name, "Acme Outdoor");
  assert.deepEqual(company.sales_markets, ["North America", "Europe"]);

  const productLines = parsed.data.sections.core_business_product_lines as Record<string, unknown>;
  assert.deepEqual(productLines.hot_products, ["Ultra Bottle"]);
  assert.equal(productLines.oem_odm_fit, "Medium fit");

  assert.ok(parsed.data.markdown_report.includes("Acme Outdoor"));
  assert.ok(parsed.data.markdown_report.includes("Ultra Bottle"));
  assert.ok(parsed.data.markdown_report.includes("Travel mug"));

  const prompt = researchSystemPrompt();
  assert.ok(prompt.includes("company_name"));
  assert.ok(prompt.includes("social_media_accounts"));
  assert.ok(prompt.includes("hot_products"));
  assert.ok(prompt.includes("cooperation_entry_opportunities"));
}

main();
