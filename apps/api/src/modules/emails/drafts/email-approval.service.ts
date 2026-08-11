import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomerStage, EmailDraftStatus, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { randomUUID } from "node:crypto";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService } from "../../ai/ai.public";
import { CustomerStageService } from "../../customers/customers.public";
import { FollowUpsService } from "../../follow-ups/follow-ups.public";
import { QuoteWorkflowService } from "../../commercial/commercial.public";
import { EmailComplianceService } from "../accounts/email-compliance.service";
import { SmtpService } from "../generation/smtp.service";
import type { ApproveEmailDraftDto } from "../dto/approve-email-draft.dto";
import { getDraftPurpose } from "../helpers/email-helpers";
import { EmailDraftAttachmentService, PreparedEmailAttachment } from "./email-draft-attachment.service";

@Injectable()
export class EmailApprovalService {
  private readonly logger = new Logger(EmailApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly compliance: EmailComplianceService,
    private readonly smtp: SmtpService,
    private readonly customerStageService: CustomerStageService,
    private readonly followUps: FollowUpsService,
    private readonly quoteWorkflow: QuoteWorkflowService,
    private readonly draftAttachments: EmailDraftAttachmentService
  ) {}

  async approve(user: RequestUser, draft: { id: string; status: string; subject: string; body: string; aiGenerationRunId?: string | null }, dto: ApproveEmailDraftDto) {
    if (draft.status !== "PENDING_REVIEW" && draft.status !== "DRAFT") {
      throw new BadRequestException("Only draft or pending review email can be approved");
    }
    if (draft.aiGenerationRunId) {
      await this.aiGeneration.finalize(user, draft.aiGenerationRunId, {
        content: JSON.stringify({ subject: draft.subject, body: draft.body }, null, 2),
        editReason: dto.reviewComment ?? "Email approved for manual send"
      });
    }
    return this.prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: EmailDraftStatus.Approved as never, reviewedById: user.id, reviewedAt: new Date(), reviewComment: dto.reviewComment }
    });
  }

  async send(
    user: RequestUser,
    draft: {
      id: string;
      customerId: string;
      quoteId?: string | null;
      quoteUpdatedAtSnapshot?: Date | null;
      status: string;
      toEmail: string;
      ccEmails: string[];
      bccEmails: string[];
      subject: string;
      body: string;
      purpose?: string | null;
      emailAccountId?: string | null;
      aiGenerationRun?: { rawInput?: unknown } | null;
    },
    account: { id: string; email: string; name?: string | null; hourlySendLimit: number; dailySendLimit: number; isActive: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string; smtpPasswordEncrypted: string }
  ) {
    await this.compliance.assertCanSend(user, draft, account);
    const attachments = await this.draftAttachments.prepareForSend(user, draft.id);
    if (draft.quoteId) {
      return this.sendQuotation(user, draft, account, attachments);
    }

    const sendResult = await this.smtp.send(account, draft, { attachments });
    await this.compliance.consumeQuota(account);

    const thread = await this.prisma.emailThread.create({ data: { customerId: draft.customerId, subject: draft.subject, lastMessageAt: new Date() } });
    const message = await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        emailAccountId: account.id,
        direction: "OUTBOUND",
        status: "SENT",
        messageId: sendResult.messageId,
        fromEmail: account.email,
        toEmails: [draft.toEmail],
        ccEmails: draft.ccEmails,
        subject: draft.subject,
        bodyText: draft.body,
        sentAt: new Date(),
        attachments: { create: this.attachmentSnapshots(attachments) }
      }
    });
    await this.prisma.emailDraft.update({ where: { id: draft.id }, data: { status: EmailDraftStatus.Sent as never, sentMessageId: message.id, emailAccountId: account.id, fromEmailSnapshot: account.email, fromNameSnapshot: account.name } });

    const purpose = normalizeEmailDraftPurpose(draft.purpose ?? getDraftPurpose(draft.aiGenerationRun?.rawInput));
    await this.advanceStageByPurpose(user, draft.customerId, purpose);
    await this.followUps.handleEmailSent({ customerId: draft.customerId, actorUserId: user.id, purpose });

    return { queued: false, draftId: draft.id, messageId: message.id, message: "邮件已发送。" };
  }

  private async sendQuotation(
    user: RequestUser,
    draft: {
      id: string;
      customerId: string;
      quoteId?: string | null;
      quoteUpdatedAtSnapshot?: Date | null;
      status: string;
      toEmail: string;
      ccEmails: string[];
      bccEmails: string[];
      subject: string;
      body: string;
      purpose?: string | null;
      aiGenerationRun?: { rawInput?: unknown } | null;
    },
    account: { id: string; email: string; name?: string | null; hourlySendLimit: number; dailySendLimit: number; isActive: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string; smtpPasswordEncrypted: string },
    attachments: PreparedEmailAttachment[]
  ) {
    if (!draft.quoteId || !draft.quoteUpdatedAtSnapshot) {
      throw new BadRequestException("Quotation draft is missing its quote snapshot");
    }

    const existing = await this.prisma.quoteEmailDispatch.findUnique({
      where: { emailDraftId: draft.id },
      include: { emailMessage: true }
    });
    if (existing) return this.resolveExistingDispatch(existing, draft.id);

    const dispatchId = randomUUID();
    const providerMessageId = this.buildProviderMessageId(dispatchId, account.email);
    let prepared: { threadId: string; messageId: string };
    try {
      prepared = await this.prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findUnique({ where: { id: draft.quoteId! } });
        if (!quote || quote.customerId !== draft.customerId) {
          throw new BadRequestException("Quotation no longer belongs to this customer");
        }
        this.quoteWorkflow.assertSendable(quote);
        if (quote.updatedAt.getTime() !== draft.quoteUpdatedAtSnapshot!.getTime()) {
          throw new ConflictException("Quotation changed after this email draft was generated; generate a new draft");
        }

        const thread = await tx.emailThread.create({
          data: { customerId: draft.customerId, subject: draft.subject, lastMessageAt: new Date() }
        });
        const message = await tx.emailMessage.create({
          data: {
            threadId: thread.id,
            quoteId: quote.id,
            emailAccountId: account.id,
            direction: "OUTBOUND",
            status: "QUEUED",
            messageId: providerMessageId,
            fromEmail: account.email,
            toEmails: [draft.toEmail],
            ccEmails: draft.ccEmails,
            subject: draft.subject,
            bodyText: draft.body,
            attachments: { create: this.attachmentSnapshots(attachments) }
          }
        });
        await tx.quoteEmailDispatch.create({
          data: {
            id: dispatchId,
            quoteId: quote.id,
            emailDraftId: draft.id,
            emailMessageId: message.id,
            idempotencyKey: `quote-email:${draft.id}`,
            status: "SENDING",
            providerMessageId,
            attemptedAt: new Date()
          }
        });
        return { threadId: thread.id, messageId: message.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.quoteEmailDispatch.findUnique({
          where: { emailDraftId: draft.id },
          include: { emailMessage: true }
        });
        if (raced) return this.resolveExistingDispatch(raced, draft.id);
      }
      throw error;
    }

    let smtpMessageId: string;
    try {
      const result = await this.smtp.send(account, draft, { messageId: providerMessageId, attachments });
      smtpMessageId = result.messageId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "SMTP send failed";
      await this.prisma.$transaction([
        this.prisma.quoteEmailDispatch.update({ where: { id: dispatchId }, data: { status: "FAILED", errorMessage } }),
        this.prisma.emailMessage.update({ where: { id: prepared.messageId }, data: { status: "FAILED" } })
      ]);
      throw error;
    }

    const sentAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const dispatch = await tx.quoteEmailDispatch.findUnique({ where: { id: dispatchId } });
        if (!dispatch || dispatch.status !== "SENDING") {
          throw new ConflictException("Quotation email dispatch is no longer claimable");
        }
        const quote = await tx.quote.findUnique({ where: { id: draft.quoteId! } });
        if (!quote) throw new BadRequestException("Quotation no longer exists");

        await tx.emailMessage.update({
          where: { id: prepared.messageId },
          data: { status: "SENT", messageId: smtpMessageId, sentAt }
        });
        await tx.emailDraft.update({
          where: { id: draft.id },
          data: {
            status: EmailDraftStatus.Sent as never,
            sentMessageId: prepared.messageId,
            emailAccountId: account.id,
            fromEmailSnapshot: account.email,
            fromNameSnapshot: account.name
          }
        });
        await this.quoteWorkflow.markSent(tx, {
          quote,
          actor: { id: user.id, name: user.name ?? user.email ?? user.id },
          sentAt,
          comment: `报价邮件 ${draft.subject} 已通过 SMTP 发送`
        });
        await tx.quoteEmailDispatch.update({
          where: { id: dispatchId },
          data: { status: "SENT", providerMessageId: smtpMessageId, sentAt, errorMessage: null }
        });
      });
    } catch (error) {
      await this.prisma.quoteEmailDispatch.update({
        where: { id: dispatchId },
        data: {
          status: "ACKED_PENDING_RECONCILE",
          providerMessageId: smtpMessageId,
          errorMessage: error instanceof Error ? error.message : "Database reconciliation failed"
        }
      });
      throw new ServiceUnavailableException("邮件已由 SMTP 接收，但系统状态待管理员对账；请勿重复发送");
    }

    await this.runPostSendEffects(user, draft, account);
    return { queued: false, draftId: draft.id, messageId: prepared.messageId, quoteId: draft.quoteId, message: "报价邮件已发送，报价状态已更新为已发送。" };
  }

  private resolveExistingDispatch(
    dispatch: { status: string; emailMessageId?: string | null },
    draftId: string
  ) {
    if (dispatch.status === "SENT" && dispatch.emailMessageId) {
      return { queued: false, draftId, messageId: dispatch.emailMessageId, alreadySent: true, message: "该报价邮件已发送。" };
    }
    if (dispatch.status === "ACKED_PENDING_RECONCILE") {
      throw new ConflictException("邮件已由 SMTP 接收但状态待对账，请勿重复发送");
    }
    if (dispatch.status === "FAILED") {
      throw new ConflictException("上次发送失败且结果需核查，请由管理员处理后再发送");
    }
    throw new ConflictException("该报价邮件正在发送，请勿重复操作");
  }

  private buildProviderMessageId(dispatchId: string, senderEmail: string) {
    const domain = senderEmail.split("@")[1]?.replace(/[^a-zA-Z0-9.-]/g, "") || "localhost";
    return `<quote-${dispatchId}@${domain}>`;
  }

  private attachmentSnapshots(attachments: PreparedEmailAttachment[]) {
    return attachments.map((attachment) => ({
      fileAssetId: attachment.fileAssetId,
      filename: attachment.filename,
      mimeType: attachment.contentType,
      sizeBytes: attachment.sizeBytes
    }));
  }

  private async runPostSendEffects(
    user: RequestUser,
    draft: { customerId: string; aiGenerationRun?: { rawInput?: unknown } | null },
    account: { id: string }
  ) {
    const purpose = normalizeEmailDraftPurpose((draft as { purpose?: string | null }).purpose ?? getDraftPurpose(draft.aiGenerationRun?.rawInput));
    const effects = await Promise.allSettled([
      this.compliance.consumeQuota(account),
      this.advanceStageByPurpose(user, draft.customerId, purpose),
      this.followUps.handleEmailSent({ customerId: draft.customerId, actorUserId: user.id, purpose })
    ]);
    for (const effect of effects) {
      if (effect.status === "rejected") this.logger.error("Post-send side effect failed", effect.reason);
    }
  }

  private async advanceStageByPurpose(user: RequestUser, customerId: string, purpose: string) {
    const stageMap: Record<string, CustomerStage> = {
      FIRST_OUTREACH: CustomerStage.FirstEmailSent,
      QUOTATION: CustomerStage.Quoting,
      REQUIREMENT_CONFIRMATION: CustomerStage.RequirementConfirming
    };
    const toStage = stageMap[purpose];
    if (!toStage) return;
    await this.customerStageService.advanceCustomerStage({ customerId, toStage, changedById: user.id, reason: `${purpose.toLowerCase().replace(/_/g, " ")} email sent` });
  }
}
