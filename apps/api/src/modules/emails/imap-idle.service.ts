import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ImapFlow } from "imapflow";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailSecretService } from "./email-secret.service";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";

type ConnectionStatus = "connecting" | "idle" | "fetching" | "disconnected";

type ManagedConnection = {
  client: ImapFlow;
  status: ConnectionStatus;
  account: ImapAccount;
  retryCount: number;
  retryTimer?: ReturnType<typeof setTimeout>;
};

type ImapAccount = {
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
  user: {
    organizationId: string;
  };
};

@Injectable()
export class ImapIdleService implements OnModuleInit, OnModuleDestroy {
  private connections = new Map<string, ManagedConnection>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: EmailSecretService,
    @InjectQueue(IMAP_INBOUND_QUEUE) private readonly inboundQueue: Queue
  ) {}

  async onModuleInit() {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: { organizationId: true }
        }
      }
    });
    for (const account of accounts) {
      await this.startAccount(account).catch((err) => {
        console.error(`[ImapIdle] Failed to start account ${account.id}:`, err.message);
      });
    }
  }

  async onModuleDestroy() {
    const ids = Array.from(this.connections.keys());
    await Promise.all(ids.map((id) => this.stopAccount(id)));
  }

  async startAccount(account: ImapAccount) {
    if (this.connections.has(account.id)) {
      await this.stopAccount(account.id);
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUsername,
        pass: this.secrets.decrypt(account.imapPasswordEncrypted)
      }
    });

    const conn: ManagedConnection = {
      client,
      status: "connecting",
      account,
      retryCount: 0
    };
    this.connections.set(account.id, conn);

    client.on("exists", () => this.onNewMail(account.id));

    client.on("close", () => {
      const current = this.connections.get(account.id);
      if (current) {
        current.status = "disconnected";
        this.scheduleReconnect(account.id);
      }
    });

    client.on("error", (err: Error) => {
      console.error(`[ImapIdle] Error on account ${account.id}:`, err.message);
    });

    await client.connect();
    await client.mailboxOpen("INBOX");
    conn.status = "idle";
    conn.retryCount = 0;
  }

  async stopAccount(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn) return;
    conn.status = "disconnected";
    if (conn.retryTimer) {
      clearTimeout(conn.retryTimer);
      conn.retryTimer = undefined;
    }
    try {
      await conn.client.logout();
    } catch { /* ignore */ }
    this.connections.delete(accountId);
  }

  async manualSyncForUser(userId: string) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        isActive: true,
        OR: [{ userId }, { scope: "SHARED" } as never]
      },
      include: {
        user: {
          select: { organizationId: true }
        }
      }
    });

    const results: Array<{ accountId: string; processed: number }> = [];

    for (const account of accounts) {
      const conn = this.connections.get(account.id);
      if (!conn || conn.status !== "idle") continue;

      conn.status = "fetching";
      const processed = await this.fetchAndEnqueue(conn);
      results.push({ accountId: account.id, processed });
      conn.status = "idle";
    }

    return { syncedAccounts: results.length, results };
  }

  private async onNewMail(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn || conn.status !== "idle") return;

    conn.status = "fetching";
    try {
      await this.fetchAndEnqueue(conn);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ImapIdle] Error processing mail for ${accountId}:`, message);
    }
    conn.status = "idle";
  }

  private async fetchAndEnqueue(conn: ManagedConnection) {
    let processed = 0;
    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      for await (const raw of conn.client.fetch(
        { seen: false },
        { envelope: true, source: false }
      )) {
        const msg = raw as any;
        const fromEmail = msg.envelope.from?.[0]?.address;
        if (!fromEmail || !msg.envelope.messageId) continue;

        await this.inboundQueue.add("process-inbound", {
          accountId: conn.account.id,
          messageId: msg.envelope.messageId,
          inReplyTo: msg.envelope.inReplyTo,
          fromEmail,
          toEmails:
            msg.envelope.to
              ?.map((item: { address?: string }) => item.address ?? "")
              .filter(Boolean) ?? [],
          subject: msg.envelope.subject ?? "(no subject)",
          receivedAt: (msg.envelope.date ?? new Date()).toISOString(),
          orgId: conn.account.user.organizationId
        });

        processed++;
      }
    } finally {
      lock.release();
    }

    if (processed > 0) {
      await this.prisma.emailAccount.update({
        where: { id: conn.account.id },
        data: { lastSyncAt: new Date() }
      });
    }

    return processed;
  }

  private scheduleReconnect(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn || conn.status !== "disconnected") return;

    const delay = Math.min(3_000 * Math.pow(2, conn.retryCount), 60_000);
    conn.retryCount++;

    conn.retryTimer = setTimeout(async () => {
      conn.retryTimer = undefined;
      try {
        await this.startAccount(conn.account);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[ImapIdle] Reconnect failed for ${accountId}:`, message);
      }
    }, delay);
  }
}
