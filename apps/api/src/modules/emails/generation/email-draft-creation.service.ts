import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { AiGenerationType, CustomerStage, EmailDraftStatus } from "@oem-crm/shared";
import { Queue } from "bullmq";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService, AiProviderService } from "../../ai/ai.public";
import { CustomerStageService } from "../../customers/customers.public";
import { EmailAccountService } from "../accounts/email-account.service";
import { EMAIL_DRAFT_QUEUE } from "../drafts/email-draft.constants";
import { buildSubject, resolveSenderAccount, sameEmailAddress } from "../helpers/email-helpers";
import { EmailContextBuilder, assembleGenerationContext, type ContextBuildResult } from "./email-context-builder";
import type { GenerateEmailDraftDto } from "../dto/generate-email-draft.dto";

@Injectable()
export class EmailDraftCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly customerStageService: CustomerStageService,
    private readonly accountService: EmailAccountService,
    @InjectQueue(EMAIL_DRAFT_QUEUE) private readonly emailDraftQueue: Queue
  ) {}

  async createDraftAndEnqueue(
    user: RequestUser,
    customerId: string,
    context: ContextBuildResult,
    toEmail: string,
    dto: GenerateEmailDraftDto
  ) {
    const selectedContact = context.contacts.find((c) => sameEmailAddress(c.email, toEmail));
    const account = await resolveSenderAccount(this.prisma, this.accountService, user, toEmail, dto.emailAccountId);
    const emailContext = assembleGenerationContext({
      purpose: context.purpose,
      customer: context.customer,
      selectedContact,
      responsibleOwner: context.customer.owner ?? user,
      websiteAnalysis: context.websiteAnalysis,
      researchReport: context.researchReport,
      oemFitScore: context.oemFitScore,
      companyProfile: context.companyProfile,
      quotation: context.quotation,
      userInstructions: context.userInstructions
    });
    const run = await this.aiGeneration.createRun({
      organizationId: user.organizationId,
      customerId,
      type: AiGenerationType.EmailDraft,
      model: this.aiProvider.model,
      promptVersion: "email-draft-v1",
      rawInput: emailContext,
      createdById: user.id
    });
    const draft = await this.prisma.emailDraft.create({
      data: {
        customerId,
        emailAccountId: account.id,
        aiGenerationRunId: run.id,
        purpose: context.purpose,
        subject: dto.subject ?? (context.quotation
          ? `Quotation ${context.quotation.selectedQuote.quoteNo} for ${context.customer.name}`
          : buildSubject(context.customer.name)),
        body: "",
        toEmail,
        toNameSnapshot: selectedContact?.name,
        fromEmailSnapshot: account.email,
        fromNameSnapshot: account.name,
        ccEmails: dto.ccEmails ?? [],
        bccEmails: dto.bccEmails ?? [],
        quoteId: context.quotation?.selectedQuote.id,
        quoteSnapshot: context.quotation?.selectedQuote as never,
        quoteUpdatedAtSnapshot: context.quotation ? new Date(context.quotation.quoteUpdatedAt) : undefined,
        historicalQuoteIds: context.quotation?.historicalQuoteIds ?? [],
        status: EmailDraftStatus.Draft as never,
        createdById: user.id
      }
    });
    await this.emailDraftQueue.add("generate-email-draft", {
      draftId: draft.id,
      context: emailContext,
      toEmail
    });

    if (context.customer.stage === CustomerStage.PendingEmailGeneration) {
      await this.customerStageService.advanceCustomerStage({
        customerId,
        toStage: CustomerStage.PendingEmailSend,
        changedById: user.id,
        reason: "Email draft generated"
      });
    }
    return { accepted: true, id: draft.id, status: draft.status, message: "草稿生成中，请稍后刷新查看。" };
  }
}
