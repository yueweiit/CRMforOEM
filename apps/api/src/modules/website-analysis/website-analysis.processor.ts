import { Processor, WorkerHost } from "@nestjs/bullmq";
import { WebsiteAnalysisResult } from "@oem-crm/shared";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { WEBSITE_ANALYSIS_QUEUE } from "./website-analysis.constants";
import { WebsiteCrawlerService } from "./website-crawler.service";

@Processor(WEBSITE_ANALYSIS_QUEUE)
export class WebsiteAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: WebsiteCrawlerService,
    private readonly aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService
  ) {
    super();
  }

  async process(job: Job<{ analysisId: string; customerId: string; websiteUrl: string }>) {
    const { analysisId, websiteUrl } = job.data;
    const analysis = await this.prisma.websiteAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
      include: {
        customer: {
          select: { organizationId: true }
        }
      }
    });
    await this.prisma.websiteAnalysis.update({
      where: { id: analysisId },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    const organizationId = analysis.customer.organizationId;

    try {
      const result = await this.crawler.analyze(websiteUrl);
      const companyProfile = await this.prisma.companyProfile.findFirst({
        where: { organizationId },
        include: {
          products: { take: 80 },
          capabilities: true
        }
      });
      const aiInput = buildWebsiteAiInput(result, companyProfile);
      const aiSummary = await this.aiProvider.complete({
        system: websiteAnalysisPrompt(),
        user: JSON.stringify(aiInput),
        jsonMode: true
      });
      const aiInsights = parseWebsiteAiInsights(aiSummary.content, result);

      if (analysis.aiGenerationRunId) {
        await this.aiGeneration.markSucceeded(analysis.aiGenerationRunId, aiSummary.raw);
        await this.aiGeneration.addRawAiVersion(analysis.aiGenerationRunId, aiSummary.content, aiInsights);
      }

      await this.prisma.websiteAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          homePageTitle: result.pages.find((page) => page.pageType === "HOME")?.title,
          detectedCountry: result.detectedCountry,
          detectedLanguage: result.detectedLanguage,
          detectedTimezone: result.detectedTimezone,
          detectedCurrency: result.detectedCurrency,
          crawledUrls: result.crawledUrls,
          contactEvidence: result.contacts as never,
          productCategories: result.productCategories as never,
          productCount: result.productCount ?? result.productCategories.reduce((sum: number, item: { productCount?: number }) => sum + (item.productCount ?? 0), 0),
          priceRange: result.priceRange as never,
          pricePositioning: result.pricePositioning,
          websiteCompleteness: result.websiteCompleteness,
          imageStyle: result.imageStyle,
          missingCategories: result.missingCategories as never,
          opportunities: asStringArray(aiInsights.cooperation_opportunities, result.cooperationOpportunities) as never,
          risks: asStringArray(aiInsights.risk_notes, result.risks) as never,
          rawResult: { ...result, aiInsights } as never
        }
      });
      await this.prisma.websiteAnalysisPage.createMany({
        data: result.pages.map((page) => ({
          websiteAnalysisId: analysisId,
          url: page.url,
          pageType: page.pageType as never,
          title: page.title,
          language: page.language,
          textSummary: page.textSummary,
          headings: page.headings as never,
          links: page.links as never,
          images: page.images as never,
          contacts: page.contacts as never,
          priceSignals: page.priceSignals as never,
          depth: page.depth,
          httpStatus: page.httpStatus,
          errorMessage: page.errorMessage
        }))
      });
      if (result.products.length) {
        await this.prisma.websiteAnalysisProduct.createMany({
          data: result.products.map((product) => ({
            websiteAnalysisId: analysisId,
            name: product.name,
            category: product.category,
            description: product.description,
            keywords: product.keywords,
            evidenceUrls: product.evidenceUrls,
            imageUrls: product.imageUrls,
            priceSignals: product.priceSignals as never,
            confidence: product.confidence
          }))
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown website analysis error";
      await this.prisma.websiteAnalysis.update({
        where: { id: analysisId },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() }
      });
      if (analysis.aiGenerationRunId) {
        await this.aiGeneration.markFailed(analysis.aiGenerationRunId, message);
      }
      throw error;
    }
  }
}

