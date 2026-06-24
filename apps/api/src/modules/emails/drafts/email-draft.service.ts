import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AiContentVersionType, EmailDraftStatus, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService } from "../../ai/ai.public";
import { EmailAccountService } from "../accounts/email-account.service";
import { EmailApprovalService } from "./email-approval.service";
import { pickDefinedFields, resolveSenderAccount } from "../helpers/email-helpers";
import type { ApproveEmailDraftDto } from "../dto/approve-email-draft.dto";
import type { UpdateEmailDraftDto } from "../dto/update-email-draft.dto";

@Injectable()
export class EmailDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly accountService: EmailAccountService,
    private readonly approval: EmailApprovalService
  ) {}

  async getDraft(user: RequestUser, id: string) {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id, customer: buildCustomerDataScopeWhere(user) },
      include: {
        emailAccount: { select: { id: true, name: true, email: true, scope: true } },
        aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } }
      }
    });
    if (!draft) throw new NotFoundException("Email draft not found");
    return draft;
  }

  async updateDraft(user: RequestUser, id: string, dto: UpdateEmailDraftDto) {
    const draft = await this.getDraft(user, id);
    if (draft.status === "SENT") throw new BadRequestException("Sent draft cannot be edited");

    const nextToEmail = dto.toEmail ?? draft.toEmail;
    const account = await resolveSenderAccount(this.prisma, this.accountService, user, nextToEmail, dto.emailAccountId ?? draft.emailAccountId ?? undefined);
    const selectedContact = await this.prisma.contact.findFirst({
      where: { customerId: draft.customerId, email: nextToEmail }, select: { name: true }
    });
    const updated = await this.prisma.emailDraft.update({
      where: { id },
      data: pickDefinedFields({
        purpose: dto.purpose ? normalizeEmailDraftPurpose(dto.purpose) : undefined,
        subject: dto.subject, body: dto.body, toEmail: dto.toEmail,
        toNameSnapshot: dto.toEmail ? selectedContact?.name : undefined,
        ccEmails: dto.ccEmails, bccEmails: dto.bccEmails,
        emailAccountId: account.id, fromEmailSnapshot: account.email,
        fromNameSnapshot: account.name, status: EmailDraftStatus.PendingReview as never
      })
    });
    if (draft.aiGenerationRunId && (dto.body || dto.subject)) {
      await this.aiGeneration.addVersion(user, draft.aiGenerationRunId, {
        versionType: AiContentVersionType.HumanEdit,
        content: JSON.stringify({ subject: dto.subject ?? draft.subject, body: dto.body ?? draft.body }, null, 2),
        editReason: "Email draft edited by sales user"
      });
    }
    return updated;
  }

  async submitReview(user: RequestUser, id: string) {
    await this.getDraft(user, id);
    return this.prisma.emailDraft.update({ where: { id }, data: { status: EmailDraftStatus.PendingReview as never } });
  }

  async approve(user: RequestUser, id: string, dto: ApproveEmailDraftDto) {
    const draft = await this.getDraft(user, id);
    return this.approval.approve(user, draft, dto);
  }

  async sendApprovedDraft(user: RequestUser, id: string) {
    const draft = await this.getDraft(user, id);
    const account = await resolveSenderAccount(this.prisma, this.accountService, user, draft.toEmail, draft.emailAccountId ?? undefined);
    return this.approval.send(user, draft, account);
  }
}
