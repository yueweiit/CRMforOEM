import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AiGenerationType, CustomerStage } from "@oem-crm/shared";
import { Queue } from "bullmq";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { GenerateResearchReportDto } from "./dto/generate-research-report.dto";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    @InjectQueue(RESEARCH_REPORT_QUEUE) private readonly queue: Queue
  ) {}

  async generate(user: RequestUser, customerId: string, dto: GenerateResearchReportDto) {
    const customer = await this.ensureCustomerVisible(user, customerId);
    const latestAnalysis = await this.prisma.websiteAnalysis.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, crawledUrls: true, productCount: true, createdAt: true }
    });

    const rawInput = {
      customer: {
        id: customer.id,
        name: customer.name,
        websiteUrl: customer.websiteUrl,
        country: customer.country,
        language: customer.language,
        typeId: customer.typeId,
        sourceId: customer.sourceId
      },
      latestWebsiteAnalysis: latestAnalysis
        ? {
            id: latestAnalysis.id,
            status: latestAnalysis.status,
            crawledUrlCount: latestAnalysis.crawledUrls.length,
            productCount: latestAnalysis.productCount,
            createdAt: latestAnalysis.createdAt
          }
        : null,
      salesNotes: dto.salesNotes,
      mode: "queued"
    };

    const run = await this.aiGeneration.createRun({
      organizationId: user.organizationId,
      customerId,
      type: AiGenerationType.ResearchReport,
      model: this.aiProvider.model,
      promptVersion: "research-report-v3",
      rawInput,
      createdById: user.id
    });

    const report = await this.prisma.researchReport.create({
      data: {
        customerId,
        aiGenerationRunId: run.id,
        status: "QUEUED",
        title: `${customer.name} 客户背调报告`,
        sourceEvidence: {
          latestWebsiteAnalysisId: latestAnalysis?.id ?? null,
          latestWebsiteAnalysisStatus: latestAnalysis?.status ?? null,
          warning: latestAnalysis?.status === "SUCCEEDED" ? null : "未使用已完成的官网深度分析，报告可信度会降低。"
        } as never,
        createdById: user.id
      },
      include: { aiGenerationRun: { include: { versions: true } } }
    });

    await this.queue.add("generate-research-report", {
      reportId: report.id,
      organizationId: user.organizationId,
      customerId,
      salesNotes: dto.salesNotes
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { stage: CustomerStage.Researching as never }
    });

    return report;
  }

  async getLatest(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.researchReport.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });
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
