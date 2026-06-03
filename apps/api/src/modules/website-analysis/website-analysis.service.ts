import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";
import { AiGenerationType } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { WEBSITE_ANALYSIS_QUEUE } from "./website-analysis.constants";

@Injectable()
export class WebsiteAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    @InjectQueue(WEBSITE_ANALYSIS_QUEUE) private readonly queue: Queue
  ) {}

  async enqueueForCustomer(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer?.websiteUrl) {
      throw new NotFoundException("Customer or website URL not found");
    }

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

    return analysis;
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
