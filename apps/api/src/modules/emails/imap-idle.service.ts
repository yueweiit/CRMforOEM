import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ImapFlow } from "imapflow";
import { Queue } from "bullmq";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailSecretService } from "./email-secret.service";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";

type ConnectionStatus = "connecting" | "idle" | "fetching" | "reconnecting" | "disconnected" | "auth_failed";

type ManagedConnection = {
  client: ImapFlow;
  status: ConnectionStatus;
  account: ImapAccount;
  retryCount: number;
  manualStop: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
  lastError?: string;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  nextReconnectAt?: Date;
};

type ImapAccount = {
  id: string;
  name?: string;
  email?: string;
  isActive?: boolean;
  lastSyncAt?: Date | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
  user: {
    organizationId: string;
  };
};

type SyncMode = "idle" | "managed" | "temporary";

type AccountSyncResult = {
  accountId: string;
  email?: string;
  mode: SyncMode | "skipped";
  status: "success" | "skipped" | "failed";
  connectionStatus?: ConnectionStatus;
  scanned: number;
  enqueued: number;
  reason?: string;
};

type FetchContext = {
  account: ImapAccount;
  client: ImapFlow;
  mode: SyncMode;
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
        console.error(`[ImapIdle] Failed to start account ${account.id}:`, this.formatError(err));
      });
    }
  }

  async onModuleDestroy() {
    const ids = Array.from(this.connections.keys());
    await Promise.all(ids.map((id) => this.stopAccount(id)));
  }

  async startAccount(account: ImapAccount) {
    if (!account.isActive && account.isActive !== undefined) {
      await this.stopAccount(account.id);
      return;
    }

    if (this.connections.has(account.id)) {
      await this.stopAccount(account.id);
    }

    const client = this.createClient(account);
    const conn: ManagedConnection = {
      client,
      status: "connecting",
      account,
      retryCount: 0,
      manualStop: false
    };
    this.connections.set(account.id, conn);

    client.on("exists", () => this.onNewMail(account.id));

    client.on("close", () => {
      const current = this.connections.get(account.id);
      if (!current || current.manualStop) return;
      current.status = "disconnected";
      current.lastDisconnectedAt = new Date();
      this.scheduleReconnect(account.id, "IMAP connection closed");
    });

    client.on("error", (err: Error) => {
      const current = this.connections.get(account.id);
      if (current) {
        current.lastError = this.formatError(err);
      }
      console.error(`[ImapIdle] Error on account ${account.id}:`, this.formatError(err));
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      conn.status = "idle";
      conn.retryCount = 0;
      conn.lastConnectedAt = new Date();
      conn.lastError = undefined;
      conn.nextReconnectAt = undefined;
    } catch (err) {
      conn.lastError = this.formatError(err);
      conn.lastDisconnectedAt = new Date();
      conn.status = this.isAuthFailure(err) ? "auth_failed" : "disconnected";
      if (conn.status === "disconnected") {
        this.scheduleReconnect(account.id, conn.lastError);
      }
      throw err;
    }
  }

  async stopAccount(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn) return;
    conn.manualStop = true;
    conn.status = "disconnected";
    conn.lastDisconnectedAt = new Date();
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

    const results: AccountSyncResult[] = [];

    for (const account of accounts) {
      results.push(await this.syncAccountManually(account));
    }

    const syncedAccounts = results.filter((item) => item.status === "success").length;
    const failedAccounts = results.filter((item) => item.status === "failed").length;
    const skippedAccounts = results.filter((item) => item.status === "skipped").length;
    const enqueuedMessages = results.reduce((sum, item) => sum + item.enqueued, 0);
    const scannedMessages = results.reduce((sum, item) => sum + item.scanned, 0);

    return {
      attemptedAccounts: accounts.length,
      syncedAccounts,
      failedAccounts,
      skippedAccounts,
      scannedMessages,
      enqueuedMessages,
      results
    };
  }

  async getConnectionStatusesForUser(user: RequestUser) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        OR: [{ userId: user.id }, { scope: "SHARED", isActive: true } as never]
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        lastSyncAt: true
      }
    });

    return {
      accounts: accounts.map((account) => {
        const conn = this.connections.get(account.id);
        return {
          accountId: account.id,
          name: account.name,
          email: account.email,
          isActive: account.isActive,
          lastSyncAt: account.lastSyncAt,
          connectionStatus: account.isActive ? conn?.status ?? "disconnected" : "disconnected",
          hasConnection: Boolean(conn),
          retryCount: conn?.retryCount ?? 0,
          lastError: conn?.lastError,
          lastConnectedAt: conn?.lastConnectedAt,
          lastDisconnectedAt: conn?.lastDisconnectedAt,
          nextReconnectAt: conn?.nextReconnectAt
        };
      })
    };
  }

  private async syncAccountManually(account: ImapAccount): Promise<AccountSyncResult> {
    const conn = this.connections.get(account.id);

    if (conn?.status === "idle") {
      conn.status = "fetching";
      try {
        const result = await this.fetchAndEnqueue({ account: conn.account, client: conn.client, mode: "managed" });
        await this.markAccountSynced(account.id);
        return {
          accountId: account.id,
          email: account.email,
          mode: "managed",
          status: "success",
          connectionStatus: "idle",
          scanned: result.scanned,
          enqueued: result.enqueued
        };
      } catch (err) {
        conn.lastError = this.formatError(err);
        return {
          accountId: account.id,
          email: account.email,
          mode: "managed",
          status: "failed",
          connectionStatus: conn.status,
          scanned: 0,
          enqueued: 0,
          reason: conn.lastError
        };
      } finally {
        if (this.connections.get(account.id) === conn && conn.status === "fetching") {
          conn.status = "idle";
        }
      }
    }

    if (conn?.status === "fetching" || conn?.status === "connecting" || conn?.status === "reconnecting") {
      return {
        accountId: account.id,
        email: account.email,
        mode: "skipped",
        status: "skipped",
        connectionStatus: conn.status,
        scanned: 0,
        enqueued: 0,
        reason: `邮箱正在${conn.status === "fetching" ? "同步" : "连接"}，本次手动同步已跳过。`
      };
    }

    return this.syncWithTemporaryConnection(account);
  }

  private async syncWithTemporaryConnection(account: ImapAccount): Promise<AccountSyncResult> {
    const client = this.createClient(account);
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const result = await this.fetchAndEnqueue({ account, client, mode: "temporary" });
      await this.markAccountSynced(account.id);
      return {
        accountId: account.id,
        email: account.email,
        mode: "temporary",
        status: "success",
        connectionStatus: this.connections.get(account.id)?.status ?? "disconnected",
        scanned: result.scanned,
        enqueued: result.enqueued
      };
    } catch (err) {
      return {
        accountId: account.id,
        email: account.email,
        mode: "temporary",
        status: "failed",
        connectionStatus: this.connections.get(account.id)?.status ?? "disconnected",
        scanned: 0,
        enqueued: 0,
        reason: this.formatError(err)
      };
    } finally {
      try {
        await client.logout();
      } catch { /* ignore */ }
    }
  }

  private async onNewMail(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn || conn.status !== "idle") return;

    conn.status = "fetching";
    try {
      await this.fetchAndEnqueue({ account: conn.account, client: conn.client, mode: "idle" });
      await this.markAccountSynced(conn.account.id);
    } catch (err) {
      conn.lastError = this.formatError(err);
      console.error(`[ImapIdle] Error processing mail for ${accountId}:`, conn.lastError);
    } finally {
      if (this.connections.get(accountId) === conn && conn.status === "fetching") {
        conn.status = "idle";
      }
    }
  }

  private async fetchAndEnqueue(context: FetchContext) {
    let scanned = 0;
    let enqueued = 0;
    const lock = await context.client.getMailboxLock("INBOX");
    try {
      const query = context.mode === "idle"
        ? { seen: false }
        : { since: await this.resolveManualSyncSince(context.account.id) };

      for await (const raw of context.client.fetch(
        query,
        { envelope: true, source: false }
      )) {
        scanned++;
        const msg = raw as any;
        const messageId = msg.envelope.messageId;
        const fromEmail = msg.envelope.from?.[0]?.address;
        if (!fromEmail || !messageId) continue;

        await this.inboundQueue.add("process-inbound", {
          accountId: context.account.id,
          messageId,
          inReplyTo: msg.envelope.inReplyTo,
          fromEmail,
          toEmails:
            msg.envelope.to
              ?.map((item: { address?: string }) => item.address ?? "")
              .filter(Boolean) ?? [],
          subject: msg.envelope.subject ?? "(no subject)",
          receivedAt: (msg.envelope.date ?? new Date()).toISOString(),
          orgId: context.account.user.organizationId
        }, {
          jobId: this.buildInboundJobId(context.account.id, messageId)
        });

        enqueued++;
      }
    } finally {
      lock.release();
    }

    return { scanned, enqueued };
  }

  private async resolveManualSyncSince(accountId: string) {
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { lastSyncAt: true }
    });
    const fallback = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const previous = account?.lastSyncAt?.getTime() ?? fallback;
    return new Date(Math.max(previous - 10 * 60 * 1000, fallback));
  }

  private async markAccountSynced(accountId: string) {
    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() }
    });
  }

  private scheduleReconnect(accountId: string, reason: string) {
    const conn = this.connections.get(accountId);
    if (!conn || conn.manualStop || conn.status === "auth_failed" || conn.retryTimer) return;

    const delay = this.reconnectDelay(conn.retryCount);
    conn.status = "reconnecting";
    conn.retryCount++;
    conn.lastError = reason;
    conn.nextReconnectAt = new Date(Date.now() + delay);

    conn.retryTimer = setTimeout(async () => {
      conn.retryTimer = undefined;
      try {
        await this.startAccount(conn.account);
      } catch (err) {
        const current = this.connections.get(accountId);
        if (current && !current.manualStop && current.status !== "auth_failed") {
          current.lastError = this.formatError(err);
          current.status = "disconnected";
          this.scheduleReconnect(accountId, current.lastError);
        }
        console.error(`[ImapIdle] Reconnect failed for ${accountId}:`, this.formatError(err));
      }
    }, delay);
  }

  private reconnectDelay(retryCount: number) {
    const fastDelays = [1_000, 3_000, 5_000, 10_000];
    return fastDelays[retryCount] ?? Math.min(30_000 + retryCount * 5_000, 60_000);
  }

  private createClient(account: ImapAccount) {
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

  private buildInboundJobId(accountId: string, messageId: string) {
    return `imap-inbound:${accountId}:${Buffer.from(messageId).toString("base64url")}`;
  }

  private isAuthFailure(error: unknown) {
    const message = this.formatError(error).toLowerCase();
    return message.includes("authentication")
      || message.includes("invalid credentials")
      || message.includes("login failed")
      || message.includes("auth failed");
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error";
  }
}
