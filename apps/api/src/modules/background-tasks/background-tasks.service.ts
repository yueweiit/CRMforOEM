import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiGenerationRun, EmailDraft, ResearchReport, WebsiteAnalysis } from "@prisma/client";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type CustomerBackgroundTaskType =
  | "WEBSITE_ANALYSIS"
  | "RESEARCH_REPORT"
  | "OEM_FIT_SCORE"
  | "EMAIL_DRAFT";

export type CustomerBackgroundTaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type CustomerBackgroundTaskView = {
  id: string;
  type: CustomerBackgroundTaskType;
  status: CustomerBackgroundTaskStatus;
  title: string;
  customerId: string;
  businessEntity: "WebsiteAnalysis" | "ResearchReport" | "OemFitScore" | "EmailDraft" | "AiGenerationRun";
  businessEntityId: string;
  aiGenerationRunId?: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
};

export type CustomerBackgroundTasksResponse = {
  active: CustomerBackgroundTaskView[];
  recent: CustomerBackgroundTaskView[];
};

const ACTIVE_STATUSES = ["QUEUED", "RUNNING"] as const;

function isActiveStatus(status?: string | null) {
  return status === "QUEUED" || status === "RUNNING";
}

function toTaskStatus(status?: string | null): CustomerBackgroundTaskStatus {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
    case "SUCCEEDED":
    case "FAILED":
    case "CANCELLED":
      return status;
    default:
      return "FAILED";
  }
}

function mapWebsiteAnalysisTask(
  item: WebsiteAnalysis & { aiGenerationRun?: AiGenerationRun | null }
): CustomerBackgroundTaskView {
  return {
    id: item.id,
    type: "WEBSITE_ANALYSIS",
    status: toTaskStatus(item.status),
    title: "官网分析",
    customerId: item.customerId,
    businessEntity: "WebsiteAnalysis",
    businessEntityId: item.id,
    aiGenerationRunId: item.aiGenerationRunId,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    errorMessage: item.errorMessage
  };
}

function mapResearchReportTask(
  item: ResearchReport & { aiGenerationRun?: AiGenerationRun | null }
): CustomerBackgroundTaskView {
  return {
    id: item.id,
    type: "RESEARCH_REPORT",
    status: toTaskStatus(item.status),
    title: "背调报告",
    customerId: item.customerId,
    businessEntity: "ResearchReport",
    businessEntityId: item.id,
    aiGenerationRunId: item.aiGenerationRunId,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    errorMessage: item.errorMessage
  };
}

function mapEmailDraftTask(
  item: EmailDraft & { aiGenerationRun?: AiGenerationRun | null }
): CustomerBackgroundTaskView {
  const status = item.aiGenerationRun?.status ?? "SUCCEEDED";
  return {
    id: item.id,
    type: "EMAIL_DRAFT",
    status: toTaskStatus(status),
    title: "邮件草稿生成",
    customerId: item.customerId,
    businessEntity: "EmailDraft",
    businessEntityId: item.id,
    aiGenerationRunId: item.aiGenerationRunId,
    createdAt: item.createdAt,
    startedAt: null,
    completedAt: isActiveStatus(status) ? null : item.updatedAt,
    errorMessage: item.aiGenerationRun?.errorMessage ?? null
  };
}

function mapOemScoreRunTask(item: AiGenerationRun): CustomerBackgroundTaskView {
  return {
    id: item.id,
    type: "OEM_FIT_SCORE",
    status: toTaskStatus(item.status),
    title: "OEM评分生成",
    customerId: item.customerId ?? "",
    businessEntity: "AiGenerationRun",
    businessEntityId: item.id,
    aiGenerationRunId: item.id,
    createdAt: item.createdAt,
    startedAt: item.createdAt,
    completedAt: isActiveStatus(item.status) ? null : item.updatedAt,
    errorMessage: item.errorMessage
  };
}

@Injectable()
export class BackgroundTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCustomer(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);

    const [analyses, reports, oemScoreRuns, emailDrafts] = await Promise.all([
      this.prisma.websiteAnalysis.findMany({
        where: {
          customerId,
          customer: { organizationId: user.organizationId }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { aiGenerationRun: true }
      }),
      this.prisma.researchReport.findMany({
        where: {
          customerId,
          customer: { organizationId: user.organizationId }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { aiGenerationRun: true }
      }),
      this.prisma.aiGenerationRun.findMany({
        where: {
          customerId,
          organizationId: user.organizationId,
          type: "OEM_FIT_SCORE",
          status: { in: [...ACTIVE_STATUSES] }
        },
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      this.prisma.emailDraft.findMany({
        where: {
          customerId,
          customer: { organizationId: user.organizationId },
          aiGenerationRun: {
            status: { in: [...ACTIVE_STATUSES] }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { aiGenerationRun: true }
      })
    ]);

    const tasks = [
      ...(analyses ?? []).map(mapWebsiteAnalysisTask),
      ...(reports ?? []).map(mapResearchReportTask),
      ...(oemScoreRuns ?? []).map(mapOemScoreRunTask),
      ...(emailDrafts ?? []).map(mapEmailDraftTask)
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      active: tasks.filter((task) => isActiveStatus(task.status)),
      recent: tasks.filter((task) => !isActiveStatus(task.status)).slice(0, 10)
    };
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }
}
