import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";
import { AiGenerationType } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { asFiniteScore, asRecord, asStringArray } from "../../common/input-sanitizers";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AiGenerationService, AiProviderService } from "../ai/ai.public";
import { BackgroundTaskStaleService, TaskSubmissionLockService } from "../background-tasks/background-tasks.public";
import { WEBSITE_ANALYSIS_QUEUE } from "./website-analysis.constants";

type WebsiteAnalysisUpdateDto = {
  opportunities?: string[];
  risks?: string[];
  aiInsights?: Record<string, unknown>;
};

const EDITABLE_AI_INSIGHT_TEXT_FIELDS = [
  "business_summary",
  "customer_profile",
  "main_business",
  "product_line_analysis",
  "brand_positioning",
  "market_channel_signals",
  "oem_opportunity_assessment",
  "our_data_quality_note"
] as const;

const EDITABLE_AI_INSIGHT_STRING_ARRAY_FIELDS = [
  "cooperation_opportunities",
  "sales_entry_points",
  "suggested_next_actions",
  "risk_notes",
  "unknown_factors"
] as const;

function buildEditableAiInsights(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...existing };

  for (const key of EDITABLE_AI_INSIGHT_TEXT_FIELDS) {
    const value = incoming[key];
    if (typeof value === "string") {
      merged[key] = value.trim();
    }
  }

  for (const key of EDITABLE_AI_INSIGHT_STRING_ARRAY_FIELDS) {
    if (!(key in incoming)) continue;
    merged[key] = asStringArray(incoming[key]);
  }

  if (Array.isArray(incoming.missing_categories_gap)) {
    const existingItems = Array.isArray(existing.missing_categories_gap) ? existing.missing_categories_gap : [];
    merged.missing_categories_gap = incoming.missing_categories_gap.map((item, index) => {
      const record = asRecord(item);
      const existingRecord = asRecord(existingItems[index]);
      return {
        category: typeof record.category === "string" ? record.category.trim() : "",
        customer_has: typeof record.customer_has === "string" ? record.customer_has.trim() : "",
        we_can_supply: typeof record.we_can_supply === "string" ? record.we_can_supply.trim() : "",
        opportunity_score: asFiniteScore(record.opportunity_score, asFiniteScore(existingRecord.opportunity_score, 5)),
        reason: typeof record.reason === "string" ? record.reason.trim() : "",
        data_quality_note: typeof record.data_quality_note === "string" ? record.data_quality_note.trim() : ""
      };
    });
  }

  const incomingPrice = asRecord(incoming.price_competitiveness);
  if (Object.keys(incomingPrice).length) {
    const existingPrice = asRecord(existing.price_competitiveness);
    const level = typeof incomingPrice.level === "string" ? incomingPrice.level : existingPrice.level;
    merged.price_competitiveness = {
      level: level === "competitive" || level === "neutral" || level === "challenging" || level === "unknown" ? level : "unknown",
      summary: typeof incomingPrice.summary === "string" ? incomingPrice.summary.trim() : String(existingPrice.summary ?? ""),
      price_nature_note: typeof incomingPrice.price_nature_note === "string" ? incomingPrice.price_nature_note.trim() : String(existingPrice.price_nature_note ?? "")
    };
  }

  if (existing.evidence_pages !== undefined) {
    merged.evidence_pages = existing.evidence_pages;
  } else {
    delete merged.evidence_pages;
  }

  return merged;
}

