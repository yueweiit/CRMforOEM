import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export const STALE_BACKGROUND_TASK_MESSAGE = "任务在服务重启或队列中断后超时，请重新发起。";

const DEFAULT_QUEUED_STALE_MINUTES = 15;
const DEFAULT_RUNNING_STALE_MINUTES = 120;

@Injectable()
export class BackgroundTaskStaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async markStaleCustomerTasks(organizationId: string, customerId: string, now = new Date()) {
    const queuedCutoff = new Date(now.getTime() - this.readMinutes("BACKGROUND_QUEUED_TASK_STALE_MINUTES", DEFAULT_QUEUED_STALE_MINUTES) * 60_000);
    const runningCutoff = new Date(now.getTime() - this.readMinutes("BACKGROUND_RUNNING_TASK_STALE_MINUTES", DEFAULT_RUNNING_STALE_MINUTES) * 60_000);
    const activeStaleWhere = {
      OR: [
        { status: "QUEUED" as const, updatedAt: { lt: queuedCutoff } },
        { status: "RUNNING" as const, updatedAt: { lt: runningCutoff } }
      ]
    };

    const [websiteAnalysis, researchReport, aiGenerationRun] = await Promise.all([
      this.prisma.websiteAnalysis.updateMany({
        where: {
          customerId,
          customer: { organizationId },
          ...activeStaleWhere
        },
        data: {
          status: "FAILED",
          errorMessage: STALE_BACKGROUND_TASK_MESSAGE,
          completedAt: now
        }
      }),
      this.prisma.researchReport.updateMany({
        where: {
          customerId,
          customer: { organizationId },
          ...activeStaleWhere
        },
        data: {
          status: "FAILED",
          errorMessage: STALE_BACKGROUND_TASK_MESSAGE,
          completedAt: now
        }
      }),
      this.prisma.aiGenerationRun.updateMany({
        where: {
          customerId,
          organizationId,
          type: { in: ["WEBSITE_ANALYSIS", "RESEARCH_REPORT", "OEM_FIT_SCORE"] },
          ...activeStaleWhere
        },
        data: {
          status: "FAILED",
          errorMessage: STALE_BACKGROUND_TASK_MESSAGE
        }
      })
    ]);

    return {
      websiteAnalysisCount: websiteAnalysis.count,
      researchReportCount: researchReport.count,
      aiGenerationRunCount: aiGenerationRun.count
    };
  }

  private readMinutes(key: string, fallback: number) {
    const raw = this.config.get<string>(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
