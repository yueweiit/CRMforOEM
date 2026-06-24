import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AiProviderService } from "../ai/ai.public";
import { RESEARCH_REPORT_QUEUE } from "./research.constants";
import { ResearchContextBuilder } from "./builders/research-context-builder";
import { ResearchReportRunService } from "./services/research-report-run.service";
import { buildResearchPromptUserInput, compactResearchRunInput, researchSystemPrompt } from "./builders/research-prompt-builder";
import { parseResearchOutput } from "./parsers/research-output-parser";

@Processor(RESEARCH_REPORT_QUEUE)
export class ResearchProcessor extends WorkerHost {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly contextBuilder: ResearchContextBuilder,
    private readonly reportRun: ResearchReportRunService
  ) {
    super();
  }

  async process(job: Job<{ reportId: string; organizationId: string; customerId: string; salesNotes?: string }>) {
    const { reportId, organizationId, customerId, salesNotes } = job.data;
    const report = await this.reportRun.markRunning(reportId);

    try {
      const context = await this.contextBuilder.build(organizationId, customerId, salesNotes);
      await this.reportRun.markAiRunRunning(report.aiGenerationRunId, compactResearchRunInput(context));

      const promptUserInput = buildResearchPromptUserInput(context);
      const startedAt = Date.now();
      const completion = await this.aiProvider.complete({
        system: researchSystemPrompt(),
        user: promptUserInput,
        jsonMode: true
      });
      const parsed = parseResearchOutput(completion.content, context.customer.name, context.publicSearch.warning);

      return this.reportRun.persistSuccess({
        reportId, customerId,
        aiGenerationRunId: report.aiGenerationRunId,
        parsed,
        sourceEvidence: context.sourceEvidence,
        searchEnabled: context.publicSearch.enabled,
        completion: {
          raw: completion.raw,
          tokenUsage: completion.tokenUsage,
          content: completion.content,
          durationMs: Date.now() - startedAt
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research report error";
      await this.reportRun.persistFailure(reportId, report.aiGenerationRunId, message);
      throw error;
    }
  }
}
