import type { ParseResult } from "../../ai/ai-generation.types";
import type { ResearchContextLike } from "../builders/research-context-builder";
import {
  RESEARCH_RECOMMENDATION_FIELDS,
  RESEARCH_SECTION_LABELS,
  RESEARCH_SECTION_ORDER,
  RESEARCH_STRUCTURED_SECTION_SCHEMA,
  type ResearchSectionKey
} from "../research-report-schema";

export type ResearchParsedOutput = {
  title: string;
  sections: Record<string, unknown>;
  source_basis: unknown;
  markdown_report: string;
};

export function parseResearchOutput(content: string, customerName: string, searchWarning?: string): ParseResult<ResearchParsedOutput> {
  const warnings: string[] = [];
  const parsed = safeJson(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "INVALID_JSON",
      fallback: fallbackResearchOutput(customerName, searchWarning),
      warnings: ["AI returned invalid JSON for research report"]
    };
  }

  const record = parsed as Record<string, unknown>;
  const sections = asRecord(record.sections);
  const markdown = asText(record.markdown_report);

  let output: ResearchParsedOutput;

  if (Object.keys(sections).length) {
    const normalizedSections = normalizeSections(sections);
    output = {
      title: asText(record.title) || `${customerName} 客户背调报告`,
      sections: normalizedSections,
      source_basis: record.source_basis ?? [],
      markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(customerName, normalizedSections, searchWarning)
    };
  } else {
    const legacySections = {
      company_basic_info: toStructuredSection("company_basic_info", record.company_basic_info),
      background_history: toStructuredSection("background_history", record.background_history),
      core_business_product_lines: toStructuredSection("core_business_product_lines", record.core_business_product_lines),
      market_competition: toStructuredSection("market_competition", record.market_competition),
      brand_marketing: toStructuredSection("brand_marketing", record.brand_marketing),
      price_positioning: toStructuredSection("price_positioning", record.price_positioning),
      website_product_analysis: toStructuredSection("website_product_analysis", record.website_product_analysis),
      summary_development_recommendations: normalizeRecommendationSection({
        recommended_products: record.development_recommendations,
        email_entry_points: record.next_actions,
        cooperation_opportunities: record.oem_odm_opportunities,
        potential_risks: record.risks,
        next_actions: record.next_actions
      })
    };
    output = {
      title: asText(record.title) || `${customerName} 客户背调报告`,
      sections: legacySections,
      source_basis: record.source_basis ?? [],
      markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(customerName, legacySections, searchWarning)
    };
  }

  if (!output.markdown_report || output.markdown_report.length < 50) {
    warnings.push("Markdown report is too short or empty");
  }

  const deadSections = requiredSections.filter((key) => !isSectionMeaningful(key, output.sections[key]));
  if (deadSections.length >= 5) {
    return {
      ok: false,
      reason: "MISSING_REQUIRED_FIELDS",
      fallback: fallbackResearchOutput(customerName, searchWarning),
      warnings: [...warnings, `${deadSections.length}/${requiredSections.length} sections empty or missing: ${deadSections.join(", ")}`]
    };
  }
  if (deadSections.length >= 3) {
    warnings.push(`${deadSections.length}/${requiredSections.length} sections empty or missing: ${deadSections.join(", ")}`);
  }

  return { ok: true, data: output, warnings };
}

function fallbackResearchOutput(customerName: string, searchWarning?: string): ResearchParsedOutput {
  const sections = {
    company_basic_info: emptyStructuredSection("company_basic_info", "AI 生成失败，无法提供客户基本信息分析。"),
    background_history: emptyStructuredSection("background_history", "AI 生成失败，无法提供企业背景分析。"),
    core_business_product_lines: emptyStructuredSection("core_business_product_lines", "AI 生成失败，无法提供核心业务分析。"),
    market_competition: emptyStructuredSection("market_competition", "AI 生成失败，无法提供市场与竞争分析。"),
    brand_marketing: emptyStructuredSection("brand_marketing", "AI 生成失败，无法提供品牌与营销分析。"),
    price_positioning: emptyStructuredSection("price_positioning", "AI 生成失败，无法提供价格定位分析。"),
    website_product_analysis: emptyStructuredSection("website_product_analysis", "AI 生成失败，无法提供官网产品分析。"),
    summary_development_recommendations: emptyRecommendationSection()
  };
  const title = `${customerName} 客户背调报告`;
  return {
    title,
    sections,
    source_basis: [],
    markdown_report: buildMarkdownReportV2(customerName, sections, searchWarning)
  };
}

// ── Section validation ──

const requiredSections = [
  ...RESEARCH_SECTION_ORDER
];