function safeJson(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function websiteAnalysisPrompt() {
  return [
    "你是一名资深外贸OEM/ODM客户开发分析师。",
    "请根据客户官网抓取内容和我方企业资料，输出给销售使用的中文客户分析，不要输出抓取日志，不要罗列404页面。",
    "不要编造官网没有证据的信息；无法确认时写'官网未明确展示'。",
    "",
    "返回严格JSON对象，字段包括：business_summary, customer_profile, main_business, product_line_analysis, brand_positioning, market_channel_signals, oem_opportunity_assessment, cooperation_opportunities, sales_entry_points, suggested_next_actions, risk_notes, evidence_pages, missing_categories_gap, price_competitiveness, unknown_factors, our_data_quality_note。",
    "",
    "business_summary 用2-4句话概括该客户是谁、主营方向、值得开发的原因。",
    "cooperation_opportunities、sales_entry_points、suggested_next_actions、risk_notes、unknown_factors 均为中文数组，每项简洁具体。",
    "evidence_pages 只放有效页面，包含 title、url、reason。",
    "",
    "【约束】",
    "brand_positioning 只能基于官网自我描述的定位，不得输出确定的高端/中端/低端品牌档次结论。",
    "oem_opportunity_assessment 只能基于官网可见产品线、联系方式、缺失品类和我方能力给出试探性切入建议。不得把'官网未提及自有工厂/供应商'当作客户有OEM需求的证据。",
    "不要输出 image_style_analysis、matched_products、selling_points_summary。",
    "",
    "【新增字段】",
    "",
    "1. missing_categories_gap: 对比客户官网产品类目与我方产品/产能，列出客户缺少但我方可供的品类。",
    "每项包含：category, customer_has, we_can_supply, opportunity_score(1-10), reason, data_quality_note。",
    "约束：我方产品/产能为空时返回[]；我方产品数量<10时data_quality_note必须说明数据可能不完整；客户产品分类<2个类目时最多返回3项且opportunity_score≤5；不要把我方所有产品都列为客户缺失品类。",
    "",
    "2. price_competitiveness: 对象含level(competitive/neutral/challenging/unknown)、summary、price_nature_note。",
    "约束：默认为unknown；只有客户价格来自/wholesale、/trade、/b2b、/distributor等B2B路径，或页面文本含wholesale、trade price、distributor price等信号时，才允许输出competitive/neutral/challenging；客户无价格/我方无价格/币种不一致时level必须为unknown；summary不允许写确定性结论。",
    "",
    "3. unknown_factors: 必须返回数组，至少包含：采购周期、实际采购量级、当前供应商关系、关键决策人联系方式、预算范围、认证要求。",
    "",
    "4. our_data_quality_note: 当我方参考产品数量<10时输出提醒文本。",
    "",
    "总输出控制在2800中文字符以内。"
  ].join("\n");
}

function buildWebsiteAiInput(
  result: WebsiteAnalysisResult,
  companyProfile?: {
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
  } | null
) {
  const validPages = result.pages.filter((page) => !page.errorMessage);
  const rawProducts = (companyProfile?.products ?? []).map((product) => {
    const priceMin = product.priceMin != null ? Number(product.priceMin) : undefined;
    const priceMax = product.priceMax != null ? Number(product.priceMax) : undefined;
    return {
      name: product.name,
      category: product.category,
      material: product.material,
      priceMin: priceMin != null && Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: priceMax != null && Number.isFinite(priceMax) ? priceMax : undefined,
      currency: product.currency,
      tags: product.tags
    };
  });
  const completenessScore = (product: (typeof rawProducts)[number]) =>
    (product.priceMin != null && product.priceMax != null ? 2 : 0) +
    (product.tags.length > 0 ? 1 : 0) +
    (product.material ? 1 : 0);
  const groupedProducts = new Map<string, typeof rawProducts>();
  for (const product of rawProducts) {
    const bucket = groupedProducts.get(product.category) ?? [];
    bucket.push(product);
    groupedProducts.set(product.category, bucket);
  }
  const ourProducts = Array.from(groupedProducts.values())
    .flatMap((bucket) => bucket.sort((a, b) => completenessScore(b) - completenessScore(a)).slice(0, 2))
    .slice(0, 40);
  const ourCapabilities = (companyProfile?.capabilities ?? []).map((capability) => ({
    name: capability.name,
    category: capability.category,
    moq: capability.moq,
    leadTime: capability.leadTime
  }));

  return {
    detectedLanguage: result.detectedLanguage,
    websiteCompleteness: result.websiteCompleteness,
    pricePositioning: result.pricePositioning,
    contacts: result.contacts,
    productCategories: result.productCategories,
    products: result.products.slice(0, 20),
    opportunities: result.cooperationOpportunities,
    risks: result.risks,
    priceRange: result.priceRange,
    pages: validPages.map((page) => ({
      url: page.url,
      pageType: page.pageType,
      title: page.title,
      headings: page.headings.slice(0, 12),
      textSummary: page.textSummary?.slice(0, 2500)
    })),
    ourProducts,
    ourCapabilities,
    ourDataQuality: {
      productCount: rawProducts.length,
      capabilityCount: ourCapabilities.length,
      isLikelyIncomplete: rawProducts.length < 10
    }
  };
}

function parseWebsiteAiInsights(content: string, result: WebsiteAnalysisResult): WebsiteAiInsights {
  const parsed = safeJson(content);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
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
      evidence_pages: asEvidencePages(record.evidence_pages, result),
      missing_categories_gap: asMissingCategoriesGap(record.missing_categories_gap),
      price_competitiveness: asPriceCompetitiveness(record.price_competitiveness),
      unknown_factors: asStringArray(record.unknown_factors, [
        "采购周期",
        "实际采购量级",
        "当前供应商关系",
        "关键决策人联系方式",
        "预算范围",
        "认证要求"
      ]),
      our_data_quality_note: asText(record.our_data_quality_note) || ""
    };
  }
  return fallbackWebsiteAiInsights(result);
}

