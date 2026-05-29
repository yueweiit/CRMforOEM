import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { buildEmailSystemPrompt } from "./email-prompt-builder";
import { EMAIL_DRAFT_QUEUE } from "./email-draft.constants";

type DraftContext = {
  purpose?: string;
  bestContact?: { name?: string; email?: string; title?: string };
  contacts?: Array<{ name?: string; email?: string; title?: string }>;
};

@Processor(EMAIL_DRAFT_QUEUE)
export class EmailDraftProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService
  ) {
    super();
  }

  async process(job: Job<{ draftId: string; context: DraftContext; toEmail: string }>) {
    const { draftId, context, toEmail } = job.data;
    const startedAt = Date.now();

    try {
      const targetEmail = toEmail ?? context.bestContact?.email ?? "";
      const selectedContact = context.contacts?.find((c) => (c.email ?? undefined) === targetEmail);

      const completion = await this.aiProvider.complete({
        system: buildEmailSystemPrompt(context.purpose, selectedContact?.name ?? undefined, selectedContact?.title ?? undefined),
        user: JSON.stringify({ ...context, intendedRecipient: targetEmail }),
        jsonMode: false
      });

      const draft = await this.prisma.emailDraft.findUnique({ where: { id: draftId } });
      if (!draft?.aiGenerationRunId) return;

      await this.aiGeneration.markSucceeded(draft.aiGenerationRunId, completion.raw, completion.tokenUsage, Date.now() - startedAt);
      await this.aiGeneration.addRawAiVersion(draft.aiGenerationRunId, completion.content);

      await this.prisma.emailDraft.update({
        where: { id: draftId },
        data: { body: completion.content, subject: draft.subject }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email draft generation error";
      const draft = await this.prisma.emailDraft.findUnique({ where: { id: draftId } });
      if (draft?.aiGenerationRunId) {
        await this.aiGeneration.markFailed(draft.aiGenerationRunId, message);
      }
      throw error;
    }
  }
}
