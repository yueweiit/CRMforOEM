import { BadRequestException, Injectable } from "@nestjs/common";
import { CustomerStage, EmailDraftStatus, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService } from "../../ai/ai.public";
import { CustomerStageService } from "../../customers/customers.public";
import { FollowUpsService } from "../../follow-ups/follow-ups.public";
import { EmailComplianceService } from "../accounts/email-compliance.service";
import { SmtpService } from "../generation/smtp.service";
import type { ApproveEmailDraftDto } from "../dto/approve-email-draft.dto";
import { getDraftPurpose } from "../helpers/email-helpers";

@Injectable()
export class EmailApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly compliance: EmailComplianceService,
    private readonly smtp: SmtpService,
    private readonly customerStageService: CustomerStageService,
    private readonly followUps: FollowUpsService
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
    draft: { id: string; customerId: string; status: string; toEmail: string; ccEmails: string[]; bccEmails: string[]; subject: string; body: string; emailAccountId?: string | null; aiGenerationRun?: { rawInput?: unknown } | null },
    account: { id: string; email: string; name?: string | null; hourlySendLimit: number; dailySendLimit: number; isActive: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string; smtpPasswordEncrypted: string }
  ) {
    await this.compliance.assertCanSend(user, draft, account);
    const sendResult = await this.smtp.send(account, draft);
    await this.compliance.consumeQuota(account);

    const thread = await this.prisma.emailThread.create({ data: { customerId: draft.customerId, subject: draft.subject, lastMessageAt: new Date() } });
    const message = await this.prisma.emailMessage.create({
      data: { threadId: thread.id, emailAccountId: account.id, direction: "OUTBOUND", status: "SENT", messageId: sendResult.messageId, fromEmail: account.email, toEmails: [draft.toEmail], ccEmails: draft.ccEmails, subject: draft.subject, bodyText: draft.body, sentAt: new Date() }
    });
    await this.prisma.emailDraft.update({ where: { id: draft.id }, data: { status: EmailDraftStatus.Sent as never, sentMessageId: message.id, emailAccountId: account.id, fromEmailSnapshot: account.email, fromNameSnapshot: account.name } });

    const purpose = normalizeEmailDraftPurpose((draft as { purpose?: string | null }).purpose ?? getDraftPurpose(draft.aiGenerationRun?.rawInput));
    await this.advanceStageByPurpose(user, draft.customerId, purpose);
    await this.followUps.handleEmailSent({ customerId: draft.customerId, actorUserId: user.id, purpose });

    return { queued: false, draftId: draft.id, messageId: message.id, message: "邮件已发送。" };
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
