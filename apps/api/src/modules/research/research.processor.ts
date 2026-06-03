import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AiGenerationType, CustomerStage } from "@oem-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import { SearchProviderService } from "./search-provider.service";

@Processor(RESEARCH_REPORT_QUEUE)
export class ResearchProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService,
    private readonly searchProvider: SearchProviderService
  ) {
    super();
  }

  async process(job: Job<{ reportId: string; organizationId: string; customerId: string; salesNotes?: string }>) {
    const { reportId, organizationId, customerId, salesNotes } = job.data;
    const report = await this.prisma.researchReport.update({
      where: { id: reportId },
      data: { status: "RUNNING", startedAt: new Date() }
    });

    try {
      const context = await this.buildContext(organizationId, customerId, salesNotes);
      await this.prisma.aiGenerationRun.update({
        where: { id: report.aiGenerationRunId ?? "" },
        data: { status: "RUNNING", rawInput: context as never }
      }).catch(() => undefined);

      const startedAt = Date.now();
      const completion = await this.aiProvider.complete({
        system: researchSystemPrompt(),
        user: JSON.stringify(context),
        jsonMode: true
      });
      const parsed = parseResearchOutput(completion.content, context);

      if (report.aiGenerationRunId) {
        await this.aiGeneration.markSucceeded(report.aiGenerationRunId, completion.raw, completion.tokenUsage, Date.now() - startedAt);
        await this.aiGeneration.addRawAiVersion(report.aiGenerationRunId, completion.content, parsed);
      }

      const finalReport = await this.prisma.researchReport.update({
        where: { id: reportId },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          title: parsed.title,
          reportJson: parsed as never,
          finalMarkdown: parsed.markdown_report,
          sourceEvidence: context.sourceEvidence as never,
          searchEnabled: context.publicSearch.enabled
        }
      });

      await this.prisma.customer.update({
        where: { id: customerId },
        data: { stage: CustomerStage.Researched as never }
      });

      return finalReport;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research report error";
      await this.prisma.researchReport.update({
        where: { id: reportId },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() }
      });
      if (report.aiGenerationRunId) {
        await this.aiGeneration.markFailed(report.aiGenerationRunId, message);
      }
      throw error;
    }
  }

  private async buildContext(organizationId: string, customerId: string, salesNotes?: string) {
    const [customer, websiteAnalysis, companyProfiles, contacts, priorMessages] = await Promise.all([
      this.prisma.customer.findFirstOrThrow({
        where: { id: customerId, organizationId },
        include: { source: true, type: true, owner: { select: { id: true, name: true, email: true } } }
      }),
      this.prisma.websiteAnalysis.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        include: {
          pages: true,
          products: true
        }
      }),
      this.prisma.companyProfile.findMany({
        where: { organizationId },
        include: {
          capabilities: true,
          products: { take: 80 },
          certificates: true,
          caseStudies: true,
          emailMaterials: true
        }
      }),
      this.prisma.contact.findMany({ where: { customerId } }),
      this.prisma.emailThread.findMany({
        where: { customerId },
        include: { messages: { take: 10, orderBy: { createdAt: "desc" } } }
      })
    ]);
    const publicSearch = await this.searchProvider.searchCustomer({
      name: customer.name,
      websiteUrl: customer.websiteUrl,
      country: customer.country
    });
    const rawResult = asRecord(websiteAnalysis?.rawResult);
    const aiInsights = asRecord(rawResult.aiInsights);
    const websiteInsights = Object.keys(aiInsights).length
      ? {
          businessSummary: aiInsights.business_summary,
          customerProfile: aiInsights.customer_profile,
          mainBusiness: aiInsights.main_business,
          productLineAnalysis: aiInsights.product_line_analysis,
          brandPositioning: aiInsights.brand_positioning,
          marketChannelSignals: aiInsights.market_channel_signals,
          priceCompetitiveness: aiInsights.price_competitiveness,
          missingCategoriesGap: aiInsights.missing_categories_gap,
          unknownFactors: aiInsights.unknown_factors,
          evidencePages: aiInsights.evidence_pages
        }
      : null;

    return {
      customer,
      contacts,
      websiteAnalysis,
      websiteInsights,
      publicSearch,
      sourceEvidence: {
        websiteUrls: websiteAnalysis?.crawledUrls ?? [],
        websitePages: websiteAnalysis?.pages.filter((page) => !page.errorMessage).map((page) => ({ url: page.url, pageType: page.pageType, title: page.title })) ?? [],
        publicSearchResults: publicSearch.results,
        crmContacts: contacts.map((contact) => ({ name: contact.name, email: contact.email, phone: contact.phone })),
        searchWarning: publicSearch.warning
      },
      companyKnowledge: {
        profiles: companyProfiles.map((profile) => ({
          id: profile.id,
          displayName: profile.displayName,
          summary: profile.summary,
          markets: profile.markets,
          capabilities: profile.capabilities,
          products: profile.products,
          certificates: profile.certificates,
          caseStudies: profile.caseStudies,
          emailMaterials: profile.emailMaterials
        })),
        products: companyProfiles.flatMap((profile) => profile.products),
        capabilities: companyProfiles.flatMap((profile) => profile.capabilities),
        caseStudies: companyProfiles.flatMap((profile) => profile.caseStudies),
        certificates: companyProfiles.flatMap((profile) => profile.certificates)
      },
      priorMessages,
      salesNotes
    };
  }
}

