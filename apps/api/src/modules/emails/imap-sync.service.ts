import { Injectable } from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailSecretService } from "./email-secret.service";
import { ImapInboundService } from "./imap-inbound.service";

type EmailAccountLike = {
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
};

@Injectable()
export class ImapSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: EmailSecretService,
    private readonly inboundService: ImapInboundService
  ) {}

  async verifyAccount(account: EmailAccountLike) {
    const client = this.createClient(account);
    await client.connect();
    try {
      return { ok: true };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async syncForUser(user: RequestUser) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        isActive: true,
        OR: [{ userId: user.id }, { scope: "SHARED" } as never]
      }
    });
    const results = [];

    for (const account of accounts) {
      results.push(await this.syncAccount(account));
    }

    return { syncedAccounts: results.length, results };
  }

  private async syncAccount(account: Awaited<ReturnType<PrismaService["emailAccount"]["findMany"]>>[number]) {
    const client = this.createClient(account);
    let imported = 0;
    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        for await (const rawMessage of client.fetch({ seen: false }, { envelope: true, source: false, headers: true })) {
          const message = rawMessage as any;
          const fromEmail = message.envelope.from?.[0]?.address;
          if (!fromEmail || !message.envelope.messageId) {
            continue;
          }
          const result = await this.inboundService.handleInboundMessage({
            accountId: account.id,
            messageId: message.envelope.messageId,
            inReplyTo: message.envelope.inReplyTo,
            fromEmail,
            toEmails: message.envelope.to?.map((item: { address?: string }) => item.address ?? "").filter(Boolean) ?? [],
            subject: message.envelope.subject ?? "(no subject)",
            receivedAt: message.envelope.date ?? new Date()
          });
          if (!result) {
            continue;
          }
          imported += 1;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
      await this.prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date() }
      });
    }

    return { accountId: account.id, imported };
  }

  private createClient(account: EmailAccountLike) {
    return new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUsername,
        pass: this.secrets.decrypt(account.imapPasswordEncrypted)
      }
    });
  }
}
