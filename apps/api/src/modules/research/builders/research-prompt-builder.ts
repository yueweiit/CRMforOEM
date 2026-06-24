import { RESEARCH_PROMPT_BUDGETS, RESEARCH_PROMPT_MAX_CHARS, type ResearchPromptBudget } from "../research.constants";
import type { ResearchContextLike } from "./research-context-builder";

export function researchSystemPrompt() {
  return `你是一名资深外贸OEM/ODM客户开发研究员。
请只根据输入上下文和来源证据生成报告，不要编造未提供的信息。
无法从来源证据确认的信息必须写"未从现有来源确认"，不要估算成立年份、员工人数、认证、合作伙伴或经营数据。

【重要】companyKnowledge 是我方（供应商）的企业资料，只能用于第8维度“总结与开发建议”的合作建议、推荐产品和开发策略，不得用于补充第1-7维度的客户背景事实。
第6维度“产品价格定位”只能描述客户官网或公开资料中的客户侧价格信号；我方价格匹配分析只能放在第8维度。

返回严格JSON对象，结构如下：
{
  "title": "string",
  "sections": {
    "company_basic_info": { "confirmed_facts": ["已确认的事实"], "analysis": "基于现有来源的合理分析", "missing_info": ["待补充信息"] },
    "background_history": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "core_business_product_lines": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "market_competition": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "brand_marketing": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "price_positioning": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "website_product_analysis": { "confirmed_facts": [], "analysis": "", "missing_info": [] },
    "summary_development_recommendations": {
      "customer_value_rating": "客户价值评级（高/中/低）",
      "development_priority": "开发优先级（高/中/低）",
      "recommended_products": ["推荐供货产品"],
      "email_entry_points": ["邮件切入点"],
      "cooperation_opportunities": ["合作机会"],
      "potential_risks": ["潜在风险"],
      "next_actions": ["下一步行动"]
    }
  },
  "source_basis": [{"section": "维度名", "source": "来源类型", "evidence": "具体依据"}],
  "markdown_report": "中文Markdown格式的完整报告，面向业务员和销售主管"
}

第1-7维度的 confirmed_facts 必须是已从来源证据中直接验证的事实，analysis 是基于来源的合理推断，missing_info 是当前无法确认但值得关注的信息。
第8维度 summary_development_recommendations 可以使用 companyKnowledge 中的我方资料来生成合作建议。
请控制总输出在3000个中文字符以内，确保JSON完整闭合，不要输出多余解释。
markdown_report 必须是中文Markdown，面向业务员和销售主管，可直接阅读。
source_basis 要列出每个维度用到的官网URL、公开搜索结果URL或CRM资料说明。`;
}

export function buildResearchPromptUserInput(context: ResearchContextLike & { promptVersion?: string; salesNotes?: string }) {
  for (const budget of RESEARCH_PROMPT_BUDGETS) {
    const serialized = stableStringify(buildResearchPromptInput(context, budget));
    if (serialized.length <= RESEARCH_PROMPT_MAX_CHARS) return serialized;
  }

  const minimalSerialized = stableStringify(buildMinimalResearchPromptInput(context));
  if (minimalSerialized.length <= RESEARCH_PROMPT_MAX_CHARS) return minimalSerialized;

  const emergencySerialized = stableStringify(buildEmergencyResearchPromptInput(context));
  if (emergencySerialized.length <= RESEARCH_PROMPT_MAX_CHARS) return emergencySerialized;

  const absoluteMinimumSerialized = stableStringify({
    promptVersion: compactText(context.promptVersion, 20),
    customer: { name: compactText(context.customer.name, 20) },
    inputWarning: `Prompt context exceeded ${RESEARCH_PROMPT_MAX_CHARS} characters and was reduced to minimum evidence.`
  });
  if (absoluteMinimumSerialized.length > RESEARCH_PROMPT_MAX_CHARS) {
    throw new Error(`Research prompt context exceeds ${RESEARCH_PROMPT_MAX_CHARS} characters after compaction.`);
  }
  return absoluteMinimumSerialized;
}