function researchSystemPrompt() {
  return [
    "你是一名资深外贸OEM/ODM客户开发研究员。",
    "请只根据输入上下文和来源证据生成报告，不要编造未提供的信息。",
    "无法从来源证据确认的信息必须写\"未从现有来源确认\"，不要估算成立年份、员工人数、认证、合作伙伴或经营数据。",
    "",
    "【重要】companyKnowledge 是我方（供应商）的企业资料，只能用于第8维度“总结与开发建议”的合作建议、推荐产品和开发策略，不得用于补充第1-7维度的客户背景事实。",
    "第6维度“产品价格定位”只能描述客户官网或公开资料中的客户侧价格信号；我方价格匹配分析只能放在第8维度。",
    "",
    "返回严格JSON对象，结构如下：",
    "{",
    '  "title": "string",',
    '  "sections": {',
    '    "company_basic_info": { "confirmed_facts": ["已确认的事实"], "analysis": "基于现有来源的合理分析", "missing_info": ["待补充信息"] },',
    '    "background_history": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "core_business_product_lines": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "market_competition": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "brand_marketing": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "price_positioning": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "website_product_analysis": { "confirmed_facts": [], "analysis": "", "missing_info": [] },',
    '    "summary_development_recommendations": {',
    '      "customer_value_rating": "客户价值评级（高/中/低）",',
    '      "development_priority": "开发优先级（高/中/低）",',
    '      "recommended_products": ["推荐供货产品"],',
    '      "email_entry_points": ["邮件切入点"],',
    '      "cooperation_opportunities": ["合作机会"],',
    '      "potential_risks": ["潜在风险"],',
    '      "next_actions": ["下一步行动"]',
    "    }",
    "  },",
    '  "source_basis": [{"section": "维度名", "source": "来源类型", "evidence": "具体依据"}],',
    '  "markdown_report": "中文Markdown格式的完整报告，面向业务员和销售主管"',
    "}",
    "",
    "第1-7维度的 confirmed_facts 必须是已从来源证据中直接验证的事实，analysis 是基于来源的合理推断，missing_info 是当前无法确认但值得关注的信息。",
    "第8维度 summary_development_recommendations 可以使用 companyKnowledge 中的我方资料来生成合作建议。",
    "请控制总输出在3000个中文字符以内，确保JSON完整闭合，不要输出多余解释。",
    "markdown_report 必须是中文Markdown，面向业务员和销售主管，可直接阅读。",
    "source_basis 要列出每个维度用到的官网URL、公开搜索结果URL或CRM资料说明。"
  ].join("\n");
}

function parseResearchOutput(content: string, context: ResearchContextLike) {
  const parsed = safeJson(content);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const sections = asRecord(record.sections);
    const markdown = asText(record.markdown_report);
    if (Object.keys(sections).length) {
      const normalizedSections = normalizeSections(sections);
      return {
        title: asText(record.title) || `${context.customer.name} 客户背调报告`,
        sections: normalizedSections,
        source_basis: record.source_basis ?? [],
        markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(context.customer.name, normalizedSections, context.publicSearch.warning)
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
      title: asText(record.title) || `${context.customer.name} 客户背调报告`,
      sections: legacySections,
      source_basis: record.source_basis ?? [],
      markdown_report: isReadableMarkdown(markdown) ? markdown : buildMarkdownReportV2(context.customer.name, legacySections, context.publicSearch.warning)
    };
  }
  const fallback = buildContextReport(context);
  return {
    ...fallback,
    markdown_report: isReadableMarkdown(content) ? content : fallback.markdown_report
  };
}

