import type { WebsiteAnalysisResult } from "@oem-crm/shared";
import type { ParseResult } from "../../ai/ai-generation.types";
import type { WebsiteAiInsights } from "../website-analysis.types";

// ── Main parse function ──

export function parseWebsiteAiInsights(
  content: string,
  result: WebsiteAnalysisResult
): ParseResult<WebsiteAiInsights> {
  const warnings: string[] = [];
  const parsed = safeJson(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "INVALID_JSON",
      fallback: fallbackWebsiteAiInsights(result),
      warnings: ["AI returned invalid JSON"]
    };
  }

  const record = parsed as Record<string, unknown>;
  const businessSummary = asText(record.business_summary);
  const mainBusiness = asText(record.main_business);

  const insights = buildParsedInsights(record, result, warnings);

  if (!businessSummary || !mainBusiness) {
    return {
      ok: false,
      reason: "MISSING_REQUIRED_FIELDS",
      fallback: insights,
      warnings: [...warnings, "Missing required fields: business_summary or main_business"]
    };
  }

  return { ok: true, data: insights, warnings };
}

// ── Internal builder ──

function buildParsedInsights(
  record: Record<string, unknown>,
  result: WebsiteAnalysisResult,
  warnings: string[]
): WebsiteAiInsights {
  return {
    business_summary: asText(record.business_summary) || fallbackBusinessSummary(result),
    customer_profile: asText(record.customer_profile) || "官网未明确展示完整客户画像。",
    main_business: asText(record.main_business) || fallbackMainBusiness(result),
    product_line_analysis: asText(record.product_line_analysis) || fallbackProductLine(result),
    brand_positioning: asText(record.brand_positioning) || result.pricePositioning || "官网未明确展示。",
    market_channel_signals: asText(record.market_channel_signals) || "官网未明确展示渠道信息。",
    oem_opportunity_assessment: asText(record.oem_opportunity_assessment) || "可结合品牌页、产品线和联系方式进一步确认OEM/ODM合作机会。",
    cooperation_opportunities: asStringArray(record.cooperation_opportunities, result.cooperationOpportunities),
    sales_entry_points: asStringArray(record.sales_entry_points, ["引用官网品牌/产品线信息，先询问其新品开发或补充供应需求。"]),
    suggested_next_actions: asStringArray(record.suggested_next_actions, ["补充关键联系人。", "确认其采购模式和目标品类。"]),
    risk_notes: asStringArray(record.risk_notes, result.risks),
    evidence_pages: asEvidencePages(record.evidence_pages, result, warnings),
    missing_categories_gap: asMissingCategoriesGap(record.missing_categories_gap),
    price_competitiveness: asPriceCompetitiveness(record.price_competitiveness),
    unknown_factors: asStringArray(record.unknown_factors, [
      "采购周期", "实际采购量级", "当前供应商关系",
      "关键决策人联系方式", "预算范围", "认证要求"
    ]),
    our_data_quality_note: asText(record.our_data_quality_note) || ""
  };
}

// ── Fallback ──

export function fallbackWebsiteAiInsights(result: WebsiteAnalysisResult): WebsiteAiInsights {
  return {
    business_summary: fallbackBusinessSummary(result),
    customer_profile: "官网展示了品牌、产品/行业页面和联系方式，适合先作为品牌型或渠道型潜在客户跟进；更多企业规模与采购模式需补充公开搜索或人工确认。",
    main_business: fallbackMainBusiness(result),
    product_line_analysis: fallbackProductLine(result),
    brand_positioning: result.pricePositioning || "官网未明确展示价格定位。",
    market_channel_signals: "官网现有内容可见品牌与零售相关信号，但渠道、采购模式和核心品类仍需人工确认。",
    oem_opportunity_assessment: "适合用\"产品开发、包装设计、私标/定制补充、稳定供货\"作为首轮试探方向。",
    cooperation_opportunities: result.cooperationOpportunities,
    sales_entry_points: ["引用官网品牌/产品线信息开场，避免模板化开发。", "优先询问其新品开发、补充品类或供应链备选需求。"],
    suggested_next_actions: ["补充采购/产品负责人邮箱或LinkedIn。", "确认目标品类后再生成个性化英文开发邮件。"],
    risk_notes: result.risks,
    evidence_pages: asEvidencePages([], result, []),
    missing_categories_gap: [],
    price_competitiveness: {
      level: "unknown",
      summary: "客户官网价格通常为零售价或MSRP，或缺少可确认的B2B/wholesale/trade价格信号，暂不进行价格竞争力判断。",
      price_nature_note: "注意：客户官网价格通常为零售价或MSRP，与我方OEM供货价不属于同一价格体系。只有出现wholesale、trade price、distributor price等B2B价格信号时，才可做方向性比较。"
    },
    unknown_factors: ["采购周期", "实际采购量级", "当前供应商关系", "关键决策人联系方式", "预算范围", "认证要求"],
    our_data_quality_note: ""
  };
}

// ── Helpers ──

function safeJson(input: string) {
  try { return JSON.parse(input); } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try { return JSON.parse(match[0]); } catch { return undefined; }
  }
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length ? items : fallback;
}

