import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiGenerationRun, EmailDraft, ResearchReport, WebsiteAnalysis } from "@prisma/client";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type CustomerBackgroundTaskType =
  | "WEBSITE_ANALYSIS"
  | "RESEARCH_REPORT"
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
  businessEntity: "WebsiteAnalysis" | "ResearchReport" | "EmailDraft";
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

function mapWebsiteAnalysisTask(
  item: WebsiteAnalysis & { aiGenerationRun?: AiGenerationRun | null }
): CustomerBackgroundTaskView {
  return {
    id: item.id,
    type: "WEBSITE_ANALYSIS",
    status: item.status as CustomerBackgroundTaskStatus,
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
    status: item.status as CustomerBackgroundTaskStatus,
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
    status: status as CustomerBackgroundTaskStatus,
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

@Injectable()
export class BackgroundTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCustomer(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);

    const [analyses, reports, emailDrafts] = await Promise.all([
      this.prisma.websiteAnalysis.findMany({
        where: {
          customerId,
          customer: { organizationId: user.organizationId }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { aiGenerationRun: true }
      }).catch(() => []),
      this.prisma.researchReport.findMany({
        where: {
          customerId,
          customer: { organizationId: user.organizationId }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { aiGenerationRun: true }
      }).catch(() => []),
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
      }).catch(() => [])
    ]);

    const tasks = [
      ...(analyses ?? []).map(mapWebsiteAnalysisTask),
      ...(reports ?? []).map(mapResearchReportTask),
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