const SECTION_KEYS = [
  "company_basic_info",
  "background_history",
  "core_business_product_lines",
  "market_competition",
  "brand_marketing",
  "price_positioning",
  "website_product_analysis"
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
  if (typeof value === "string") {
    return { confirmed_facts: [], analysis: value, missing_info: [] };
  }
  if (Array.isArray(value)) {
    return { confirmed_facts: asStringList(value), analysis: "", missing_info: [] };
  }
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

function buildMarkdownReportV2(customerName: string, sections: Record<string, unknown>, warning?: string) {
  const bodyParts: string[] = [];

  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const section = asRecord(sections[key]);
    bodyParts.push(`## ${label}`);

    if (key === "summary_development_recommendations") {
      const valueRating = asText(section.customer_value_rating);
      const priority = asText(section.development_priority);
      bodyParts.push(`**客户价值评级**：${valueRating || "待评估"} | **开发优先级**：${priority || "待评估"}`);

      const subSections: Array<[string, string]> = [
        ["推荐供货产品", "recommended_products"],
        ["邮件切入点", "email_entry_points"],
        ["合作机会", "cooperation_opportunities"],
        ["潜在风险", "potential_risks"],
        ["下一步行动", "next_actions"]
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

function fallbackMarkdown(customerName: string, record: Record<string, unknown>, warning?: string) {
  return `# ${customerName} 客户背调报告\n\n## 总结\n${asText(record.summary) || "系统已生成结构化背调结果，请结合官网分析和客户资料复核。"}\n\n${warning ? `> ${warning}\n` : ""}`;
}

function buildMarkdownReport(customerName: string, record: Record<string, unknown>, warning?: string) {
  const title = asText(record.title) || `${customerName} 客户背调报告`;
  const sections: Array<[string, unknown]> = [
    ["公司基本信息", record.company_basic_info],
    ["企业背景和发展历程", record.background_history],
    ["核心业务与产品线", record.core_business_product_lines],
    ["市场表现与竞争格局", record.market_competition],
    ["品牌策略与营销方式", record.brand_marketing],
    ["产品价格定位", record.price_positioning],
    ["官网产品专项分析", record.website_product_analysis],
    ["OEM/ODM合作机会", record.oem_odm_opportunities],
    ["风险提示", record.risks],
    ["智能开发建议", record.development_recommendations],
    ["下一步行动", record.next_actions],
    ["来源依据", record.source_basis]
  ];

  const body = sections
    .map(([heading, value]) => `## ${heading}\n${renderMarkdownValue(value)}`)
    .filter((section) => !section.endsWith("\n- 暂无明确结论。"))
    .join("\n\n");
  return [`# ${title}`, warning ? `> ${warning}` : "", body].filter(Boolean).join("\n\n");
}

function renderMarkdownValue(value: unknown): string {
  if (typeof value === "string") return value.trim() || "- 暂无明确结论。";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "- 暂无明确结论。";
    return value.map((item) => `- ${renderInlineValue(item)}`).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined && item !== null && item !== "");
    if (!entries.length) return "- 暂无明确结论。";
    return entries.map(([key, item]) => `- ${humanizeKey(key)}：${renderInlineValue(item)}`).join("\n");
  }
  return "- 暂无明确结论。";
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
    company_name: "公司名称",
    legal_name: "法定/品牌名称",
    website: "官网",
    country: "国家/地区",
    headquarters: "总部/地址",
    business_model: "业务模式",
    company_type: "客户类型",
    customer_type: "客户类型",
    owner: "负责人",
    contacts: "联系人",
    summary: "总结",
    evidence: "依据",
    risk: "风险",
    severity: "严重程度",
    description: "说明",
    action: "行动",
    rationale: "理由",
    source: "来源",
    analysis_status: "分析状态",
    url: "URL",
    value: "值",
    name: "名称",
    crawled_pages: "抓取页面",
    valid_pages: "有效页面",
    product_count: "产品数量",
    website_completeness: "官网完整度"
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function isReadableMarkdown(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !trimmed.startsWith("{") && !trimmed.startsWith("[");
}

type ResearchContextLike = {
  customer: {
    name: string;
    websiteUrl?: string | null;
    country?: string | null;
    notes?: string | null;
    source?: { name?: string | null } | null;
    type?: { name?: string | null } | null;
    owner?: { name?: string | null } | null;
  };
  contacts?: Array<{ name?: string | null; title?: string | null; email?: string | null; phone?: string | null }>;
  websiteAnalysis?: {
    status?: string;
    crawledUrls?: string[];
    productCount?: number | null;
    productCategories?: unknown;
    contactEvidence?: unknown;
    opportunities?: unknown;
    risks?: unknown;
    pricePositioning?: string | null;
    websiteCompleteness?: number | null;
    rawResult?: unknown;
    products?: unknown;
    pages?: Array<{ url: string; pageType: string; title?: string | null; errorMessage?: string | null }>;
  } | null;
  websiteInsights?: Record<string, unknown> | null;
  companyKnowledge?: {
    products?: unknown;
    capabilities?: unknown;
    caseStudies?: unknown;
    certificates?: unknown;
  };
  publicSearch: { warning?: string; enabled?: boolean; results?: Array<{ title?: string; url?: string }> };
};

function buildContextReport(context: ResearchContextLike) {
  const customer = context.customer;
  const analysis = context.websiteAnalysis;
  const productCategories = asRecords(analysis?.productCategories);
  const opportunities = asStringList(analysis?.opportunities);
  const risks = asStringList(analysis?.risks);
  const usablePages = (analysis?.pages ?? []).filter((page) => !page.errorMessage);
  const companyProducts = asRecords(context.companyKnowledge?.products);
  const companyCapabilities = asRecords(context.companyKnowledge?.capabilities);
  const companyCaseStudies = asRecords(context.companyKnowledge?.caseStudies);
  const sourceBasis = [
    ...(analysis?.crawledUrls ?? []).slice(0, 10).map((url) => ({ section: "官网产品专项分析", source: "官网抓取", evidence: url })),
    ...(context.publicSearch.results ?? []).slice(0, 6).map((item) => ({ section: "企业背景和发展历程", source: item.title ?? "公开搜索", evidence: item.url ?? "" })),
    ...((context.contacts ?? []).length ? [{ section: "公司基本信息", source: "CRM联系人资料", evidence: `${context.contacts?.length ?? 0} 个联系人` }] : [])
  ];

  const sections = {
    company_basic_info: {
      confirmed_facts: [
        `公司名称：${customer.name}`,
        ...(customer.websiteUrl ? [`官网：${customer.websiteUrl}`] : []),
        ...(customer.country ? [`国家/地区：${customer.country}`] : []),
        ...(customer.type?.name ? [`客户类型：${customer.type.name}`] : []),
        ...(customer.source?.name ? [`来源：${customer.source.name}`] : []),
        ...(context.contacts ?? []).map((contact) => `联系人：${contact.name || contact.email || "未命名联系人"}${contact.email ? ` <${contact.email}>` : ""}`)
      ],
      analysis: customer.owner?.name
        ? `负责人为 ${customer.owner.name}，可根据联系人信息进一步评估客户质量。`
        : "尚未分配负责人，建议尽快分配销售跟进。",
      missing_info: [
        ...(!customer.websiteUrl ? ["官网URL未录入，建议补充以启用官网分析。"] : []),
        ...(!customer.country ? ["国家/地区未录入。"] : []),
        ...(!(context.contacts ?? []).length ? ["缺少联系人信息，建议补充采购/产品负责人邮箱。"] : [])
      ]
    },
    background_history: {
      confirmed_facts: [],
      analysis: context.publicSearch.warning
        ? "未启用公开网络搜索，企业背景仅能基于官网与CRM资料判断。"
        : "已结合公开搜索结果生成背景判断，需由业务员复核成立时间、发展节点等关键事实。",
      missing_info: [
        "未从官网或公开搜索确认成立时间/发展历程。",
        "建议通过 LinkedIn、行业名录或客户官网 About 页面补充企业规模和经营历史。"
      ]
    },
    core_business_product_lines: productCategories.length
      ? {
          confirmed_facts: productCategories.map((item) => `品类：${asText(item.name) || asText(item.category) || "未命名品类"}`),
          analysis: `官网识别到 ${productCategories.length} 个产品品类，可作为理解客户业务结构的参考。`,
          missing_info: ["具体产品型号、规格、销量数据未获取。"]
        }
      : {
          confirmed_facts: [],
          analysis: "官网未识别到清晰产品分类，需要人工查看产品页或补充官网内容。",
          missing_info: ["建议人工浏览客户官网产品页，整理产品线和品牌矩阵。"]
        },
    market_competition: {
      confirmed_facts: customer.country ? [`客户国家/地区：${customer.country}`] : [],
      analysis: "当前版本未接入完整竞品数据库，仅能根据官网、国家/地区和公开搜索结果做初步判断。",
      missing_info: [
        "未接入竞品数据库，无法判断市场份额和竞品格局。",
        "建议结合公开搜索、LinkedIn、行业名录继续补充竞争品牌和渠道信息。"
      ]
    },
    brand_marketing: {
      confirmed_facts: usablePages.some((page) => page.pageType === "BRAND") ? ["官网包含品牌相关页面。"] : [],
      analysis: usablePages.some((page) => page.pageType === "BRAND")
        ? "官网包含品牌页，表明该客户重视品牌建设与对外展示。"
        : "官网未识别到明确品牌页，品牌成熟度需要人工复核。",
      missing_info: [
        "官网可见品牌表达有限，目标客群需结合社媒或销售沟通补充。",
        "未获取社交媒体活跃度、品牌声量等数据。"
      ]
    },
    price_positioning: {
      confirmed_facts: analysis?.pricePositioning ? [`官网价格信号：${analysis.pricePositioning}`] : [],
      analysis: analysis?.pricePositioning
        ? `客户官网显示价格定位为${analysis.pricePositioning}。`
        : "未从官网识别到明确价格区间，建议通过询盘或沟通了解客户价格预期。",
      missing_info: [
        "未获取采购量级、价格敏感度等深度信息。",
        "我方价格匹配分析见“总结与开发建议”维度。"
      ]
    },
    website_product_analysis: {
      confirmed_facts: [
        `官网分析状态：${analysisStatusText(analysis?.status)}`,
        `抓取页面数：${analysis?.crawledUrls?.length ?? 0}`,
        `有效页面数：${usablePages.length}`,
        `产品数量：${analysis?.productCount ?? 0}`,
        ...(analysis?.websiteCompleteness ? [`官网完整度：${analysis.websiteCompleteness}/100`] : [])
      ],
      analysis: productCategories.length
        ? "官网分析已识别产品分类，可在此基础上评估官网产品结构和潜在合作切入点。"
        : "官网分析未识别到清晰产品结构，建议触发官网深度分析后重新生成背调。",
      missing_info: [
        ...(analysis?.status !== "SUCCEEDED" ? ["官网深度分析尚未完成，产品分类和机会评估可能不完整。"] : []),
        "具体产品卖点、差异化特征需要人工结合产品页详细分析。"
      ]
    },
    summary_development_recommendations: {
      customer_value_rating: "",
      development_priority: "",
      recommended_products: companyProducts.length
        ? companyProducts.slice(0, 5).map((product) => `${asText(product.name) || "未命名产品"}${asText(product.category) ? `（${asText(product.category)}）` : ""}`)
        : ["企业资料库中我方产品资料不足，建议先补充主推产品后再做精准推荐。"],
      email_entry_points: [
        "首封邮件引用其官网中已识别的品牌/产品线，避免泛泛群发。",
        "围绕新品补充、定制款、私标或差异化供货做轻量合作试探。"
      ],
      cooperation_opportunities: opportunities.length
        ? opportunities
        : [
            "可基于官网产品线和品牌页，探索OEM/ODM合作机会。",
            ...(companyCapabilities.length ? [`我方已有 ${companyCapabilities.length} 条能力资料，可用于筛选合作切入点。`] : [])
          ],
      potential_risks: [
        ...risks,
        ...(context.publicSearch.warning ? [context.publicSearch.warning] : []),
        ...(!context.contacts?.length ? ["CRM中缺少高质量联系人，建议补充采购/产品/供应链负责人。"] : []),
        ...(!companyCaseStudies.length ? ["企业资料库中案例资料不足，开发建议的说服力可能偏弱。"] : [])
      ],
      next_actions: [
        "补充或校验客户官网产品详情页。",
        "补充采购/产品负责人邮箱或 LinkedIn。",
        "完善企业资料库中的我方 OEM 能力、产品目录、成功案例后再生成开发邮件。"
      ]
    }
  };

  return {
    title: `${customer.name} 客户背调报告`,
    sections,
    source_basis: sourceBasis,
    markdown_report: buildMarkdownReportV2(customer.name, sections, context.publicSearch.warning)
  };
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : renderInlineValue(item))).filter(Boolean);
}

function analysisStatusText(status?: string) {
  const labels: Record<string, string> = {
    QUEUED: "排队中",
    RUNNING: "分析中",
    SUCCEEDED: "分析完成",
    FAILED: "分析失败"
  };
  return labels[status ?? ""] ?? "未分析";
}

function contactEvidenceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    email: "公开邮箱",
    phone: "公开电话",
    social: "社交媒体",
    address: "地址",
    form: "表单"
  };
  return labels[type] ?? "联系方式";
}

function safeJson(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}
