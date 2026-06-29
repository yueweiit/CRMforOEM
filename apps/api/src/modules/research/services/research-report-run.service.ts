import { Injectable } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService } from "../../ai/ai.public";
import type { AiGenerationMeta, SummaryPipelineMeta } from "../../ai/ai.public";

@Injectable()
export class ResearchReportRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService
  ) {}

  async markRunning(reportId: string) {
    const started = await this.prisma.researchReport.updateMany({
      where: { id: reportId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    if (started.count === 0) return null;
    return this.prisma.researchReport.findUniqueOrThrow({
      where: { id: reportId }
    });
  }

  async persistSuccess(params: {
    reportId: string;
    customerId: string;
    aiGenerationRunId: string | null;
    parsed: Record<string, unknown> & { title: string; markdown_report: string };
    sourceEvidence: unknown;
    searchEnabled: boolean;
    aiMeta: AiGenerationMeta;
    summaryPipeline?: SummaryPipelineMeta;
    completion: { raw: unknown; tokenUsage: unknown; content: string; durationMs: number };
  }) {
    const { reportId, customerId, aiGenerationRunId, parsed, sourceEvidence, searchEnabled, aiMeta, summaryPipeline, completion } = params;

    if (aiGenerationRunId) {
      await this.aiGeneration.markSucceeded(aiGenerationRunId, completion.raw, completion.tokenUsage, completion.durationMs);
      await this.aiGeneration.addRawAiVersion(aiGenerationRunId, completion.content, parsed);
    }

    const reportJson = {
      ...parsed,
      aiMeta,
      summaryPipeline,
      sourceEvidence
    };

    const finalReport = await this.prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "SUCCEEDED", completedAt: new Date(),
        title: parsed.title, reportJson: reportJson as never,
        finalMarkdown: parsed.markdown_report,
        sourceEvidence: sourceEvidence as never,
        searchEnabled
      }
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { stage: CustomerStage.Researched as never }
    });

    return finalReport;
  }

  async persistPartial(params: {
    reportId: string;
    customerId: string;
    aiGenerationRunId: string | null;
    parsed: Record<string, unknown> & { title: string; markdown_report: string };
    sourceEvidence: unknown;
    searchEnabled: boolean;
    aiMeta: AiGenerationMeta;
    summaryPipeline?: SummaryPipelineMeta;
    completion: { raw: unknown; tokenUsage: unknown; content: string; durationMs: number };
    errorMessage?: string;
  }) {
    const { reportId, customerId, aiGenerationRunId, parsed, sourceEvidence, searchEnabled, aiMeta, summaryPipeline, completion, errorMessage } = params;

    if (aiGenerationRunId) {
      await this.aiGeneration.markFailed(aiGenerationRunId, errorMessage ?? aiMeta.errorMessage ?? "AI parse or provider failed");
    }

    const reportJson = {
      ...parsed,
      aiMeta,
      summaryPipeline,
      sourceEvidence
    };

    const result = await this.prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "SUCCEEDED", completedAt: new Date(),
        title: parsed.title, reportJson: reportJson as never,
        finalMarkdown: parsed.markdown_report,
        sourceEvidence: sourceEvidence as never,
        searchEnabled
      }
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { stage: CustomerStage.Researched as never }
    });

    return result;
  }

  async markAiRunRunning(aiGenerationRunId: string | null, rawInput: unknown) {
    if (!aiGenerationRunId) return;
    await this.prisma.aiGenerationRun.update({
      where: { id: aiGenerationRunId },
      data: { status: "RUNNING", rawInput: rawInput as never }
    }).catch(() => undefined);
  }

  async persistFailure(
    reportId: string,
    aiGenerationRunId: string | null,
    errorMessage: string,
    aiMeta?: AiGenerationMeta,
    summaryPipeline?: SummaryPipelineMeta
  ) {
    await this.prisma.researchReport.update({
      where: { id: reportId },
      data: { status: "FAILED", errorMessage, completedAt: new Date() }
    });
    if (aiGenerationRunId) {
      await this.aiGeneration.markFailed(aiGenerationRunId, errorMessage);
    }
  }
}