@Injectable()
export class WebsiteAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly taskLocks: TaskSubmissionLockService,
    private readonly staleTasks: BackgroundTaskStaleService,
    @InjectQueue(WEBSITE_ANALYSIS_QUEUE) private readonly queue: Queue
  ) {}

  async enqueueForCustomer(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer?.websiteUrl) {
      throw new NotFoundException("Customer or website URL not found");
    }

    await this.staleTasks.markStaleCustomerTasks(user.organizationId, customerId);
    const existing = await this.findActiveWebsiteAnalysis(customerId, user.organizationId);
    if (existing) {
      return {
        accepted: false,
        reason: "ACTIVE_WEBSITE_ANALYSIS_EXISTS",
        existing
      };
    }

    const lockKey = this.taskLocks.buildKey({
      organizationId: user.organizationId,
      type: "website-analysis",
      scope: customerId
    });

    const locked = await this.taskLocks.acquire(lockKey, 600, {
      userId: user.id,
      customerId,
      createdAt: new Date().toISOString()
    });

    if (!locked) {
      const lockedExisting = await this.findActiveWebsiteAnalysis(customerId, user.organizationId);
      return {
        accepted: false,
        reason: "WEBSITE_ANALYSIS_SUBMISSION_LOCKED",
        existing: lockedExisting
      };
    }

    try {
      const companyProfile = await this.prisma.companyProfile.findFirst({
        where: { organizationId: user.organizationId },
        select: {
          id: true,
          displayName: true,
          products: {
            select: { category: true, priceMin: true },
            take: 200
          },
          capabilities: {
            select: { category: true }
          }
        }
      });
      const uniqueProductCategories = [...new Set(companyProfile?.products.map((product) => product.category) ?? [])];
      const uniqueCapabilityCategories = [...new Set(companyProfile?.capabilities.map((capability) => capability.category) ?? [])];
      const hasPriceData = companyProfile?.products.some((product) => product.priceMin != null) ?? false;

      const run = await this.aiGeneration.createRun({
        organizationId: user.organizationId,
        customerId,
        type: AiGenerationType.WebsiteAnalysis,
        model: this.aiProvider.model,
        promptVersion: "website-analysis-v2",
        rawInput: {
          customer: {
            id: customer.id,
            name: customer.name,
            websiteUrl: customer.websiteUrl,
            country: customer.country,
            language: customer.language
          },
          ourProfile: companyProfile
            ? {
                id: companyProfile.id,
                displayName: companyProfile.displayName,
                productCount: companyProfile.products.length,
                productCategories: uniqueProductCategories.slice(0, 30),
                hasPriceData,
                capabilityCount: companyProfile.capabilities.length,
                capabilityCategories: uniqueCapabilityCategories
              }
            : null
        },
        createdById: user.id
      });

      const analysis = await this.prisma.websiteAnalysis.create({
        data: {
          customerId,
          aiGenerationRunId: run.id,
          status: "QUEUED"
        }
      });

      await this.queue.add("analyze-website", {
        analysisId: analysis.id,
        customerId,
        websiteUrl: customer.websiteUrl
      });

      return {
        accepted: true,
        analysis
      };
    } finally {
      await this.taskLocks.release(lockKey);
    }
  }

  private findActiveWebsiteAnalysis(customerId: string, organizationId: string) {
    return this.prisma.websiteAnalysis.findFirst({
      where: {
        customerId,
        customer: { organizationId },
        status: { in: ["QUEUED", "RUNNING"] }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async getLatest(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.websiteAnalysis.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        pages: { orderBy: [{ pageType: "asc" }, { depth: "asc" }] },
        products: { orderBy: { confidence: "desc" } }
      }
    });
  }

  async listHistory(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.websiteAnalysis.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        createdAt: true,
        homePageTitle: true,
        websiteCompleteness: true,
        productCount: true,
        pricePositioning: true,
        errorMessage: true
      }
    });
  }

  async getById(user: RequestUser, id: string) {
    const analysis = await this.prisma.websiteAnalysis.findFirst({
      where: {
        id,
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        pages: { orderBy: [{ pageType: "asc" }, { depth: "asc" }] },
        products: { orderBy: { confidence: "desc" } }
      }
    });
    if (!analysis) {
      throw new NotFoundException("Website analysis not found");
    }
    return analysis;
  }

  async deleteById(user: RequestUser, id: string) {
    const analysis = await this.prisma.websiteAnalysis.findFirst({
      where: { id, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!analysis) {
      throw new NotFoundException("Website analysis not found");
    }
    if (analysis.status === "QUEUED" || analysis.status === "RUNNING") {
      throw new BadRequestException("Cannot delete analysis while it is still running");
    }
    await this.prisma.websiteAnalysis.delete({ where: { id } });
    return { deleted: true };
  }

  async updateById(user: RequestUser, id: string, dto: WebsiteAnalysisUpdateDto) {
    const analysis = await this.prisma.websiteAnalysis.findFirst({
      where: { id, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!analysis) {
      throw new NotFoundException("Website analysis not found");
    }
    const data: Record<string, unknown> = {};
    if (dto.opportunities !== undefined) data.opportunities = dto.opportunities;
    if (dto.risks !== undefined) data.risks = dto.risks;

    if (dto.aiInsights !== undefined) {
      const rawResult = asRecord(analysis.rawResult);
      const existingAiInsights = asRecord(rawResult.aiInsights);
      const aiInsights = buildEditableAiInsights(existingAiInsights, dto.aiInsights);
      data.rawResult = {
        ...rawResult,
        aiInsights
      };
      if ("cooperation_opportunities" in dto.aiInsights) {
        data.opportunities = asStringArray(aiInsights.cooperation_opportunities);
      }
      if ("risk_notes" in dto.aiInsights) {
        data.risks = asStringArray(aiInsights.risk_notes);
      }
    }

    return this.prisma.websiteAnalysis.update({ where: { id }, data });
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }
}
