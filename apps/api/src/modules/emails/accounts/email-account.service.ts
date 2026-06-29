import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EmailAccountScope } from "@prisma/client";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { hasPermission } from "../../../common/auth/permission.utils";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { EmailSecretService } from "./email-secret.service";
import { EmailAccountListenerService } from "./email-account-listener.service";
import { EmailAccountTestService } from "./email-account-test.service";
import type { CreateEmailAccountDto } from "../dto/create-email-account.dto";
import type { UpdateEmailAccountDto } from "../dto/update-email-account.dto";

@Injectable()
export class EmailAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: EmailSecretService,
    private readonly listener: EmailAccountListenerService,
    private readonly testService: EmailAccountTestService
  ) {}

  list(user: RequestUser) {
    return this.prisma.emailAccount.findMany({
      where: { OR: [{ userId: user.id }, sharedAccountWhere(user)] },
      select: {
        id: true, scope: true, name: true, email: true,
        smtpHost: true, smtpPort: true, smtpSecure: true, smtpUsername: true,
        imapHost: true, imapPort: true, imapSecure: true, imapUsername: true,
        dailySendLimit: true, hourlySendLimit: true, isActive: true, lastSyncAt: true, createdAt: true
      }
    });
  }

  async create(user: RequestUser, dto: CreateEmailAccountDto) {
    if (dto.scope === "SHARED" && !hasPermission(user, "emails.accounts.manage_shared")) {
      throw new ForbiddenException("You do not have permission to create shared email accounts");
    }
    const encryptedSmtpPassword = this.secrets.encrypt(dto.smtpPassword);
    const encryptedImapPassword = this.secrets.encrypt(dto.imapPassword);
    const account = await this.prisma.emailAccount.create({
      data: {
        userId: user.id,
        scope: (dto.scope ?? EmailAccountScope.PERSONAL) as EmailAccountScope,
        name: dto.name, email: dto.email,
        smtpHost: dto.smtpHost, smtpPort: dto.smtpPort, smtpSecure: dto.smtpSecure ?? true,
        smtpUsername: dto.smtpUsername, smtpPasswordEncrypted: encryptedSmtpPassword.value,
        imapHost: dto.imapHost, imapPort: dto.imapPort, imapSecure: dto.imapSecure ?? true,
        imapUsername: dto.imapUsername, imapPasswordEncrypted: encryptedImapPassword.value,
        encryptionKeyVersion: encryptedSmtpPassword.keyVersion,
        dailySendLimit: dto.dailySendLimit ?? 80, hourlySendLimit: dto.hourlySendLimit ?? 20
      },
      include: { user: { select: { organizationId: true } } }
    });

    await this.listener.startAfterCreate(account);
    return account;
  }

  async update(user: RequestUser, id: string, dto: UpdateEmailAccountDto) {
    const account = await this.findAccount(user, id);
    this.assertCanUpdateAccount(user, account);
    this.assertScopeChangeAllowed(user, dto);

    const data = pickDefinedFields({
      scope: dto.scope as EmailAccountScope | undefined, name: dto.name, email: dto.email,
      smtpHost: dto.smtpHost, smtpPort: dto.smtpPort, smtpSecure: dto.smtpSecure,
      smtpUsername: dto.smtpUsername,
      smtpPasswordEncrypted: this.encryptPasswordIfProvided(dto.smtpPassword),
      imapHost: dto.imapHost, imapPort: dto.imapPort, imapSecure: dto.imapSecure,
      imapUsername: dto.imapUsername,
      imapPasswordEncrypted: this.encryptPasswordIfProvided(dto.imapPassword),
      dailySendLimit: dto.dailySendLimit, hourlySendLimit: dto.hourlySendLimit,
      isActive: dto.isActive
    });

    const updated = await this.prisma.emailAccount.update({
      where: { id: account.id }, data,
      include: { user: { select: { organizationId: true } } }
    });

    await this.listener.refreshAfterUpdate(account, updated, dto);
    return updated;
  }

  async test(user: RequestUser, id: string) {
    const account = await this.findAccount(user, id);
    return this.testService.test(account);
  }

  async findAccount(user: RequestUser, id: string) {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id, OR: [{ userId: user.id }, sharedAccountWhere(user)] }
    });
    if (!account) throw new NotFoundException("Email account not found");
    return account;
  }

  private assertCanUpdateAccount(user: RequestUser, account: { userId: string }) {
    if (account.userId !== user.id && !hasPermission(user, "emails.accounts.manage_shared")) {
      throw new ForbiddenException("Cannot update this email account");
    }
  }

  private assertScopeChangeAllowed(user: RequestUser, dto: UpdateEmailAccountDto) {
    if (dto.scope === "SHARED" && !hasPermission(user, "emails.accounts.manage_shared")) {
      throw new ForbiddenException("You do not have permission to share email accounts");
    }
  }

  private encryptPasswordIfProvided(password?: string) {
    if (!password) return undefined;
    return this.secrets.encrypt(password).value;
  }
}

export function sharedAccountWhere(user: Pick<RequestUser, "organizationId">) {
  return {
    scope: EmailAccountScope.SHARED,
    isActive: true,
    user: { organizationId: user.organizationId }
  };
}

function pickDefinedFields<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
