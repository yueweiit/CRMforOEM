import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AiContentVersionType, EMAIL_DRAFT_ALLOWED_PURPOSES, EmailDraftStatus, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService } from "../../ai/ai.public";
import { EmailAccountService } from "../accounts/email-account.service";
import { EmailApprovalService } from "./email-approval.service";
import { pickDefinedFields, resolveSenderAccount } from "../helpers/email-helpers";
import type { ApproveEmailDraftDto } from "../dto/approve-email-draft.dto";
import type { UpdateEmailDraftDto } from "../dto/update-email-draft.dto";

export type EmailDraftListFilters = {
  customerId?: string;
  purpose?: string;
  status?: string;
  recipient?: string;
  cursor?: string;
  limit?: string | number;
};

const EMAIL_DRAFT_LIST_DEFAULT_LIMIT = 20;
const EMAIL_DRAFT_LIST_MAX_LIMIT = 50;
const EMAIL_DRAFT_STATUS_VALUES = new Set(Object.values(EmailDraftStatus));
const EMAIL_DRAFT_PURPOSE_VALUES = new Set<string>(EMAIL_DRAFT_ALLOWED_PURPOSES);

function parseListLimit(value: EmailDraftListFilters["limit"]) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return EMAIL_DRAFT_LIST_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), EMAIL_DRAFT_LIST_MAX_LIMIT);
}

function normalizeListStatus(value?: string) {
  if (!value || !EMAIL_DRAFT_STATUS_VALUES.has(value as EmailDraftStatus)) return undefined;
  return value;
}

function normalizeListPurpose(value?: string) {
  if (!value || !EMAIL_DRAFT_PURPOSE_VALUES.has(value)) return undefined;
  const normalized = normalizeEmailDraftPurpose(value);
  return normalized;
}

function trimmedText(value?: string) {
  const text = value?.trim();
  return text || undefined;
}

function parseCursor(raw?: string) {
  if (!raw) return null;
  const sep = raw.lastIndexOf("|");
  if (sep === -1) return null;
  const id = raw.slice(sep + 1);
  const ts = raw.slice(0, sep);
  const date = new Date(ts);
  if (isNaN(date.getTime())) return null;
  return { id, updatedAt: date };
}

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

  async listDrafts(user: RequestUser, filters: EmailDraftListFilters = {}) {
    const limit = parseListLimit(filters.limit);
    const purpose = normalizeListPurpose(filters.purpose);
    const status = normalizeListStatus(filters.status);
    const recipient = trimmedText(filters.recipient);
    const cursor = parseCursor(filters.cursor);

    const baseWhere: Record<string, unknown> = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(purpose ? { purpose } : {}),
      ...(status ? { status: status as never } : {}),
      ...(recipient
        ? {
            OR: [
              { toEmail: { contains: recipient, mode: "insensitive" as const } },
              { toNameSnapshot: { contains: recipient, mode: "insensitive" as const } }
            ]
          }
        : {}),
      customer: buildCustomerDataScopeWhere(user)
    };

    if (cursor) {
      const cursorEnd = new Date(cursor.updatedAt.getTime() + 1);
      baseWhere.AND = [{
        OR: [
          { updatedAt: { lt: cursor.updatedAt } },
          {
            updatedAt: { gte: cursor.updatedAt, lt: cursorEnd },
            id: { lt: cursor.id }
          }
        ]
      }];
    }

    const items = await this.prisma.emailDraft.findMany({
      where: baseWhere,
      select: {
        id: true,
        purpose: true,
        subject: true,
        toEmail: true,
        toNameSnapshot: true,
        fromEmailSnapshot: true,
        fromNameSnapshot: true,
        emailAccountId: true,
        status: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, stage: true } },
        emailAccount: { select: { id: true, name: true, email: true, scope: true } },
        aiGenerationRun: { select: { id: true, status: true } }
      },
      orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
      take: limit + 1
    });
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    return {
      items: pageItems,
      nextCursor: hasMore ? `${pageItems[pageItems.length - 1].updatedAt.toISOString()}|${pageItems[pageItems.length - 1].id}` : null
    };
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