type ReturnTypeFallback = {
  detectedLanguage?: string;
  websiteCompleteness?: number;
  pricePositioning?: string;
  productCategories: Array<{ name: string; evidenceUrls: string[]; keywords: string[]; productCount?: number }>;
  cooperationOpportunities: string[];
  risks: string[];
  pages: Array<{ url: string; pageType: string; title?: string; textSummary?: string; errorMessage?: string }>;
  contacts: Array<{ type: string; value: string; sourceUrl?: string }>;
};

type WebsiteAiInsights = {
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

function fallbackWebsiteAiInsights(result: ReturnTypeFallback): WebsiteAiInsights {
  return {
    business_summary: fallbackBusinessSummary(result),
    customer_profile: "官网展示了品牌、产品/行业页面和联系方式，适合先作为品牌型或渠道型潜在客户跟进；更多企业规模与采购模式需补充公开搜索或人工确认。",
    main_business: fallbackMainBusiness(result),
    product_line_analysis: fallbackProductLine(result),
    brand_positioning: result.pricePositioning || "官网未明确展示价格定位。",
    market_channel_signals: "官网现有内容可见品牌与零售相关信号，但渠道、采购模式和核心品类仍需人工确认。",
    oem_opportunity_assessment: "适合用“产品开发、包装设计、私标/定制补充、稳定供货”作为首轮试探方向。",
    cooperation_opportunities: result.cooperationOpportunities,
    sales_entry_points: ["引用官网品牌/产品线信息开场，避免模板化开发。", "优先询问其新品开发、补充品类或供应链备选需求。"],
    suggested_next_actions: ["补充采购/产品负责人邮箱或LinkedIn。", "确认目标品类后再生成个性化英文开发邮件。"],
    risk_notes: result.risks,
    evidence_pages: asEvidencePages([], result),
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

function fallbackBusinessSummary(result: ReturnTypeFallback) {
  const categories = result.productCategories.map((item) => item.name).filter(Boolean).slice(0, 4);
  const contacts = result.contacts.some((contact) => contact.type === "email") ? "官网留有公开邮箱" : "官网公开联系方式有限";
  return `官网显示该客户具备品牌/产品展示页面，当前识别到${categories.length ? ` ${categories.join("、")} 等方向` : "若干产品或业务方向"}，${contacts}。建议作为潜在OEM/ODM开发对象继续补充联系人和采购模式信息。`;
}

function fallbackMainBusiness(result: ReturnTypeFallback) {
  const categories = result.productCategories.map((item) => item.name).filter(Boolean);
  return categories.length ? `官网识别到的主营/展示方向包括：${categories.join("、")}。` : "官网未识别到清晰产品分类。";
}

function fallbackProductLine(result: ReturnTypeFallback) {
  if (!result.productCategories.length) return "官网未识别到清晰产品线，需要人工查看产品页或补充官网内容。";
  return result.productCategories
    .map((item) => `${item.name}${item.keywords?.length ? `（关键词：${item.keywords.slice(0, 5).join("、")}）` : ""}`)
    .join("；");
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length ? items : fallback;
}

function asEvidencePages(value: unknown, result: ReturnTypeFallback) {
  if (Array.isArray(value)) {
    const pages = value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const record = item as Record<string, unknown>;
        const url = asText(record.url);
        if (!url) return undefined;
        return {
          title: asText(record.title) || url,
          url,
          reason: asText(record.reason) || "官网有效页面"
        };
      })
      .filter((item): item is { title: string; url: string; reason: string } => Boolean(item));
    if (pages.length) return pages.slice(0, 8);
  }
  return result.pages
    .filter((page) => !page.errorMessage)
    .slice(0, 8)
    .map((page) => ({
      title: page.title || page.url,
      url: page.url,
      reason: `${page.pageType} 页面用于支撑客户分析`
    }));
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
        opportunity_score:
          typeof record.opportunity_score === "number" && record.opportunity_score >= 1 && record.opportunity_score <= 10
            ? record.opportunity_score
            : 5,
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