export function compactResearchRunInput(context: ResearchContextLike & { promptVersion?: string; salesNotes?: string }) {
  return {
    promptVersion: context.promptVersion,
    customer: context.customer,
    salesNotes: context.salesNotes,
    websiteAnalysis: compactWebsiteAnalysis(context),
    publicSearch: {
      enabled: context.publicSearch.enabled,
      warning: context.publicSearch.warning,
      topResults: context.publicSearch.results?.slice(0, 5).map((item) => ({ title: item.title, url: item.url }))
    },
    companyKnowledge: {
      productSamples: context.companyKnowledge?.products?.slice(0, 8).map((item) => ({ name: item.name, category: item.category })),
      capabilitySamples: context.companyKnowledge?.capabilities?.slice(0, 6).map((item) => ({ name: item.name, category: item.category })),
      caseStudySamples: context.companyKnowledge?.caseStudies?.slice(0, 5).map((item) => ({ title: item.title, market: item.market, category: item.category }))
    },
    inputSummary: {
      contactCount: context.contacts?.length ?? 0,
      companyProductCount: context.companyKnowledge?.products?.length ?? 0,
      companyCapabilityCount: context.companyKnowledge?.capabilities?.length ?? 0,
      companyCaseStudyCount: context.companyKnowledge?.caseStudies?.length ?? 0,
      publicSearchEnabled: context.publicSearch.enabled,
      publicSearchResultCount: context.publicSearch.results?.length ?? 0,
      websiteAnalysisStatus: context.websiteSummary?.status ?? null,
      websitePageCount: context.websiteSummary?.pages?.length ?? 0,
      websiteProductCount: context.websiteSummary?.productCount ?? null,
      websiteCompleteness: context.websiteSummary?.websiteCompleteness ?? null,
      websiteInsightKeys: context.websiteInsights ? Object.keys(context.websiteInsights).sort() : []
    },
    sourceEvidence: context.sourceEvidence
  };
}

// ── Internal helpers ──

function buildResearchPromptInput(
  context: ResearchContextLike & { promptVersion?: string; salesNotes?: string },
  budget: ResearchPromptBudget = RESEARCH_PROMPT_BUDGETS[0]
) {
  return {
    promptVersion: compactText(context.promptVersion, 80),
    customer: compactCustomer(context.customer, 240),
    contacts: context.contacts?.slice(0, budget.contacts).map((contact) => ({
      name: compactText(contact.name, 80), title: compactText(contact.title, 80),
      email: compactText(contact.email, 120), qualityScore: contact.qualityScore
    })),
    websiteSummary: compactWebsiteAnalysis(context, budget),
    publicSearch: {
      enabled: context.publicSearch.enabled,
      warning: compactText(context.publicSearch.warning, 180),
      results: context.publicSearch.results?.slice(0, budget.searchResults).map((item) => ({
        title: compactText(item.title, budget.searchTitleChars),
        url: compactText(item.url, 240),
        snippet: compactText(item.snippet, budget.searchSnippetChars)
      }))
    },
    companyKnowledge: {
      products: context.companyKnowledge?.products?.slice(0, budget.products).map((item) => ({
        name: compactText(item.name, 120), category: compactText(item.category, 80),
        description: compactText(item.description, budget.productDescriptionChars),
        tags: item.tags?.slice(0, 6).map((tag) => compactText(tag, 40)) ?? []
      })),
      capabilities: context.companyKnowledge?.capabilities?.slice(0, budget.capabilities).map((item) => ({
        name: compactText(item.name, 120), category: compactText(item.category, 80),
        description: compactText(item.description, budget.capabilityDescriptionChars)
      })),
      caseStudies: context.companyKnowledge?.caseStudies?.slice(0, budget.caseStudies).map((item) => ({
        title: compactText(item.title, 140), market: compactText(item.market, 80),
        category: compactText(item.category, 80), summary: compactText(item.summary, budget.caseStudySummaryChars)
      }))
    },
    salesNotes: compactText(context.salesNotes, budget.salesNotesChars),
    sourceEvidence: compactSourceEvidence(context.sourceEvidence),
    inputBudget: inputBudgetSummary(context)
  };
}

function buildEmergencyResearchPromptInput(context: ResearchContextLike & { promptVersion?: string }) {
  return {
    promptVersion: compactText(context.promptVersion, 80),
    customer: compactCustomer(context.customer, 80),
    websiteSummary: {
      status: context.websiteSummary?.status ?? null,
      productCount: context.websiteSummary?.productCount ?? null,
      websiteCompleteness: context.websiteSummary?.websiteCompleteness ?? null
    },
    publicSearch: { enabled: context.publicSearch.enabled, warning: compactText(context.publicSearch.warning, 120) },
    inputBudget: inputBudgetSummary(context),
    inputWarning: `Prompt context exceeded ${RESEARCH_PROMPT_MAX_CHARS} characters and was reduced to minimal evidence.`
  };
}

