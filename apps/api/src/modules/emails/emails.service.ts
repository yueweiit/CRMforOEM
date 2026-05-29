import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ImapSyncService } from "./imap-sync.service";
import { AiContentVersionType, AiGenerationType, CustomerStage, EmailDraftStatus } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { AiProviderService } from "../ai/ai-provider.service";
import { CustomerStageService } from "../customers/customer-stage.service";
import { FollowUpRulesService } from "../follow-ups/follow-up-rules.service";
import { Queue } from "bullmq";
import { EmailComplianceService } from "./email-compliance.service";
import { EmailSecretService } from "./email-secret.service";
import { ApproveEmailDraftDto } from "./dto/approve-email-draft.dto";
import { CreateEmailAccountDto } from "./dto/create-email-account.dto";
import { GenerateEmailDraftDto } from "./dto/generate-email-draft.dto";
import { UpdateEmailAccountDto } from "./dto/update-email-account.dto";
import { UpdateEmailDraftDto } from "./dto/update-email-draft.dto";
import { EMAIL_DRAFT_QUEUE } from "./email-draft.constants";
import { SmtpService } from "./smtp.service";

@Injectable()
export class EmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGeneration: AiGenerationService,
    private readonly aiProvider: AiProviderService,
    private readonly customerStageService: CustomerStageService,
    private readonly followUpRules: FollowUpRulesService,
    private readonly secrets: EmailSecretService,
    private readonly compliance: EmailComplianceService,
    private readonly smtp: SmtpService,
    private readonly imapSync: ImapSyncService,
    @InjectQueue(EMAIL_DRAFT_QUEUE) private readonly emailDraftQueue: Queue
  ) {}

  listAccounts(user: RequestUser) {
    return this.prisma.emailAccount.findMany({
      where: {
        OR: [{ userId: user.id }, { scope: "SHARED", isActive: true } as never]
      },
      select: {
        id: true,
        scope: true,
        name: true,
        email: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUsername: true,
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        imapUsername: true,
        dailySendLimit: true,
        hourlySendLimit: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true
      }
    });
  }

  async createAccount(user: RequestUser, dto: CreateEmailAccountDto) {
    if (dto.scope === "SHARED" && !user.roleCodes.includes("ADMIN")) {
      throw new ForbiddenException("Only administrators can create shared email accounts");
    }
    const encryptedSmtpPassword = this.secrets.encrypt(dto.smtpPassword);
    const encryptedImapPassword = this.secrets.encrypt(dto.imapPassword);
    return this.prisma.emailAccount.create({
      data: {
        userId: user.id,
        scope: (dto.scope ?? "PERSONAL") as never,
        name: dto.name,
        email: dto.email,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        smtpSecure: dto.smtpSecure ?? true,
        smtpUsername: dto.smtpUsername,
        smtpPasswordEncrypted: encryptedSmtpPassword.value,
        imapHost: dto.imapHost,
        imapPort: dto.imapPort,
        imapSecure: dto.imapSecure ?? true,
        imapUsername: dto.imapUsername,
        imapPasswordEncrypted: encryptedImapPassword.value,
        encryptionKeyVersion: encryptedSmtpPassword.keyVersion,
        dailySendLimit: dto.dailySendLimit ?? 80,
        hourlySendLimit: dto.hourlySendLimit ?? 20
      }
    });
  }

  async updateAccount(user: RequestUser, id: string, dto: UpdateEmailAccountDto) {
    const account = await this.findEditableAccount(user, id);
    this.assertCanUpdateAccount(user, account);
    this.assertScopeChangeAllowed(user, dto);

    const data = this.buildEmailAccountUpdateData(dto);

    return this.prisma.emailAccount.update({
      where: { id: account.id },
      data
    });
  }

  async testAccount(user: RequestUser, id: string) {
    const account = await this.findAccount(user, id);

    const smtp = { ok: false, message: "SMTP 未测试。" };
    const imap = { ok: false, message: "IMAP 未测试。" };

    try {
      await this.smtp.verify(account);
      smtp.ok = true;
      smtp.message = "SMTP 连接正常。";
    } catch (error) {
      smtp.message = mapSmtpTestError(error);
    }

    try {
      await this.imapSync.verifyAccount(account);
      imap.ok = true;
      imap.message = "IMAP 连接正常。";
    } catch (error) {
      imap.message = mapImapTestError(error);
    }

    return {
      overallOk: smtp.ok && imap.ok,
      smtp,
      imap,
      message: buildEmailTestSummary(smtp, imap)
    };
  }

  async generateDraft(user: RequestUser, customerId: string, dto: GenerateEmailDraftDto) {
    const context = await this.buildEmailContext(user, customerId, dto);
    const run = await this.aiGeneration.createRun({
      organizationId: user.organizationId,
      customerId,
      type: AiGenerationType.EmailDraft,
      model: this.aiProvider.model,
      promptVersion: "email-draft-v1",
      rawInput: context,
      createdById: user.id
    });

    const toEmail = dto.toEmail ?? context.bestContact?.email;
    if (!toEmail) {
      throw new BadRequestException("No recipient email available");
    }

    const subject = dto.subject ?? buildSubject(context.customer.name);
    const draft = await this.prisma.emailDraft.create({
      data: {
        customerId,
        emailAccountId: dto.emailAccountId,
        aiGenerationRunId: run.id,
        subject,
        body: "",
        toEmail,
        ccEmails: dto.ccEmails ?? [],
        bccEmails: dto.bccEmails ?? [],
        status: EmailDraftStatus.Draft as never,
        createdById: user.id
      }
    });

    await this.emailDraftQueue.add("generate-email-draft", {
      draftId: draft.id,
      context: {
        purpose: context.purpose,
        bestContact: context.bestContact,
        contacts: context.contacts
      },
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
  
    return { id: draft.id, status: draft.status, message: "草稿生成中，请稍后刷新查看。" };
  }

  async getDraft(user: RequestUser, id: string) {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id, customer: buildCustomerDataScopeWhere(user) },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });
    if (!draft) {
      throw new NotFoundException("Email draft not found");
    }
    return draft;
  }

  async updateDraft(user: RequestUser, id: string, dto: UpdateEmailDraftDto) {
    const draft = await this.getDraft(user, id);
    if (draft.status === "SENT") {
      throw new BadRequestException("Sent draft cannot be edited");
    }

    const updated = await this.prisma.emailDraft.update({
      where: { id },
      data: {
        subject: dto.subject,
        body: dto.body,
        toEmail: dto.toEmail,
        ccEmails: dto.ccEmails,
        bccEmails: dto.bccEmails,
        emailAccountId: dto.emailAccountId,
        status: EmailDraftStatus.PendingReview as never
      }
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
    return this.prisma.emailDraft.update({
      where: { id },
      data: { status: EmailDraftStatus.PendingReview as never }
    });
  }

  async approve(user: RequestUser, id: string, dto: ApproveEmailDraftDto) {
    const draft = await this.getDraft(user, id);
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
      where: { id },
      data: {
        status: EmailDraftStatus.Approved as never,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewComment: dto.reviewComment
      }
    });
  }

  async sendApprovedDraft(user: RequestUser, id: string) {
    const draft = await this.getDraft(user, id);
    const account = draft.emailAccountId
      ? await this.findAccount(user, draft.emailAccountId)
      : await this.prisma.emailAccount.findFirst({
          where: {
            isActive: true,
            OR: [{ userId: user.id }, { scope: "SHARED" } as never]
          },
          orderBy: [{ scope: "asc" as never }, { createdAt: "asc" }]
        });
    if (!account) {
      throw new BadRequestException("No active email account available");
    }

    await this.compliance.assertCanSend(user, draft, account);
    const sendResult = await this.smtp.send(account, draft);

    await this.compliance.consumeQuota(account);

    const thread = await this.prisma.emailThread.create({
      data: {
        customerId: draft.customerId,
        subject: draft.subject,
        lastMessageAt: new Date()
      }
    });

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
        sentAt: new Date()
      }
    });

    await this.prisma.emailDraft.update({
      where: { id: draft.id },
      data: {
        status: EmailDraftStatus.Sent as never,
        sentMessageId: message.id
      }
    });

    const purpose = getDraftPurpose(draft.aiGenerationRun?.rawInput);
    if (purpose === "FIRST_OUTREACH") {
      await this.customerStageService.advanceCustomerStage({
        customerId: draft.customerId,
        toStage: CustomerStage.FirstEmailSent,
        changedById: user.id,
        reason: "First outreach email sent"
      });
    } else if (purpose === "REQUIREMENT_CONFIRMATION") {
      await this.customerStageService.advanceCustomerStage({
        customerId: draft.customerId,
        toStage: CustomerStage.RequirementConfirming,
        changedById: user.id,
        reason: "Requirement confirmation email sent"
      });
    }

    await this.followUpRules.handleEmailSent({
      customerId: draft.customerId,
      actorUserId: user.id,
      purpose
    });

    return {
      queued: false,
      draftId: draft.id,
      messageId: message.id,
      message: "邮件已发送。"
    };
  }

  async listCustomerThreads(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.emailThread.findMany({
      where: { customerId },
      orderBy: { lastMessageAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
  }

  async listDrafts(user: RequestUser, filters: { customerId?: string; status?: string }) {
    return this.prisma.emailDraft.findMany({
      where: {
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        customer: { select: { id: true, name: true, stage: true } },
        emailAccount: { select: { id: true, name: true, email: true, scope: true } },
        aiGenerationRun: { select: { id: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
  }

  async listThreads(user: RequestUser) {
    return this.prisma.emailThread.findMany({
      where: { customer: buildCustomerDataScopeWhere(user) },
      include: {
        customer: { select: { id: true, name: true, stage: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100
    });
  }

  async listThreadMessages(user: RequestUser, threadId: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!thread) {
      throw new NotFoundException("Email thread not found");
    }
    return this.prisma.emailMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      include: { attachments: true }
    });
  }

  private async buildEmailContext(user: RequestUser, customerId: string, dto: GenerateEmailDraftDto) {
    const customer = await this.ensureCustomerVisible(user, customerId);
    const [contacts, websiteAnalysis, researchReport, oemFitScore, companyProfiles] = await Promise.all([
      this.prisma.contact.findMany({ where: { customerId }, orderBy: [{ isDecisionMaker: "desc" }, { qualityScore: "desc" }] }),
      this.prisma.websiteAnalysis.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.researchReport.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.oemFitScore.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.companyProfile.findMany({
        where: { organizationId: user.organizationId },
        include: { capabilities: true, products: { take: 50 }, certificates: true, caseStudies: true, emailMaterials: true }
      })
    ]);
    return {
      purpose: dto.purpose ?? "FIRST_OUTREACH",
      customer,
      bestContact: contacts[0],
      contacts,
      websiteAnalysis,
      researchReport,
      oemFitScore,
      companyProfiles,
      userInstructions: dto.userInstructions
    };
  }

  private async findAccount(user: RequestUser, id: string) {
    const account = await this.prisma.emailAccount.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { scope: "SHARED", isActive: true } as never]
      }
    });
    if (!account) {
      throw new NotFoundException("Email account not found");
    }
    return account;
  }

  private async findEditableAccount(user: RequestUser, id: string) {
    return this.findAccount(user, id);
  }

  private assertCanUpdateAccount(
    user: RequestUser,
    account: { userId: string }
  ) {
    if (account.userId !== user.id && !user.roleCodes.includes("ADMIN")) {
      throw new ForbiddenException("Cannot update this email account");
    }
  }

  private assertScopeChangeAllowed(user: RequestUser, dto: UpdateEmailAccountDto) {
    if (dto.scope === "SHARED" && !user.roleCodes.includes("ADMIN")) {
      throw new ForbiddenException("Only administrators can share email accounts");
    }
  }

  private buildEmailAccountUpdateData(dto: UpdateEmailAccountDto) {
    return pickDefinedFields({
      scope: dto.scope as never,
      name: dto.name,
      email: dto.email,
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      smtpUsername: dto.smtpUsername,
      smtpPasswordEncrypted: this.encryptPasswordIfProvided(dto.smtpPassword),
      imapHost: dto.imapHost,
      imapPort: dto.imapPort,
      imapSecure: dto.imapSecure,
      imapUsername: dto.imapUsername,
      imapPasswordEncrypted: this.encryptPasswordIfProvided(dto.imapPassword),
      dailySendLimit: dto.dailySendLimit,
      hourlySendLimit: dto.hourlySendLimit,
      isActive: dto.isActive
    });
  }

  private encryptPasswordIfProvided(password?: string) {
    if (!password) return undefined;
    return this.secrets.encrypt(password).value;
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

}

function buildSubject(customerName: string) {
  return `OEM cooperation idea for ${customerName}`;
}

function getDraftPurpose(rawInput: unknown) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return undefined;
  const purpose = (rawInput as { purpose?: unknown }).purpose;
  return typeof purpose === "string" ? purpose : undefined;
}

function pickDefinedFields<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function buildEmailTestSummary(smtp: { ok: boolean; message: string }, imap: { ok: boolean; message: string }) {
  if (smtp.ok && imap.ok) {
    return "SMTP 与 IMAP 均连接正常。";
  }
  if (smtp.ok && !imap.ok) {
    return `SMTP 正常，${imap.message} 该邮箱当前可用于发信，但无法同步回复。`;
  }
  if (!smtp.ok && imap.ok) {
    return `IMAP 正常，${smtp.message} 该邮箱当前可用于收信同步，但无法用于发信。`;
  }
  return `${smtp.message} ${imap.message}`.trim();
}

function mapSmtpTestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const response = typeof error === "object" && error && "response" in error ? String((error as { response?: unknown }).response ?? "") : "";
  const detail = `${code} ${message} ${response}`.toLowerCase();

  if (detail.includes("invalid login") || detail.includes("auth") || detail.includes("eauth") || detail.includes("535") || detail.includes("username and password not accepted")) {
    return "SMTP 认证失败，请检查用户名或授权码是否正确。";
  }
  if (detail.includes("etimedout") || detail.includes("econnection") || detail.includes("esocket") || detail.includes("ssl") || detail.includes("tls") || detail.includes("certificate") || detail.includes("greeting never received")) {
    return "SMTP 连接失败，请检查服务器地址、端口或 SSL 配置是否正确。";
  }
  return "SMTP 测试失败，请检查服务器地址、端口、SSL、用户名和授权码配置。";
}

function mapImapTestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const response = typeof error === "object" && error && "response" in error ? String((error as { response?: unknown }).response ?? "") : "";
  const responseText = typeof error === "object" && error && "responseText" in error ? String((error as { responseText?: unknown }).responseText ?? "") : "";
  const authenticationFailed = typeof error === "object" && error && "authenticationFailed" in error ? Boolean((error as { authenticationFailed?: unknown }).authenticationFailed) : false;
  const detail = `${message} ${response} ${responseText}`.toLowerCase();

  if (detail.includes("custom imap off") || detail.includes("imap off")) {
    return "IMAP 未开启，请先在邮箱后台启用 IMAP 或第三方客户端访问。";
  }
  if (authenticationFailed || detail.includes("login failed") || detail.includes("authentication failed") || detail.includes("invalid credentials")) {
    return "IMAP 登录失败，请检查用户名或授权码是否正确。";
  }
  if (detail.includes("etimedout") || detail.includes("econnection") || detail.includes("esocket") || detail.includes("ssl") || detail.includes("tls") || detail.includes("certificate") || detail.includes("greeting never received")) {
    return "IMAP 连接失败，请检查服务器地址、端口或 SSL 配置是否正确。";
  }
  return "IMAP 测试失败，请检查是否已开启 IMAP、服务器地址、端口、SSL、用户名和授权码配置。";
}
