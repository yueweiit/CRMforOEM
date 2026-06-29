import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AiGenerationType, CustomerStage, OemScoreBreakdown } from "@oem-crm/shared";
import { Queue } from "bullmq";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AiGenerationService, AiProviderService } from "../ai/ai.public";
import { BackgroundTaskStaleService, TaskSubmissionLockService } from "../background-tasks/background-tasks.public";
import { DEFAULT_OEM_SCORING_WEIGHTS, mergeWithDefaults, type OemScoringWeights } from "../settings/settings.public";
import { OEM_FIT_SCORE_QUEUE } from "./scoring.constants";

type ScoreDimension = {
  key: keyof OemScoreBreakdown;
  label: string;
  maxScore: number;
  score: number;
  reason: string;
  evidence: string[];
};

type ScoreContext = Awaited<ReturnType<ScoringService["buildContext"]>>;
type ScorePlan = {
  development_strategy: Record<string, unknown>;
  recommended_products: Array<Record<string, unknown>>;
  email_entry_points: string[];
  opportunities: string[];
  risks: string[];
  next_actions: string[];
  markdown_report: string;
};

const DIMENSIONS: Array<{ key: keyof OemScoreBreakdown; label: string; maxScore: number }> = [
  { key: "productLineFit", label: "产品匹配度", maxScore: 20 },
  { key: "marketFit", label: "市场匹配度", maxScore: 15 },
  { key: "priceBandFit", label: "价格匹配度", maxScore: 15 },
  { key: "brandMaturity", label: "品牌成熟度", maxScore: 15 },
  { key: "websiteCompleteness", label: "官网完整度", maxScore: 10 },
  { key: "contactQuality", label: "联系人质量", maxScore: 10 },
  { key: "cooperationOpportunity", label: "合作机会", maxScore: 10 },
  { key: "riskPenalty", label: "风险扣分", maxScore: 10 }
];

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly taskLocks: TaskSubmissionLockService,
    private readonly staleTasks: BackgroundTaskStaleService,
    @InjectQueue(OEM_FIT_SCORE_QUEUE) private readonly queue: Queue
  ) {}

  async generate(user: RequestUser, customerId: string) {
    const customer = await this.ensureCustomerVisible(user, customerId);
    await this.staleTasks.markStaleCustomerTasks(user.organizationId, customerId);
    const existing = await this.findActiveOemScoreRun(customerId, user.organizationId);
    if (existing) {
      return { accepted: false, reason: "ACTIVE_OEM_FIT_SCORE_EXISTS", existing };
    }

    const lockKey = this.taskLocks.buildKey({
      organizationId: user.organizationId,
      type: "oem-fit-score",
      scope: customerId
    });
    const locked = await this.taskLocks.acquire(lockKey, 600, {
      userId: user.id,
      customerId,
      createdAt: new Date().toISOString()
    });
    if (!locked) {
      const lockedExisting = await this.findActiveOemScoreRun(customerId, user.organizationId);
      return { accepted: false, reason: "OEM_FIT_SCORE_SUBMISSION_LOCKED", existing: lockedExisting };
    }

    try {
      const run = await this.aiGeneration.createRun({
        organizationId: user.organizationId,
        customerId,
        type: AiGenerationType.OemFitScore,
        model: this.aiProvider.model,
        promptVersion: "oem-fit-score-v2",
        rawInput: {
          customer: {
            id: customer.id,
            name: customer.name,
            websiteUrl: customer.websiteUrl,
            country: customer.country,
            language: customer.language,
            typeId: customer.typeId,
            sourceId: customer.sourceId
          },
          mode: "queued"
        },
        createdById: user.id
      });

      await this.queue.add("generate-oem-fit-score", {
        runId: run.id,
        organizationId: user.organizationId,
        customerId,
        createdById: user.id
      });

      return { accepted: true, run };
    } finally {
      await this.taskLocks.release(lockKey);
    }
  }

  async processQueuedRun(input: {
    runId: string;
    organizationId: string;
    customerId: string;
    createdById?: string;
  }) {
    const started = await this.prisma.aiGenerationRun.updateMany({
      where: { id: input.runId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING" }
    });
    if (started.count === 0) return undefined;
    try {
      return await this.generateScoreForRun(input);
    } catch (error) {
      await this.aiGeneration.markFailed(
        input.runId,
        error instanceof Error ? error.message : "OEM score generation failed"
      );
      throw error;
    }
  }

  private async generateScoreForRun(input: {
    runId: string;
    organizationId: string;
    customerId: string;
    createdById?: string;
  }) {
    const user: RequestUser = {
      id: input.createdById ?? "",
      organizationId: input.organizationId,
      roleCodes: [],
      permissions: [],
      dataScope: "ALL"
    };
    const customerId = input.customerId;
    const context = await this.buildContext(user, customerId);
    const weights = await this.readOrgWeights(user.organizationId);
    const dimensions = calculateDimensions(context);
    const weightedScore = calculateWeightedTotal(dimensions, weights);
    const breakdown = buildBreakdown(dimensions, weights);
    const grade = toGrade(weightedScore);
    const recommendedProducts = recommendProducts(context);
    const fallbackPlan = buildFallbackPlan(context, dimensions, recommendedProducts, weightedScore, grade);

    await this.prisma.aiGenerationRun.update({
      where: { id: input.runId },
      data: {
        rawInput: {
          customer: context.customer,
          latestWebsiteAnalysis: compactWebsiteAnalysis(context.websiteAnalysis),
          latestResearchReport: compactResearchReport(context.researchReport),
          companyKnowledge: {
            products: context.products.slice(0, 80),
            capabilities: context.capabilities,
            caseStudies: context.caseStudies.slice(0, 30)
          },
          dimensions,
          weightedScore,
          grade,
          recommendedProducts,
          weights
        } as never
      }
    });

    const startedAt = Date.now();
    let aiPlan: ScorePlan = fallbackPlan;
    try {
      const completion = await this.aiProvider.complete({
        system: scoringPrompt(),
        user: JSON.stringify({
          customer: context.customer,
          websiteAnalysis: compactWebsiteAnalysis(context.websiteAnalysis),
          researchReport: compactResearchReport(context.researchReport),
          companyProducts: context.products.slice(0, 50),
          oemCapabilities: context.capabilities,
          score: { total: weightedScore, grade, dimensions, recommendedProducts }
        }),
        jsonMode: true
      });
      aiPlan = parseAiPlan(completion.content, fallbackPlan);
      await this.aiGeneration.markSucceeded(input.runId, completion.raw, completion.tokenUsage, Date.now() - startedAt);
      await this.aiGeneration.addRawAiVersion(input.runId, completion.content, aiPlan);
    } catch (error) {
      await this.aiGeneration.markFailed(input.runId, error instanceof Error ? error.message : "AI score narrative failed");
    }

    const score = await this.prisma.oemFitScore.create({
      data: {
        customerId,
        aiGenerationRunId: input.runId,
        score: weightedScore,
        grade,
        breakdown: breakdown as never,
        weights: weights as never,
        dimensionDetails: dimensions as never,
        recommendedProducts: aiPlan.recommended_products as never,
        developmentStrategy: aiPlan.development_strategy as never,
        emailEntryPoints: aiPlan.email_entry_points as never,
        opportunities: aiPlan.opportunities as never,
        risks: aiPlan.risks as never,
        nextActions: aiPlan.next_actions as never,
        aiScore: weightedScore,
        aiGrade: grade,
        aiBreakdown: breakdown as never,
        explanation: aiPlan.markdown_report,
        createdById: input.createdById
      },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });

    if (weightedScore >= 60) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { stage: CustomerStage.PendingEmailGeneration as never }
      });
    }

    return score;
  }

  async getLatest(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.oemFitScore.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });
  }

  async listHistory(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.oemFitScore.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        score: true,
        grade: true,
        createdAt: true
      }
    });
  }

  async getById(user: RequestUser, customerId: string, scoreId: string) {
    await this.ensureCustomerVisible(user, customerId);
    const score = await this.prisma.oemFitScore.findFirst({
      where: { id: scoreId, customerId },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });
    if (!score) {
      throw new NotFoundException("OEM score not found");
    }
    return score;
  }

  async deleteById(user: RequestUser, customerId: string, scoreId: string) {
    await this.ensureCustomerVisible(user, customerId);
    const score = await this.prisma.oemFitScore.findFirst({ where: { id: scoreId, customerId } });
    if (!score) {
      throw new NotFoundException("OEM score not found");
    }
    await this.prisma.oemFitScore.delete({ where: { id: scoreId } });
    return { deleted: true };
  }

  async updateById(
    user: RequestUser,
    customerId: string,
    scoreId: string,
    dto: { manualScore?: number; manualGrade?: string; manualBreakdown?: Record<string, number>; manualNotes?: string }
  ) {
    await this.ensureCustomerVisible(user, customerId);
    const score = await this.prisma.oemFitScore.findFirst({ where: { id: scoreId, customerId } });
    if (!score) {
      throw new NotFoundException("OEM score not found");
    }
    const data: Record<string, unknown> = { manualUpdatedById: user.id, manualUpdatedAt: new Date() };
    if (dto.manualScore !== undefined) data.manualScore = dto.manualScore;
    if (dto.manualGrade !== undefined) data.manualGrade = dto.manualGrade;
    if (dto.manualBreakdown !== undefined) data.manualBreakdown = dto.manualBreakdown;
    if (dto.manualNotes !== undefined) data.manualNotes = dto.manualNotes;
    return this.prisma.oemFitScore.update({ where: { id: scoreId }, data });
  }

  async buildContext(user: RequestUser, customerId: string) {
    const customer = await this.ensureCustomerVisible(user, customerId);
    const [websiteAnalysis, researchReport, contacts, products, capabilities, caseStudies] = await Promise.all([
      this.prisma.websiteAnalysis.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        include: { pages: true, products: true }
      }),
      this.prisma.researchReport.findFirst({
        where: { customerId, status: "SUCCEEDED" },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.contact.findMany({ where: { customerId } }),
      this.prisma.product.findMany({
        where: { companyProfile: { organizationId: user.organizationId } },
        take: 200
      }),
      this.prisma.oemCapability.findMany({
        where: { companyProfile: { organizationId: user.organizationId } }
      }),
      this.prisma.caseStudy.findMany({
        where: { companyProfile: { organizationId: user.organizationId } },
        take: 60
      })
    ]);
    return { customer, websiteAnalysis, researchReport, contacts, products, capabilities, caseStudies };
  }

  private async readOrgWeights(organizationId: string): Promise<OemScoringWeights> {
    const config = await this.prisma.oemScoringConfig.findUnique({
      where: { organizationId }
    });
    if (!config) return { ...DEFAULT_OEM_SCORING_WEIGHTS };
    return mergeWithDefaults((config.weights ?? {}) as Partial<OemScoringWeights>);
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) },
      include: { type: true, source: true, owner: { select: { id: true, name: true, email: true } } }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private findActiveOemScoreRun(customerId: string, organizationId: string) {
    return this.prisma.aiGenerationRun.findFirst({
      where: {
        customerId,
        organizationId,
        type: AiGenerationType.OemFitScore,
        status: { in: ["QUEUED", "RUNNING"] }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}

function calculateDimensions(context: ScoreContext): ScoreDimension[] {
  const website = context.websiteAnalysis;
  const categories = arrayFromJson<Record<string, unknown>>(website?.productCategories);
  const aiInsights = asRecord(asRecord(website?.rawResult).aiInsights);
  const researchJson = asRecord(context.researchReport?.reportJson);
  const researchSummary = asRecord(asRecord(researchJson.sections).summary_development_recommendations);
  const opportunities = [
    ...arrayFromJson<string>(website?.opportunities),
    ...stringArray(aiInsights.cooperation_opportunities),
    ...stringArray(researchJson.oem_odm_opportunities),
    ...stringArray(researchSummary.cooperation_opportunities)
  ];
  const risks = [
    ...arrayFromJson<string>(website?.risks),
    ...stringArray(aiInsights.risk_notes),
    ...stringArray(researchJson.risks),
    ...stringArray(researchSummary.potential_risks)
  ];
  const failedPageCount = website?.pages.filter((page) => page.errorMessage).length ?? 0;
  const validPageCount = website?.pages.filter((page) => !page.errorMessage).length ?? 0;
  const customerKeywords = tokenize([
    context.customer.name,
    context.customer.type?.name,
    context.customer.notes,
    ...categories.flatMap((item) => [text(item.name), text(item.category), ...stringArray(item.keywords)]),
    ...stringArray(aiInsights.main_business),
    ...stringArray(aiInsights.product_line_analysis)
  ].join(" "));
  const ownKeywords = tokenize([
    ...context.products.flatMap((product) => [product.name, product.category, product.description, ...product.tags]),
    ...context.capabilities.flatMap((capability) => [capability.name, capability.category, capability.description, ...capability.certifications])
  ].join(" "));
  const overlap = intersectionCount(customerKeywords, ownKeywords);
  const productLineFit = context.products.length || context.capabilities.length
    ? clamp(Math.round((overlap / Math.max(5, customerKeywords.length)) * 20) + (overlap ? 4 : 0), 4, 20)
    : clamp(categories.length * 3 + (website?.products.length ?? 0), 4, 12);
  const contactQualityRaw = context.contacts.length ? Math.max(...context.contacts.map((contact) => contact.qualityScore)) : 0;
  const publicEmailCount = arrayFromJson<Record<string, unknown>>(website?.contactEvidence).filter((item) => text(item.type) === "email").length;
  const websiteCompletenessRaw = website?.websiteCompleteness ?? Number(asRecord(website?.rawResult).websiteCompleteness) ?? 0;
  const marketEvidence = [
    context.customer.country ? `客户国家/地区：${context.customer.country}` : "",
    context.capabilities.some((capability) => capability.supportedMarkets.includes(context.customer.country ?? "")) ? "我方能力覆盖该市场" : ""
  ].filter(Boolean);

  return [
    {
      key: "productLineFit",
      label: "产品匹配度",
      maxScore: 20,
      score: productLineFit,
      reason: context.products.length || context.capabilities.length
        ? `客户产品/业务关键词与我方产品资料、OEM能力有 ${overlap} 个匹配信号。`
        : "企业资料库中的产品/OEM能力不足，暂按客户官网品类潜力给基础分。",
      evidence: categories.map((item) => text(item.name)).filter(Boolean).slice(0, 5)
    },
    {
      key: "marketFit",
      label: "市场匹配度",
      maxScore: 15,
      score: clamp((context.customer.country ? 9 : 5) + (marketEvidence.length > 1 ? 4 : 0) + (context.caseStudies.some((item) => item.market === context.customer.country) ? 2 : 0), 0, 15),
      reason: context.customer.country ? `客户位于${context.customer.country}，可按目标市场策略开发。` : "客户国家未知，市场匹配度需要补充。",
      evidence: marketEvidence
    },
    {
      key: "priceBandFit",
      label: "价格匹配度",
      maxScore: 15,
      score: clamp(website?.pricePositioning && website.pricePositioning !== "未知" ? 11 : 8, 0, 15),
      reason: website?.pricePositioning && website.pricePositioning !== "未知"
        ? `官网价格/品牌信号显示客户偏${website.pricePositioning}，适合用质量、设计和稳定供货切入。`
        : "官网未明确展示价格区间，暂按中性分处理。",
      evidence: [website?.pricePositioning ?? "", website?.priceRange ? JSON.stringify(website.priceRange) : ""].filter(Boolean)
    },
    {
      key: "brandMaturity",
      label: "品牌成熟度",
      maxScore: 15,
      score: clamp((website?.pages.some((page) => page.pageType === "BRAND") ? 5 : 0) + (categories.length ? 4 : 0) + (websiteCompletenessRaw >= 80 ? 4 : 2) + (context.researchReport ? 2 : 0), 0, 15),
      reason: "根据品牌页、产品线、官网完整度和背调资料判断品牌成熟度。",
      evidence: [website?.pages.some((page) => page.pageType === "BRAND") ? "官网包含品牌页" : "", context.researchReport ? "已有背调报告" : ""].filter(Boolean)
    },
    {
      key: "websiteCompleteness",
      label: "官网完整度",
      maxScore: 10,
      score: clamp(Math.round((websiteCompletenessRaw / 100) * 10), 0, 10),
      reason: website ? `官网有效证据页 ${validPageCount} 个，完整度约 ${websiteCompletenessRaw || 0}/100。` : "尚未完成官网分析。",
      evidence: website?.crawledUrls.slice(0, 5) ?? []
    },
    {
      key: "contactQuality",
      label: "联系人质量",
      maxScore: 10,
      score: clamp(Math.round(contactQualityRaw / 10) + (publicEmailCount ? 1 : 0), 0, 10),
      reason: context.contacts.length ? `CRM已有 ${context.contacts.length} 个联系人，最高质量分 ${contactQualityRaw}。` : "CRM暂无联系人，开发触达风险较高。",
      evidence: context.contacts.map((contact) => contact.name || contact.email || "未命名联系人").slice(0, 5)
    },
    {
      key: "cooperationOpportunity",
      label: "合作机会",
      maxScore: 10,
      score: clamp(4 + opportunities.length * 2 + (context.researchReport ? 1 : 0), 0, 10),
      reason: opportunities.length ? `系统识别到 ${opportunities.length} 条合作机会。` : "暂未识别到强合作机会，需要进一步背调。",
      evidence: opportunities.slice(0, 5)
    },
    {
      key: "riskPenalty",
      label: "风险扣分",
      maxScore: 10,
      score: clamp(risks.length + failedPageCount + (context.customer.riskLevel === "HIGH" ? 3 : 0) + (context.customer.stage === "BLACKLISTED" ? 10 : 0), 0, 10),
      reason: failedPageCount || risks.length ? `存在 ${risks.length} 条风险提示，另有 ${failedPageCount} 个页面抓取异常。` : "暂未识别到明显风险。",
      evidence: risks.slice(0, 5)
    }
  ];
}

function calculateWeightedTotal(dimensions: ScoreDimension[], weights: OemScoringWeights) {
  const breakdown = buildBreakdown(dimensions, weights);
  const bonusSum = Object.entries(breakdown)
    .filter(([key]) => key !== "riskPenalty")
    .reduce((sum, [, val]) => sum + val, 0);
  const riskPenalty = breakdown.riskPenalty ?? 0;
  return clamp(bonusSum - riskPenalty, 0, 100);
}

function buildBreakdown(dimensions: ScoreDimension[], weights: OemScoringWeights): OemScoreBreakdown {
  const result: Record<string, number> = {};
  for (const dim of dimensions) {
    if (dim.key === "riskPenalty") {
      result[dim.key] = clamp(Math.round((dim.score / Math.max(dim.maxScore, 1)) * weights.riskPenaltyMax), 0, weights.riskPenaltyMax);
    } else {
      const normalized = (dim.score / Math.max(dim.maxScore, 1)) * 10;
      const weight = weights[dim.key as keyof OemScoringWeights] ?? 0;
      result[dim.key] = Math.round((normalized * weight) / 10);
    }
  }
  return result as OemScoreBreakdown;
}

function recommendProducts(context: ScoreContext) {
  const website = context.websiteAnalysis;
  const categories = arrayFromJson<Record<string, unknown>>(website?.productCategories);
  const customerTokens = tokenize(categories.map((item) => `${text(item.name)} ${stringArray(item.keywords).join(" ")}`).join(" "));
  const scored = context.products
    .map((product) => {
      const productTokens = tokenize(`${product.name} ${product.category} ${product.description ?? ""} ${product.tags.join(" ")}`);
      const matchScore = intersectionCount(customerTokens, productTokens);
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description,
        priceRange: [product.priceMin?.toString(), product.priceMax?.toString()].filter(Boolean).join("-"),
        currency: product.currency,
        reason: matchScore ? `与客户官网品类有 ${matchScore} 个关键词匹配。` : "可作为补充供货产品进一步人工判断。",
        matchScore
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 8);
  if (scored.length) return scored;
  return [
    {
      name: "待补充推荐产品",
      category: "企业资料库未完善",
      description: "请先在企业资料库录入我方主推产品、价格区间、MOQ和成功案例，系统才能做更准确推荐。",
      reason: "当前缺少我方产品资料。",
      matchScore: 0
    }
  ];
}

function buildFallbackPlan(
  context: ScoreContext,
  dimensions: ScoreDimension[],
  recommendedProducts: Array<Record<string, unknown>>,
  score: number,
  grade: string
): ScorePlan {
  const opportunities = dimensions.find((item) => item.key === "cooperationOpportunity")?.evidence ?? [];
  const risks = dimensions.find((item) => item.key === "riskPenalty")?.evidence ?? [];
  const strategy =
    grade === "A"
      ? "优先开发：建议由业务员在24小时内完成个性化首封邮件，并准备1-2个高度匹配产品方案。"
      : grade === "B"
        ? "正常开发：建议补充关键联系人和产品需求后发送首封开发邮件。"
        : grade === "C"
          ? "观察开发：先补充官网、联系人和采购模式信息，再判断是否投入重点资源。"
          : "暂缓开发：资料不足或风险偏高，建议人工复核后再行动。";
  return {
    development_strategy: {
      summary: strategy,
      grade,
      score,
      priority: grade === "A" ? "高" : grade === "B" ? "中高" : grade === "C" ? "中" : "低"
    },
    recommended_products: recommendedProducts,
    email_entry_points: [
      "引用客户官网中的品牌/产品线作为开场，避免模板化。",
      "围绕新品开发、供应链补充、私标/定制能力提出轻量合作试探。",
      "结合我方最匹配产品给出一个具体样品或目录切入点。"
    ],
    opportunities: opportunities.length ? opportunities : ["可从官网产品线和品牌页切入，进一步确认OEM/ODM需求。"],
    risks: risks.length ? risks : ["暂无明显风险，但仍需人工确认采购模式和关键联系人。"],
    next_actions: [
      "补充或确认采购/产品负责人联系方式。",
      "完善企业资料库中与该客户品类匹配的产品、MOQ、价格和案例。",
      "基于评分结果生成个性化英文开发邮件。"
    ],
    markdown_report: buildScoreMarkdown(context, dimensions, recommendedProducts, score, grade, strategy)
  };
}

function buildScoreMarkdown(
  context: ScoreContext,
  dimensions: ScoreDimension[],
  recommendedProducts: Array<Record<string, unknown>>,
  score: number,
  grade: string,
  strategy: string
) {
  return [
    `# ${context.customer.name} OEM适配评分报告`,
    `## 总体结论`,
    `综合评分：${score}/100，客户等级：${grade}。${strategy}`,
    `## 维度评分`,
    ...dimensions.map((item) => `- ${item.label}：${item.key === "riskPenalty" ? "-" : ""}${item.score}/${item.maxScore}。${item.reason}`),
    `## 推荐供货产品`,
    ...recommendedProducts.slice(0, 5).map((item) => `- ${text(item.name)}：${text(item.reason) || text(item.description) || "建议人工复核匹配度。"}`),
    `## 下一步行动`,
    "- 补充关键联系人与采购模式。",
    "- 完善企业资料库中的产品、价格、MOQ和案例。",
    "- 生成个性化开发邮件并人工审核后发送。"
  ].join("\n\n");
}

function scoringPrompt() {
  return [
    "你是一名资深外贸OEM/ODM客户开发负责人。",
    "请基于输入的客户资料、官网分析、背调、我方产品和OEM能力，生成中文销售可读的OEM开发策略。",
    "不要修改分数。不要编造客户或我方没有的能力。",
    "返回严格JSON对象，字段包括：development_strategy, recommended_products, email_entry_points, opportunities, risks, next_actions, markdown_report。",
    "recommended_products 必须基于输入的我方产品；如果资料不足，明确写需要补充企业资料库。",
    "markdown_report 使用中文Markdown，面向业务员，不要超过1800字。"
  ].join("\n");
}

function parseAiPlan(content: string, fallback: ReturnType<typeof buildFallbackPlan>) {
  const parsed = safeJson(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    development_strategy: asRecord(record.development_strategy) || fallback.development_strategy,
    recommended_products: arrayFromJson<Record<string, unknown>>(record.recommended_products).length ? arrayFromJson<Record<string, unknown>>(record.recommended_products) : fallback.recommended_products,
    email_entry_points: stringArray(record.email_entry_points).length ? stringArray(record.email_entry_points) : fallback.email_entry_points,
    opportunities: stringArray(record.opportunities).length ? stringArray(record.opportunities) : fallback.opportunities,
    risks: stringArray(record.risks).length ? stringArray(record.risks) : fallback.risks,
    next_actions: stringArray(record.next_actions).length ? stringArray(record.next_actions) : fallback.next_actions,
    markdown_report: text(record.markdown_report) || fallback.markdown_report
  };
}

function compactWebsiteAnalysis(analysis: ScoreContext["websiteAnalysis"]) {
  if (!analysis) return null;
  const raw = asRecord(analysis.rawResult);
  return {
    status: analysis.status,
    websiteCompleteness: analysis.websiteCompleteness,
    pricePositioning: analysis.pricePositioning,
    productCategories: analysis.productCategories,
    productCount: analysis.productCount,
    contacts: analysis.contactEvidence,
    opportunities: analysis.opportunities,
    risks: analysis.risks,
    aiInsights: raw.aiInsights,
    validPages: analysis.pages.filter((page) => !page.errorMessage).map((page) => ({ pageType: page.pageType, title: page.title, url: page.url }))
  };
}

function compactResearchReport(report: ScoreContext["researchReport"]) {
  if (!report) return null;
  const reportJson = asRecord(report.reportJson);
  const sections = asRecord(reportJson.sections);
  if (Object.keys(sections).length) {
    const summarySection = asRecord(sections.summary_development_recommendations);
    const rating = text(summarySection.customer_value_rating);
    const priority = text(summarySection.development_priority);
    return {
      title: text(reportJson.title) || report.title,
      summary: [rating ? `客户价值评级：${rating}` : "", priority ? `开发优先级：${priority}` : ""].filter(Boolean).join("，"),
      opportunities: stringArray(summarySection.cooperation_opportunities),
      risks: stringArray(summarySection.potential_risks),
      recommendations: stringArray(summarySection.recommended_products),
      nextActions: stringArray(summarySection.next_actions)
    };
  }
  return {
    title: report.title,
    summary: text(reportJson.summary),
    opportunities: reportJson.oem_odm_opportunities,
    risks: reportJson.risks,
    recommendations: reportJson.development_recommendations,
    nextActions: reportJson.next_actions
  };
}

function toGrade(score: number) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function arrayFromJson<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string") return [value].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : text(asRecord(item).summary) || text(asRecord(item).name) || text(asRecord(item).description))).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function tokenize(input: string) {
  return Array.from(new Set(input.toLowerCase().match(/[a-z0-9\u4e00-\u9fa5]+/g) ?? [])).filter((word) => word.length > 1);
}

function intersectionCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