function buildMinimalResearchPromptInput(context: ResearchContextLike & { promptVersion?: string; salesNotes?: string }) {
  return {
    promptVersion: compactText(context.promptVersion, 80),
    customer: compactCustomer(context.customer, 120),
    contacts: context.contacts?.slice(0, 2).map((contact) => ({
      name: compactText(contact.name, 60), title: compactText(contact.title, 60), email: compactText(contact.email, 120)
    })),
    websiteSummary: {
      status: context.websiteSummary?.status ?? null,
      productCount: context.websiteSummary?.productCount ?? null,
      pricePositioning: compactText(context.websiteSummary?.pricePositioning, 80),
      websiteCompleteness: context.websiteSummary?.websiteCompleteness ?? null,
      productCategories: compactUnknownList(context.websiteSummary?.productCategories, 3, RESEARCH_PROMPT_BUDGETS[2])
    },
    publicSearch: {
      enabled: context.publicSearch.enabled, warning: compactText(context.publicSearch.warning, 120),
      results: context.publicSearch.results?.slice(0, 1).map((item) => ({
        title: compactText(item.title, 80), url: compactText(item.url, 240)
      }))
    },
    companyKnowledge: {
      products: context.companyKnowledge?.products?.slice(0, 3).map((item) => ({
        name: compactText(item.name, 100), category: compactText(item.category, 80)
      })),
      capabilities: context.companyKnowledge?.capabilities?.slice(0, 2).map((item) => ({
        name: compactText(item.name, 100), category: compactText(item.category, 80)
      })),
      caseStudies: context.companyKnowledge?.caseStudies?.slice(0, 1).map((item) => ({
        title: compactText(item.title, 120), market: compactText(item.market, 80), category: compactText(item.category, 80)
      }))
    },
    salesNotes: compactText(context.salesNotes, 200),
    sourceEvidence: compactSourceEvidence(context.sourceEvidence),
    inputBudget: inputBudgetSummary(context),
    inputWarning: `Prompt context exceeded ${RESEARCH_PROMPT_MAX_CHARS} characters and was reduced.`
  };
}

function compactWebsiteAnalysis(context: ResearchContextLike, budget: ResearchPromptBudget = RESEARCH_PROMPT_BUDGETS[0]) {
  const summary = context.websiteSummary;
  if (!summary) return null;
  const insights = asRecord(context.websiteInsights);
  return {
    status: summary.status, productCount: summary.productCount,
    pricePositioning: summary.pricePositioning, websiteCompleteness: summary.websiteCompleteness,
    insights: {
      businessSummary: compactText(insights.businessSummary, budget.insightChars),
      customerProfile: compactText(insights.customerProfile, budget.insightChars),
      mainBusiness: compactText(insights.mainBusiness, budget.insightChars),
      productLineAnalysis: compactText(insights.productLineAnalysis, budget.insightChars),
      brandPositioning: compactText(insights.brandPositioning, budget.insightChars),
      marketChannelSignals: compactText(insights.marketChannelSignals, budget.insightChars),
      priceCompetitiveness: insights.priceCompetitiveness,
      missingCategoriesGap: compactUnknownList(insights.missingCategoriesGap, budget.genericListItems, budget),
      unknownFactors: compactUnknownList(insights.unknownFactors, budget.genericListItems, budget),
      evidencePages: compactUnknownList(insights.evidencePages, budget.genericListItems, budget)
    },
    productCategories: compactUnknownList(summary.productCategories, budget.productCategories, budget),
    pages: summary.pages?.slice(0, budget.pages).map((page) => ({
      url: compactText(page.url, 240), pageType: compactText(page.pageType, 60),
      title: compactText(page.title, 120), textSummary: compactText(page.textSummary, budget.pageTextChars)
    }))
  };
}

function compactUnknownList(value: unknown, limit: number, budget: ResearchPromptBudget = RESEARCH_PROMPT_BUDGETS[0]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => {
    if (typeof item === "string") return compactText(item, budget.insightChars);
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return compactRecord(item as Record<string, unknown>, budget);
  });
}

function compactRecord(record: Record<string, unknown>, budget: ResearchPromptBudget = RESEARCH_PROMPT_BUDGETS[0]) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") result[key] = compactText(value, budget.insightChars);
    else if (Array.isArray(value)) result[key] = compactUnknownList(value, Math.min(6, budget.genericListItems), budget);
    else if (value && typeof value === "object") result[key] = compactRecord(value as Record<string, unknown>, budget);
    else result[key] = value;
  }
  return result;
}

function compactCustomer(customer: ResearchContextLike["customer"], maxLength: number) {
  return {
    name: compactText(customer.name, maxLength),
    websiteUrl: compactText(customer.websiteUrl, maxLength * 2),
    country: compactText(customer.country, maxLength),
    language: compactText(customer.language, maxLength),
    typeName: compactText(customer.typeName, maxLength),
    sourceName: compactText(customer.sourceName, maxLength)
  };
}

function compactSourceEvidence(sourceEvidence: ResearchContextLike["sourceEvidence"]) {
  if (!sourceEvidence) return undefined;
  return {
    websiteAnalysisStatus: sourceEvidence.websiteAnalysisStatus ?? null,
    searchWarning: compactText(sourceEvidence.searchWarning, 180),
    contactCount: sourceEvidence.contactCount ?? 0
  };
}

function inputBudgetSummary(context: ResearchContextLike) {
  return {
    maxPromptChars: RESEARCH_PROMPT_MAX_CHARS,
    contacts: context.contacts?.length ?? 0,
    publicSearchResults: context.publicSearch.results?.length ?? 0,
    companyProducts: context.companyKnowledge?.products?.length ?? 0,
    companyCapabilities: context.companyKnowledge?.capabilities?.length ?? 0,
    companyCaseStudies: context.companyKnowledge?.caseStudies?.length ?? 0,
    websitePages: context.websiteSummary?.pages?.length ?? 0
  };
}

function compactText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (key, val) => {
    if (key === "") return val;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
