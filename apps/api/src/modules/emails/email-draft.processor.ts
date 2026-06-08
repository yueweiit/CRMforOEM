import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { SettingsService } from "../settings/settings.service";
import { buildEmailSystemPrompt } from "./email-prompt-builder";
import { EMAIL_DRAFT_QUEUE } from "./email-draft.constants";
import type { EmailGenerationContext } from "./email-generation-types";

type LegacyDraftContext = {
  purpose?: string;
  bestContact?: { name?: string; email?: string; title?: string };
  contacts?: Array<{ name?: string; email?: string; title?: string }>;
};

@Processor(EMAIL_DRAFT_QUEUE)
export class EmailDraftProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService,
    private readonly settingsService: SettingsService
  ) {
    super();
  }

  async process(job: Job<{ draftId: string; context: EmailGenerationContext | LegacyDraftContext; toEmail: string }>) {
    const { draftId, context, toEmail } = job.data;
    const startedAt = Date.now();

    try {
      const isLegacy = !("intendedRecipient" in context);
      const intendedRecipient = isLegacy
        ? {
            email: toEmail ?? (context as LegacyDraftContext).bestContact?.email ?? "",
            name: (context as LegacyDraftContext).bestContact?.name,
            title: (context as LegacyDraftContext).bestContact?.title
          }
        : (context as EmailGenerationContext).intendedRecipient;

      const targetEmail = toEmail || intendedRecipient.email;
      const purpose = isLegacy
        ? (context as LegacyDraftContext).purpose
        : (context as EmailGenerationContext).purpose;

      const draftWithOrg = await this.prisma.emailDraft.findUnique({
        where: { id: draftId },
        select: { customer: { select: { organizationId: true } }, purpose: true }
      });
      const dbConfig = draftWithOrg?.customer?.organizationId
        ? await this.settingsService.readOrgPromptConfig(
            draftWithOrg.customer.organizationId,
            purpose ?? draftWithOrg.purpose
          )
        : null;

      const completion = await this.aiProvider.complete({
        system: buildEmailSystemPrompt(
          purpose,
          intendedRecipient.name ?? undefined,
          intendedRecipient.title ?? undefined,
          dbConfig
        ),
        user: isLegacy
          ? JSON.stringify({ ...(context as LegacyDraftContext), intendedRecipient: targetEmail })
          : JSON.stringify(context),
        jsonMode: false
      });

      const draft = await this.prisma.emailDraft.findUnique({ where: { id: draftId } });
      if (!draft?.aiGenerationRunId) return;

      await this.aiGeneration.markSucceeded(
        draft.aiGenerationRunId,
        completion.raw,
        completion.tokenUsage,
        Date.now() - startedAt
      );
      await this.aiGeneration.addRawAiVersion(draft.aiGenerationRunId, completion.content);

      await this.prisma.emailDraft.update({
        where: { id: draftId },
        data: { body: completion.content, subject: draft.subject }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown email draft generation error";
      const draft = await this.prisma.emailDraft.findUnique({ where: { id: draftId } });
      if (draft?.aiGenerationRunId) {
        await this.aiGeneration.markFailed(draft.aiGenerationRunId, message);
      }
      throw error;
    }
  }
}