function fallbackBusinessSummary(result: WebsiteAnalysisResult) {
  const categories = result.productCategories.map((item) => item.name).filter(Boolean).slice(0, 4);
  const contacts = result.contacts.some((contact) => contact.type === "email") ? "官网留有公开邮箱" : "官网公开联系方式有限";
  return `官网显示该客户具备品牌/产品展示页面，当前识别到${categories.length ? ` ${categories.join("、")} 等方向` : "若干产品或业务方向"}，${contacts}。建议作为潜在OEM/ODM开发对象继续补充联系人和采购模式信息。`;
}

function fallbackMainBusiness(result: WebsiteAnalysisResult) {
  const categories = result.productCategories.map((item) => item.name).filter(Boolean);
  return categories.length ? `官网识别到的主营/展示方向包括：${categories.join("、")}。` : "官网未识别到清晰产品分类。";
}

function fallbackProductLine(result: WebsiteAnalysisResult) {
  if (!result.productCategories.length) return "官网未识别到清晰产品线，需要人工查看产品页或补充官网内容。";
  return result.productCategories
    .map((item) => `${item.name}${item.keywords?.length ? `（关键词：${item.keywords.slice(0, 5).join("、")}）` : ""}`)
    .join("；");
}

function asEvidencePages(value: unknown, result: WebsiteAnalysisResult, warnings: string[]) {
  const sourceIndex = buildResultSourceIndex(result);
  if (Array.isArray(value)) {
    const pages = value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const record = item as Record<string, unknown>;
        const sourceId = asText(record.sourceId);
        const aiUrl = asText(record.url);

        if (sourceId && !sourceIndex.has(sourceId)) {
          warnings.push(`AI referenced unknown sourceId "${sourceId}" in evidence_pages — discarded`);
          return undefined;
        }

        if (sourceId) {
          const canonical = sourceIndex.get(sourceId)!;
          if (canonical.canonicalUrl && canonical.canonicalUrl !== aiUrl) {
            warnings.push(`AI URL for sourceId "${sourceId}" differs from canonical — using canonical`);
          }
          const url = canonical.canonicalUrl || aiUrl;
          if (!url) return undefined;
          return {
            sourceId,
            title: canonical.canonicalTitle || asText(record.title) || url,
            url,
            reason: asText(record.reason) || "官网有效页面"
          };
        }

        if (!aiUrl) return undefined;
        return {
          sourceId: undefined,
          title: asText(record.title) || aiUrl,
          url: aiUrl,
          reason: asText(record.reason) || "官网有效页面"
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (pages.length) return pages.slice(0, 8);
  }
  return result.pages
    .map((page, i) => ({ page, originalIndex: i }))
    .filter(({ page }) => !page.errorMessage)
    .slice(0, 8)
    .map(({ page, originalIndex }) => ({
      sourceId: `page:${originalIndex}`,
      title: page.title || page.url,
      url: page.url,
      reason: `${page.pageType} 页面用于支撑客户分析`
    }));
}

function buildResultSourceIndex(result: WebsiteAnalysisResult): Map<string, { canonicalUrl: string; canonicalTitle: string }> {
  const index = new Map<string, { canonicalUrl: string; canonicalTitle: string }>();
  result.pages.forEach((page, i) => index.set(`page:${i}`, { canonicalUrl: page.url, canonicalTitle: page.title || page.url }));
  result.products.forEach((product, i) => index.set(`product:${i}`, { canonicalUrl: product.evidenceUrls?.[0] ?? "", canonicalTitle: product.name }));
  result.contacts.forEach((contact, i) => index.set(`contact:${i}`, { canonicalUrl: contact.sourceUrl ?? "", canonicalTitle: `${contact.type}: ${contact.value}` }));
  return index;
}

function asMissingCategoriesGap(value: unknown): WebsiteAiInsights["missing_categories_gap"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const category = asText(record.category);
      if (!category) return undefined;
      return {
        category,
        customer_has: asText(record.customer_has) || "未明确展示",
        we_can_supply: asText(record.we_can_supply) || "需人工确认",
        opportunity_score: typeof record.opportunity_score === "number" && record.opportunity_score >= 1 && record.opportunity_score <= 10 ? record.opportunity_score : 5,
        reason: asText(record.reason) || "基于官网产品类目与我方产能的交叉比对",
        data_quality_note: asText(record.data_quality_note) || ""
      };
    })
    .filter((item): item is WebsiteAiInsights["missing_categories_gap"][number] => Boolean(item))
    .slice(0, 10);
}

function asPriceCompetitiveness(value: unknown): WebsiteAiInsights["price_competitiveness"] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const { level } = record;
    if (level === "competitive" || level === "neutral" || level === "challenging" || level === "unknown") {
      return {
        level,
        summary: asText(record.summary) || "未提供价格竞争力摘要。",
        price_nature_note: asText(record.price_nature_note) || "注意：客户官网价格通常为零售价或MSRP，与我方OEM供货价不属于同一价格体系。"
      };
    }
  }
  return {
    level: "unknown",
    summary: "客户官网价格通常为零售价或MSRP，或缺少可确认的B2B/wholesale/trade价格信号，暂不进行价格竞争力判断。",
    price_nature_note: "注意：客户官网价格通常为零售价或MSRP，与我方OEM供货价不属于同一价格体系。"
  };
}
