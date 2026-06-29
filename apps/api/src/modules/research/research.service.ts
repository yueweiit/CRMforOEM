import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AiGenerationType } from "@oem-crm/shared";
import { Queue } from "bullmq";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { asRecord, asStringArray, editableText } from "../../common/input-sanitizers";
import { AiGenerationService, AiProviderService } from "../ai/ai.public";
import { BackgroundTaskStaleService, TaskSubmissionLockService } from "../background-tasks/background-tasks.public";
import { GenerateResearchReportDto } from "./dto/generate-research-report.dto";
import { UpdateResearchReportDto } from "./dto/update-research-report.dto";
import { buildMarkdownReportV2 } from "./parsers/research-output-parser";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import {
  RESEARCH_RECOMMENDATION_FIELDS,
  RESEARCH_SECTION_ORDER,
  RESEARCH_STRUCTURED_SECTION_SCHEMA,
  type ResearchSectionKey
} from "./research-report-schema";
import { ResearchReportDataService } from "./services/research-report-data.service";

const EDITABLE_RESEARCH_SYSTEM_FIELDS = [
  "source_basis",
  "sourceEvidence",
  "aiMeta",
  "summaryPipeline"
] as const;

function buildEditableResearchSections(existingSections: Record<string, unknown>, incomingSections: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...existingSections };

  for (const sectionKey of RESEARCH_SECTION_ORDER) {
    const incomingSection = asRecord(incomingSections[sectionKey]);
    if (!Object.keys(incomingSection).length) continue;

    if (sectionKey === "summary_development_recommendations") {
      const existingSection = asRecord(existingSections[sectionKey]);
      const nextSection: Record<string, unknown> = { ...existingSection };
      for (const field of RESEARCH_RECOMMENDATION_FIELDS) {
        if (!(field.key in incomingSection)) continue;
        nextSection[field.key] = field.kind === "list"
          ? asStringArray(incomingSection[field.key])
          : editableText(incomingSection[field.key]);
      }
      merged[sectionKey] = nextSection;
      continue;
    }

    const typedKey = sectionKey as Exclude<ResearchSectionKey, "summary_development_recommendations">;
    const existingSection = asRecord(existingSections[sectionKey]);
    const nextSection: Record<string, unknown> = { ...existingSection };
    for (const field of RESEARCH_STRUCTURED_SECTION_SCHEMA[typedKey]) {
      if (!(field.key in incomingSection)) continue;
      nextSection[field.key] = field.kind === "list"
        ? asStringArray(incomingSection[field.key])
        : editableText(incomingSection[field.key]);
    }
    if ("confirmed_facts" in incomingSection) {
      nextSection.confirmed_facts = asStringArray(incomingSection.confirmed_facts);
    }
    if ("analysis" in incomingSection) {
      nextSection.analysis = editableText(incomingSection.analysis);
    }
    if ("missing_info" in incomingSection) {
      nextSection.missing_info = asStringArray(incomingSection.missing_info);
    }
    merged[sectionKey] = nextSection;
  }

  return merged;
}

function buildEditableResearchReportJson(
  existingReportJson: unknown,
  incomingReportJson: Record<string, unknown>,
  title: string,
  customerName: string
) {
  const existing = asRecord(existingReportJson);
  const sections = buildEditableResearchSections(asRecord(existing.sections), asRecord(incomingReportJson.sections));
  const markdown = buildMarkdownReportV2(customerName, sections);
  const next: Record<string, unknown> = {
    ...existing,
    title,
    sections,
    markdown_report: markdown
  };

  for (const key of EDITABLE_RESEARCH_SYSTEM_FIELDS) {
    if (existing[key] !== undefined) {
      next[key] = existing[key];
    } else {
      delete next[key];
    }
  }

  return { reportJson: next, finalMarkdown: markdown };
}

@Injectable()
export class ResearchService {
  constructor(
    private readonly reportData: ResearchReportDataService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly taskLocks: TaskSubmissionLockService,
    private readonly staleTasks: BackgroundTaskStaleService,
    @InjectQueue(RESEARCH_REPORT_QUEUE) private readonly queue: Queue
  ) {}

  async generate(user: RequestUser, customerId: string, dto: GenerateResearchReportDto) {
    const customer = await this.reportData.ensureCustomerVisible(user, customerId);

    await this.staleTasks.markStaleCustomerTasks(user.organizationId, customerId);
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

  async deleteById(user: RequestUser, customerId: string, reportId: string) {
    await this.reportData.ensureCustomerVisible(user, customerId);
    const report = await this.reportData.getReportById(customerId, reportId);
    if (!report) {
      throw new NotFoundException("Research report not found");
    }
    if (report.status === "QUEUED" || report.status === "RUNNING") {
      throw new BadRequestException("Cannot delete report while it is still running");
    }
    await this.reportData.deleteReport(reportId);
    return { deleted: true };
  }

  async updateById(user: RequestUser, customerId: string, reportId: string, dto: UpdateResearchReportDto) {
    const customer = await this.reportData.ensureCustomerVisible(user, customerId);
    const report = await this.reportData.getReportById(customerId, reportId);
    if (!report) {
      throw new NotFoundException("Research report not found");
    }
    const title = dto.title?.trim() || report.title;
    const data: { title?: string; reportJson?: unknown; finalMarkdown?: string } = {};
    if (dto.title !== undefined || dto.reportJson !== undefined) {
      data.title = title;
    }
    if (dto.reportJson !== undefined) {
      const editable = buildEditableResearchReportJson(report.reportJson, dto.reportJson, title, customer.name);
      data.reportJson = editable.reportJson;
      data.finalMarkdown = editable.finalMarkdown;
    }
    return this.reportData.updateReport(reportId, data);
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
