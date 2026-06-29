import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AiGenerationType } from "@oem-crm/shared";
import { Queue } from "bullmq";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { AiGenerationService, AiProviderService } from "../ai/ai.public";
import { TaskSubmissionLockService } from "../background-tasks/background-tasks.public";
import { GenerateResearchReportDto } from "./dto/generate-research-report.dto";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import { ResearchReportDataService } from "./services/research-report-data.service";

@Injectable()
export class ResearchService {
  constructor(
    private readonly reportData: ResearchReportDataService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly taskLocks: TaskSubmissionLockService,
    @InjectQueue(RESEARCH_REPORT_QUEUE) private readonly queue: Queue
  ) {}

  async generate(user: RequestUser, customerId: string, dto: GenerateResearchReportDto) {
    const customer = await this.reportData.ensureCustomerVisible(user, customerId);

    const existing = await this.reportData.findActiveReport(customerId, user.organizationId);
    if (existing) {
      return { accepted: false, reason: "ACTIVE_RESEARCH_REPORT_EXISTS", existing };
    }

    const lockKey = this.taskLocks.buildKey({
      organizationId: user.organizationId, type: "research-report", scope: customerId
    });
    const locked = await this.taskLocks.acquire(lockKey, 600, {
      userId: user.id, customerId, createdAt: new Date().toISOString()
    });
    if (!locked) {
      const lockedExisting = await this.reportData.findActiveReport(customerId, user.organizationId);
      return { accepted: false, reason: "RESEARCH_REPORT_SUBMISSION_LOCKED", existing: lockedExisting };
    }

    try {
      return await this.createReportAndEnqueue(user, customer, dto);
    } finally {
      await this.taskLocks.release(lockKey);
    }
  }

  async getLatest(user: RequestUser, customerId: string) {
    await this.reportData.ensureCustomerVisible(user, customerId);
    return this.reportData.getLatestReport(customerId);
  }

  async listHistory(user: RequestUser, customerId: string) {
    await this.reportData.ensureCustomerVisible(user, customerId);
    return this.reportData.listReports(customerId);
  }

  async getById(user: RequestUser, customerId: string, reportId: string) {
    await this.reportData.ensureCustomerVisible(user, customerId);
    const report = await this.reportData.getReportById(customerId, reportId);
    if (!report) {
      throw new NotFoundException("Research report not found");
    }
    return report;
  }

  private async createReportAndEnqueue(
    user: RequestUser,
    customer: { id: string; name: string; websiteUrl: string | null; country: string | null;
                language: string | null; typeId: string | null; sourceId: string | null },
    dto: GenerateResearchReportDto
  ) {
    const latestAnalysis = await this.reportData.getLatestWebsiteAnalysis(customer.id);
    const rawInput = {
      customer: {
        id: customer.id, name: customer.name, websiteUrl: customer.websiteUrl,
        country: customer.country, language: customer.language,
        typeId: customer.typeId, sourceId: customer.sourceId
      },
      latestWebsiteAnalysis: latestAnalysis
        ? { id: latestAnalysis.id, status: latestAnalysis.status,
            crawledUrlCount: latestAnalysis.crawledUrls.length,
            productCount: latestAnalysis.productCount, createdAt: latestAnalysis.createdAt }
        : null,
      salesNotes: dto.salesNotes, mode: "queued"
    };
    const run = await this.aiGeneration.createRun({
      organizationId: user.organizationId, customerId: customer.id,
      type: AiGenerationType.ResearchReport, model: this.aiProvider.model,
      promptVersion: "research-report-v4", rawInput, createdById: user.id
    });
    const report = await this.reportData.createReport({
      customerId: customer.id, aiGenerationRunId: run.id,
      title: `${customer.name} 客户背调报告`,
      sourceEvidence: {
        latestWebsiteAnalysisId: latestAnalysis?.id ?? null,
        latestWebsiteAnalysisStatus: latestAnalysis?.status ?? null,
        warning: latestAnalysis?.status === "SUCCEEDED" ? null : "未使用已完成的官网深度分析，报告可信度会降低。"
      },
      createdById: user.id
    });
    await this.queue.add("generate-research-report", {
      reportId: report.id, organizationId: user.organizationId,
      customerId: customer.id, salesNotes: dto.salesNotes
    });
    await this.reportData.updateCustomerStageToResearching(customer.id);
    return { accepted: true, report };
  }
}
