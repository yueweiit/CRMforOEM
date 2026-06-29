import { Processor, WorkerHost } from "@nestjs/bullmq";
import { WebsiteAnalysisResult } from "@oem-crm/shared";
import { Job } from "bullmq";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  AiGenerationService,
  AiProviderService,
  AiRetryService,
  AiBudgetService,
  AiTextCompressor,
  AiSummaryCache,
  AiRetryExhaustedError,
  AI_FINAL_TARGET_CHARS,
  AI_FINAL_WARNING_CHARS,
  AI_FINAL_HARD_LIMIT_CHARS,
  AI_GLOBAL_HARD_LIMIT_CHARS
} from "../ai/ai.public";
import type { AiErrorKind, AiGenerationMeta, SummaryPipelineMeta } from "../ai/ai.public";
import { buildBoundedWebsiteAiInput } from "./builders/website-ai-input.builder";
import { buildWebsiteAiBatchInput } from "./builders/website-ai-batch-input.builder";
import type { BatchGroupSummary } from "./builders/website-ai-batch-input.builder";
import { buildWebsiteEvidenceInventory } from "./builders/website-evidence-inventory.builder";
import { buildWebsiteGroups } from "./builders/website-evidence-grouper";
import { WEBSITE_ANALYSIS_QUEUE } from "./website-analysis.constants";
import { WebsiteCrawlerService } from "./website-crawler.service";
import { parseWebsiteAiInsights, fallbackWebsiteAiInsights } from "./parsers/website-ai-insight.parser";
import type { WebsiteAiInsights } from "./website-analysis.types";
import type { WebsiteAnalysisCompanyProfile } from "./website-analysis.types";

type AiOutcome = {
  aiInsights: WebsiteAiInsights;
  errorMessage?: string;
  aiMeta: AiGenerationMeta;
  summaryPipeline?: SummaryPipelineMeta;
  sourceEvidence: {
    pages: Array<{ sourceId: string; url: string; title?: string; pageType: string }>;
    products: Array<{ sourceId: string; name: string; category?: string; evidenceUrls: string[] }>;
    contacts: Array<{ sourceId: string; type: string; value: string; sourceUrl?: string }>;
  };
};

