import type { ResearchContextLike } from "../builders/research-context-builder";

export function parseResearchOutput(content: string, customerName: string, searchWarning?: string) {
  const parsed = safeJson(content);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const sections = asRecord(record.sections);
    const markdown = asText(record.markdown_report);
    if (Object.keys(sections).length) {
      const normalizedSections = normalizeSections(sections);
      return {
        title: asText(record.title) || `${customerName} 客户背调报告`,
        sections: normalizedSections,
        source_basis: record.source_basis ?? [],
        markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(customerName, normalizedSections, searchWarning)
      };
    }
    const legacySections = {
      company_basic_info: toSection(record.company_basic_info),
      background_history: toSection(record.background_history),
      core_business_product_lines: toSection(record.core_business_product_lines),
      market_competition: toSection(record.market_competition),
      brand_marketing: toSection(record.brand_marketing),
      price_positioning: toSection(record.price_positioning),
      website_product_analysis: toSection(record.website_product_analysis),
      summary_development_recommendations: normalizeRecommendationSection({
        recommended_products: record.development_recommendations,
        email_entry_points: record.next_actions,
        cooperation_opportunities: record.oem_odm_opportunities,
        potential_risks: record.risks,
        next_actions: record.next_actions
      })
    };
    return {
      title: asText(record.title) || `${customerName} 客户背调报告`,
      sections: legacySections,
      source_basis: record.source_basis ?? [],
      markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(customerName, legacySections, searchWarning)
    };
  }
  throw new Error(`AI provider returned non-JSON response. Body: ${compactText(content, 500)}`);
}

// ── Section normalization ──

const SECTION_KEYS = [
  "company_basic_info", "background_history", "core_business_product_lines",
  "market_competition", "brand_marketing", "price_positioning", "website_product_analysis"
] as const;

const DIMENSION_LABELS: Record<string, string> = {
  company_basic_info: "一、公司基本信息",
  background_history: "二、企业背景和发展历程",
  core_business_product_lines: "三、核心业务与产品线",
  market_competition: "四、市场表现与竞争格局",
  brand_marketing: "五、品牌策略与营销方式",
  price_positioning: "六、产品价格定位",
  website_product_analysis: "七、官网产品专项分析",
  summary_development_recommendations: "八、总结与开发建议"
};

function normalizeSections(sections: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) {
    normalized[key] = toSection(sections[key]);
  }
  normalized.summary_development_recommendations = normalizeRecommendationSection(sections.summary_development_recommendations);
  return normalized;
}

function toSection(value: unknown): { confirmed_facts: string[]; analysis: string; missing_info: string[] } {
  if (typeof value === "string") return { confirmed_facts: [], analysis: value, missing_info: [] };
  if (Array.isArray(value)) return { confirmed_facts: asStringList(value), analysis: "", missing_info: [] };
  const obj = asRecord(value);
  return {
    confirmed_facts: asStringList(obj.confirmed_facts),
    analysis: asText(obj.analysis) || asText(obj.summary),
    missing_info: asStringList(obj.missing_info)
  };
}

function normalizeRecommendationSection(value: unknown) {
  const obj = asRecord(value);
  return {
    customer_value_rating: asText(obj.customer_value_rating),
    development_priority: asText(obj.development_priority),
    recommended_products: asStringList(obj.recommended_products),
    email_entry_points: asStringList(obj.email_entry_points),
    cooperation_opportunities: asStringList(obj.cooperation_opportunities),
    potential_risks: asStringList(obj.potential_risks),
    next_actions: asStringList(obj.next_actions)
  };
}

// ── Markdown builders ──

export function buildMarkdownReportV2(customerName: string, sections: Record<string, unknown>, warning?: string) {
  const bodyParts: string[] = [];
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const section = asRecord(sections[key]);
    bodyParts.push(`## ${label}`);

    if (key === "summary_development_recommendations") {
      const valueRating = asText(section.customer_value_rating);
      const priority = asText(section.development_priority);
      bodyParts.push(`**客户价值评级**：${valueRating || "待评估"} | **开发优先级**：${priority || "待评估"}`);
      const subSections: Array<[string, string]> = [
        ["推荐供货产品", "recommended_products"], ["邮件切入点", "email_entry_points"],
        ["合作机会", "cooperation_opportunities"], ["潜在风险", "potential_risks"], ["下一步行动", "next_actions"]
      ];
      for (const [subLabel, fieldKey] of subSections) {
        const items = asStringList(section[fieldKey]);
        bodyParts.push(`### ${subLabel}`);
        bodyParts.push(items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无明确结论。");
      }
      continue;
    }

    const confirmedFacts = asStringList(section.confirmed_facts);
    const analysis = asText(section.analysis);
    const missingInfo = asStringList(section.missing_info);
    bodyParts.push("**已确认事实**：");
    bodyParts.push(confirmedFacts.length ? confirmedFacts.map((fact) => `- ${fact}`).join("\n") : "- 未从现有来源确认。");
    bodyParts.push("**分析判断**：");
    bodyParts.push(analysis || "暂无明确分析判断。");
    bodyParts.push("**待补充信息**：");
    bodyParts.push(missingInfo.length ? missingInfo.map((item) => `- ${item}`).join("\n") : "- 暂无。");
  }

  const title = `${customerName} 客户背调报告`;
  return [`# ${title}`, warning ? `> ${warning}` : "", bodyParts.join("\n\n")].filter(Boolean).join("\n\n");
}

// ── Utility functions ──

function safeJson(input: string) {
  try { return JSON.parse(input); } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try { return JSON.parse(match[0]); } catch { return undefined; }
  }
}

function isReadableMarkdown(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !trimmed.startsWith("{") && !trimmed.startsWith("[");
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : renderInlineValue(item))).filter(Boolean);
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function compactText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function renderInlineValue(value: unknown): string {
  if (typeof value === "string") return value.trim() || "暂无明确结论";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(renderInlineValue).filter(Boolean).join("；") || "暂无明确结论";
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && item !== null && item !== "")
      .map(([key, item]) => `${humanizeKey(key)}：${renderInlineValue(item)}`)
      .join("；") || "暂无明确结论";
  }
  return "暂无明确结论";
}

function humanizeKey(key: string) {
  const labels: Record<string, string> = {
    company_name: "公司名称", legal_name: "法定/品牌名称", website: "官网", country: "国家/地区",
    headquarters: "总部/地址", business_model: "业务模式", company_type: "客户类型", customer_type: "客户类型",
    owner: "负责人", contacts: "联系人", summary: "总结", evidence: "依据", risk: "风险",
    severity: "严重程度", description: "说明", action: "行动", rationale: "理由", source: "来源",
    analysis_status: "分析状态", url: "URL", value: "值", name: "名称",
    crawled_pages: "抓取页面", valid_pages: "有效页面", product_count: "产品数量", website_completeness: "官网完整度"
  };
  return labels[key] ?? key.replace(/_/g, " ");
}