function isSectionMeaningful(key: string, value: unknown): boolean {
  const section = asRecord(value);
  if (key === "summary_development_recommendations") {
    if (asText(section.customer_value_rating) && !asText(section.customer_value_rating).includes("待评估")) return true;
    if (asText(section.development_priority) && !asText(section.development_priority).includes("待评估")) return true;
    for (const field of ["recommended_products", "email_entry_points", "cooperation_opportunities", "potential_risks", "next_actions"]) {
      if (asStringList(section[field]).length > 0) return true;
    }
    return false;
  }
  for (const field of getStructuredFields(key)) {
    if (field.kind === "list" && asStringList(section[field.key]).length > 0) return true;
    if (field.kind === "text" && asText(section[field.key]).trim().length > 0) return true;
  }
  if (asStringList(section.confirmed_facts).length > 0) return true;
  if (asText(section.analysis).trim().length > 0) return true;
  if (asStringList(section.missing_info).length > 0) return true;
  return false;
}

// ── Section normalization ──

const SECTION_KEYS = RESEARCH_SECTION_ORDER.filter(
  (key): key is Exclude<ResearchSectionKey, "summary_development_recommendations"> =>
    key !== "summary_development_recommendations"
);

function normalizeSections(sections: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) {
    normalized[key] = toStructuredSection(key, sections[key]);
  }
  normalized.summary_development_recommendations = normalizeRecommendationSection(sections.summary_development_recommendations);
  return normalized;
}

function toStructuredSection(
  key: Exclude<ResearchSectionKey, "summary_development_recommendations">,
  value: unknown
): Record<string, unknown> {
  if (typeof value === "string") return emptyStructuredSection(key, value);
  if (Array.isArray(value)) return { ...emptyStructuredSection(key), confirmed_facts: asStringList(value) };

  const obj = asRecord(value);
  const section = emptyStructuredSection(key);
  for (const field of RESEARCH_STRUCTURED_SECTION_SCHEMA[key]) {
    section[field.key] = field.kind === "list" ? asStringList(obj[field.key]) : asStructuredText(obj[field.key]);
  }
  return {
    ...section,
    confirmed_facts: asStringList(obj.confirmed_facts),
    analysis: asText(obj.analysis) || asText(obj.summary),
    missing_info: asStringList(obj.missing_info)
  };
}

function emptyStructuredSection(
  key: Exclude<ResearchSectionKey, "summary_development_recommendations">,
  analysis = ""
): Record<string, unknown> {
  const section: Record<string, unknown> = {};
  for (const field of RESEARCH_STRUCTURED_SECTION_SCHEMA[key]) {
    section[field.key] = field.kind === "list" ? [] : "";
  }
  return { ...section, confirmed_facts: [], analysis, missing_info: [] };
}

function normalizeRecommendationSection(value: unknown) {
  const obj = asRecord(value);
  const section = emptyRecommendationSection();
  for (const field of RESEARCH_RECOMMENDATION_FIELDS) {
    section[field.key] = field.kind === "list" ? asStringList(obj[field.key]) : asStructuredText(obj[field.key]);
  }
  return section;
}

function emptyRecommendationSection(): Record<string, unknown> {
  const section: Record<string, unknown> = {};
  for (const field of RESEARCH_RECOMMENDATION_FIELDS) {
    section[field.key] = field.kind === "list" ? [] : field.key.includes("rating") || field.key.includes("priority") ? "待评估" : "";
  }
  return section;
}

function getStructuredFields(key: string) {
  return RESEARCH_STRUCTURED_SECTION_SCHEMA[key as Exclude<ResearchSectionKey, "summary_development_recommendations">] ?? [];
}

function asStructuredText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return asStringList(value).join("；");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return renderInlineValue(value);
}

// ── Markdown builders ──

export function buildMarkdownReportV2(customerName: string, sections: Record<string, unknown>, warning?: string) {
  const bodyParts: string[] = [];
  for (const key of RESEARCH_SECTION_ORDER) {
    const label = RESEARCH_SECTION_LABELS[key];
    const section = asRecord(sections[key]);
    bodyParts.push(`## ${label}`);

    if (key === "summary_development_recommendations") {
      const valueRating = asText(section.customer_value_rating);
      const priority = asText(section.development_priority);
      bodyParts.push(`**客户价值评级**：${valueRating || "待评估"} | **开发优先级**：${priority || "待评估"}`);
      for (const field of RESEARCH_RECOMMENDATION_FIELDS.filter((item) => item.kind === "list")) {
        const fieldKey = field.key;
        const items = asStringList(section[fieldKey]);
        bodyParts.push(`### ${field.label}`);
        bodyParts.push(items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无明确结论。");
      }
      continue;
    }

    const structuredFields = renderStructuredFields(key, section);
    if (structuredFields.length) {
      bodyParts.push("**结构化字段**：");
      bodyParts.push(structuredFields.join("\n"));
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

function renderStructuredFields(key: string, section: Record<string, unknown>) {
  return getStructuredFields(key).map((field) => {
    const value = section[field.key];
    if (field.kind === "list") {
      const items = asStringList(value);
      return `- ${field.label}：${items.length ? items.join("；") : "未从现有来源确认"}`;
    }
    const text = asText(value);
    return `- ${field.label}：${text || "未从现有来源确认"}`;
  });
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