@Processor(WEBSITE_ANALYSIS_QUEUE)
export class WebsiteAnalysisProcessor extends WorkerHost {
  private readonly retry: AiRetryService;
  private readonly budget: AiBudgetService;
  private readonly compressor: AiTextCompressor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: WebsiteCrawlerService,
    aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService,
    private readonly cache: AiSummaryCache
  ) {
    super();
    this.budget = new AiBudgetService();
    this.compressor = new AiTextCompressor();
    this.retry = new AiRetryService(aiProvider, this.budget);
  }

  async process(job: Job<{ analysisId: string; customerId: string; websiteUrl: string }>) {
    const { analysisId, websiteUrl } = job.data;
    const analysis = await this.prisma.websiteAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
      include: { customer: { select: { organizationId: true } } }
    });
    const started = await this.prisma.websiteAnalysis.updateMany({
      where: { id: analysisId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    if (started.count === 0) return;
    const organizationId = analysis.customer.organizationId;

    try {
      const result = await this.crawler.analyze(websiteUrl);
      const companyProfile = await this.prisma.companyProfile.findFirst({
        where: { organizationId },
        include: { products: { take: 80 }, capabilities: true }
      });
      const aiOutcome = await this.generateAiInsights(result, companyProfile, analysis.aiGenerationRunId);

      await this.persistCrawlerResult(analysisId, result, aiOutcome);
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

  private async generateAiInsights(
    result: WebsiteAnalysisResult,
    companyProfile: WebsiteAnalysisCompanyProfile,
    aiGenerationRunId?: string | null
  ): Promise<AiOutcome> {
    const t0 = Date.now();
    const evidence = buildWebsiteEvidenceInventory(result);
    const directInput = buildBoundedWebsiteAiInput(result, companyProfile);
    const directPayload = JSON.stringify(directInput);
    const inputChars = directPayload.length;

    let mode: AiGenerationMeta["mode"] = "DIRECT";
    let aiInsights: WebsiteAiInsights;
    let errorMessage: string | undefined;
    let errorKind: AiGenerationMeta["errorKind"];
    let summaryPipeline: SummaryPipelineMeta | undefined;
    let parseOk = false;

    // Build source evidence regardless of path
    const sourceEvidence = {
      pages: evidence
        .filter((e) => e.kind === "PAGE")
        .map((e) => ({ sourceId: e.sourceId, url: e.url, title: e.title, pageType: e.pageType })),
      products: evidence
        .filter((e) => e.kind === "PRODUCT")
        .map((e) => ({ sourceId: e.sourceId, name: e.name, category: e.category, evidenceUrls: e.evidenceUrls })),
      contacts: evidence
        .filter((e) => e.kind === "CONTACT")
        .map((e) => ({ sourceId: e.sourceId, type: e.type, value: e.value, sourceUrl: e.sourceUrl }))
    };

    const cacheScope = aiGenerationRunId ?? `website-${Date.now()}`;
    const cachePromptVersion = "website-analysis-v1";
    const maxCalls = this.cache.getMaxCalls(evidence.length, result.pages.length);

    try {
      if (inputChars > AI_GLOBAL_HARD_LIMIT_CHARS) {
        const groups = buildWebsiteGroups(evidence, result);
        if (!groups.length) {
          mode = "SKIPPED";
          return {
            aiInsights: fallbackWebsiteAiInsights(result),
            errorMessage: "AI input exceeds global hard limit and no groups available — AI skipped",
            aiMeta: {
              mode, status: "SKIPPED", inputChars,
              estimatedInputTokens: Math.ceil(inputChars / 2),
              attemptCount: 0, retryCount: 0,
              durationMs: Date.now() - t0,
              errorKind: "INPUT_TOO_LARGE",
              errorMessage: "AI input exceeds 30,000 chars global hard limit"
            },
            summaryPipeline: undefined,
            sourceEvidence
          };
        }
        mode = "BATCH_SUMMARY";
      } else if (inputChars <= AI_FINAL_WARNING_CHARS) {
        mode = "DIRECT";
      } else {
        mode = "BATCH_SUMMARY";
      }

      if (mode === "DIRECT") {
        const contentHash = this.cache.computeContentHash(directPayload);
        const cacheKey = { scope: cacheScope, groupName: "direct", batchIndex: 0, contentHash, promptVersion: cachePromptVersion };
        let completionContent: string;

        const cached = this.cache.get(cacheKey);
        if (cached) {
          completionContent = cached;
        } else if (this.cache.canCall(cacheScope, maxCalls)) {
          const completion = await this.retry.completeWithRetry({
            system: websiteAnalysisPrompt(),
            user: directPayload,
            jsonMode: true
          });
          this.cache.recordCall(cacheScope);
          this.cache.set(cacheKey, completion.content);
          completionContent = completion.content;
        } else {
          // Call limit reached, use fallback
          return {
            aiInsights: fallbackWebsiteAiInsights(result),
            errorMessage: "AI call limit reached — using fallback",
            aiMeta: {
              mode: "FALLBACK", status: "SKIPPED", inputChars,
              estimatedInputTokens: Math.ceil(inputChars / 2),
              attemptCount: 0, retryCount: 0,
              durationMs: Date.now() - t0,
              errorKind: "UNKNOWN",
              errorMessage: `Call limit ${maxCalls} reached for scope ${cacheScope}`
            },
            summaryPipeline: undefined,
            sourceEvidence
          };
        }

        const parsed = parseWebsiteAiInsights(completionContent, result);
        aiInsights = parsed.ok ? parsed.data : parsed.fallback;
        parseOk = parsed.ok;
        if (!parsed.ok) {
          errorKind = parsed.reason as AiGenerationMeta["errorKind"];
          errorMessage = parsed.warnings.join("; ") || `AI parse failed: ${parsed.reason}`;
        }

      } else {
        // BATCH_SUMMARY mode
        const groups = buildWebsiteGroups(evidence, result);
        const groupMap: SummaryPipelineMeta["groups"] = {};

        if (!groups.length) {
          // No groups — fallback to direct with cache
          const contentHash = this.cache.computeContentHash(directPayload);
          const cacheKey = { scope: cacheScope, groupName: "direct", batchIndex: 0, contentHash, promptVersion: cachePromptVersion };
          let completionContent: string;

          const cached = this.cache.get(cacheKey);
          if (cached) {
            completionContent = cached;
          } else if (this.cache.canCall(cacheScope, maxCalls)) {
            const completion = await this.retry.completeWithRetry({
              system: websiteAnalysisPrompt(),
              user: directPayload,
              jsonMode: true
            });
            this.cache.recordCall(cacheScope);
            this.cache.set(cacheKey, completion.content);
            completionContent = completion.content;
          } else {
            return {
              aiInsights: fallbackWebsiteAiInsights(result),
              errorMessage: "AI call limit reached — using fallback",
              aiMeta: {
                mode: "FALLBACK", status: "SKIPPED", inputChars,
                estimatedInputTokens: Math.ceil(inputChars / 2),
                attemptCount: 0, retryCount: 0,
                durationMs: Date.now() - t0,
                errorKind: "UNKNOWN",
                errorMessage: `Call limit ${maxCalls} reached for scope ${cacheScope}`
              },
              summaryPipeline: undefined,
              sourceEvidence
            };
          }

          const parsed = parseWebsiteAiInsights(completionContent, result);
          aiInsights = parsed.ok ? parsed.data : parsed.fallback;
          parseOk = parsed.ok;
          if (!parsed.ok) {
            errorKind = parsed.reason as AiGenerationMeta["errorKind"];
            errorMessage = parsed.warnings.join("; ") || `AI parse failed: ${parsed.reason}`;
          }
        } else {
          const batchInput = buildWebsiteAiBatchInput(groups, companyProfile);
          batchInput.groups = this.compressor.compressFinalInput(batchInput.groups, {
            targetChars: AI_FINAL_TARGET_CHARS,
            hardLimitChars: AI_FINAL_HARD_LIMIT_CHARS
          }) as BatchGroupSummary[];

          const finalPayload = JSON.stringify(batchInput);
          const contentHash = this.cache.computeContentHash(finalPayload);
          const cacheKey = { scope: cacheScope, groupName: "batch", batchIndex: 0, contentHash, promptVersion: cachePromptVersion };
          let completionContent: string;

          const cached = this.cache.get(cacheKey);
          if (cached) {
            completionContent = cached;
          } else if (this.cache.canCall(cacheScope, maxCalls)) {
            const completion = await this.retry.completeWithRetry({
              system: websiteAnalysisPrompt(),
              user: finalPayload,
              jsonMode: true
            });
            this.cache.recordCall(cacheScope);
            this.cache.set(cacheKey, completion.content);
            completionContent = completion.content;
          } else {
            return {
              aiInsights: fallbackWebsiteAiInsights(result),
              errorMessage: "AI call limit reached — using fallback",
              aiMeta: {
                mode: "FALLBACK", status: "SKIPPED", inputChars,
                estimatedInputTokens: Math.ceil(inputChars / 2),
                attemptCount: 0, retryCount: 0,
                durationMs: Date.now() - t0,
                errorKind: "UNKNOWN",
                errorMessage: `Call limit ${maxCalls} reached for scope ${cacheScope}`
              },
              summaryPipeline: undefined,
              sourceEvidence
            };
          }

          const parsed = parseWebsiteAiInsights(completionContent, result);
          aiInsights = parsed.ok ? parsed.data : parsed.fallback;
          parseOk = parsed.ok;
          if (!parsed.ok) {
            errorKind = parsed.reason as AiGenerationMeta["errorKind"];
            errorMessage = parsed.warnings.join("; ") || `AI parse failed: ${parsed.reason}`;
          }

          // Set group status based on actual parse result
          const groupStatus = parsed.ok ? "succeeded" as const : "fallback" as const;
          for (const group of groups) {
            groupMap[group.groupName] = {
              status: groupStatus,
              batchCount: 1,
              failedBatchCount: parsed.ok ? 0 : 1,
              sourceCount: group.sourceIds.length
            };
          }

          summaryPipeline = {
            status: parsed.ok ? "succeeded" : "partial_succeeded",
            mode: "BATCH_SUMMARY",
            inputChars,
            finalInputChars: finalPayload.length,
            attemptCount: 1,
            retryCount: 0,
            groups: groupMap,
            errors: parsed.warnings.map((w) => ({
              scope: "final",
              errorKind: "INVALID_JSON" as const,
              message: w
            }))
          };
        }
      }

      if (aiGenerationRunId) {
        if (parseOk) {
          await this.aiGeneration.markSucceeded(aiGenerationRunId,
            { choices: [{ message: { content: JSON.stringify(aiInsights) } }] },
            undefined
          );
          await this.aiGeneration.addRawAiVersion(aiGenerationRunId, JSON.stringify(aiInsights), aiInsights);
        } else {
          await this.aiGeneration.markFailed(aiGenerationRunId,
            errorMessage || `AI parse failed: ${errorKind ?? "UNKNOWN"}`
          );
        }
      }

      return {
        aiInsights,
        aiMeta: {
          mode,
          status: parseOk ? "SUCCEEDED" : "FAILED",
          inputChars,
          estimatedInputTokens: Math.ceil(inputChars / 2),
          attemptCount: 1,
          retryCount: 0,
          durationMs: Date.now() - t0,
          errorKind: parseOk ? undefined : errorKind,
          errorMessage: parseOk ? undefined : errorMessage
        },
        summaryPipeline,
        sourceEvidence
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI website summary error";
      if (aiGenerationRunId) {
        await this.aiGeneration.markFailed(aiGenerationRunId, message);
      }

      const caughtErrorKind: AiGenerationMeta["errorKind"] =
        error instanceof AiRetryExhaustedError ? error.errorKind : errorKind;

      return {
        aiInsights: fallbackWebsiteAiInsights(result),
        errorMessage: toUserFacingAiErrorMessage(caughtErrorKind ?? "UNKNOWN", message),
        aiMeta: {
          mode,
          status: "FAILED",
          inputChars,
          estimatedInputTokens: Math.ceil(inputChars / 2),
          attemptCount: 3,
          retryCount: 3,
          durationMs: Date.now() - t0,
          errorKind: caughtErrorKind,
          errorMessage: message
        },
        summaryPipeline,
        sourceEvidence
      };
    }
  }

  private async persistCrawlerResult(
    analysisId: string,
    result: WebsiteAnalysisResult,
    aiOutcome: AiOutcome
  ) {
    const { aiInsights, aiMeta, summaryPipeline, sourceEvidence } = aiOutcome;
    // Only set errorMessage for fatal crawler-level errors; AI quality goes in aiMeta
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
        rawResult: {
          ...result,
          aiInsights,
          aiInsightError: aiOutcome.errorMessage,
          aiMeta,
          summaryPipeline,
          sourceEvidence
        } as never,
        errorMessage: undefined // Non-fatal AI errors don't set analysis-level errorMessage
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
    "evidence_pages 只放有效页面，包含 title、url、reason，可选 sourceId 对应输入中的页面/产品编号。",
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

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length ? items : fallback;
}

function toUserFacingAiErrorMessage(errorKind: AiErrorKind | string, rawMessage: string): string {
  if (errorKind === "NETWORK") return "无法连接到AI服务，请检查网络或稍后重试。";
  if (errorKind === "TIMEOUT") return "AI服务响应超时，请稍后重试。";
  if (errorKind === "AUTH") return "AI服务认证失败，请联系管理员。";
  if (errorKind === "RATE_LIMIT") return "AI服务请求过于频繁，请稍后重试。";
  return rawMessage;
}
