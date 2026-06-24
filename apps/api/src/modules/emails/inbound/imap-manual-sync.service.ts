import { Injectable } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { ImapIdleService } from "./imap-idle.service";
import type { AccountSyncResult, ImapAccount, ManagedConnection } from "./types";

@Injectable()
export class ImapManualSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imapIdle: ImapIdleService
  ) {}

  async manualSyncForUser(userId: string) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { isActive: true, OR: [{ userId }, { scope: "SHARED" } as never] },
      include: { user: { select: { organizationId: true } } }
    });

    const results: AccountSyncResult[] = [];
    for (const account of accounts) {
      results.push(await this.syncAccountManually(account));
    }

    const synced = results.filter((item) => item.status === "success").length;
    const failed = results.filter((item) => item.status === "failed").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const enqueuedMessages = results.reduce((sum, item) => sum + item.enqueued, 0);
    const scannedMessages = results.reduce((sum, item) => sum + item.scanned, 0);

    return {
      attemptedAccounts: accounts.length,
      syncedAccounts: synced,
      failedAccounts: failed,
      skippedAccounts: skipped,
      scannedMessages,
      enqueuedMessages,
      results
    };
  }

  async getConnectionStatusesForUser(user: RequestUser) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { OR: [{ userId: user.id }, { scope: "SHARED", isActive: true } as never] },
      select: { id: true, name: true, email: true, isActive: true, lastSyncAt: true }
    });

    return {
      accounts: accounts.map((account) => {
        const conn = this.imapIdle.getConnection(account.id);
        return {
          accountId: account.id, name: account.name, email: account.email,
          isActive: account.isActive, lastSyncAt: account.lastSyncAt,
          connectionStatus: account.isActive ? conn?.status ?? "disconnected" : "disconnected",
          hasConnection: Boolean(conn), retryCount: conn?.retryCount ?? 0,
          lastError: conn?.lastError, lastConnectedAt: conn?.lastConnectedAt,
          lastDisconnectedAt: conn?.lastDisconnectedAt, nextReconnectAt: conn?.nextReconnectAt
        };
      })
    };
  }

  private async syncAccountManually(account: ImapAccount): Promise<AccountSyncResult> {
    const conn = this.imapIdle.getConnection(account.id);

    if (conn?.status === "idle") {
      return this.syncViaManagedConnection(account, conn);
    }

    if (conn?.status === "fetching" || conn?.status === "connecting" || conn?.status === "reconnecting") {
      const statusLabels: Record<string, string> = { fetching: "同步", connecting: "连接", reconnecting: "连接" };
      return {
        accountId: account.id, email: account.email, mode: "skipped", status: "skipped",
        connectionStatus: conn.status, scanned: 0, enqueued: 0,
        reason: `邮箱正在${statusLabels[conn.status] ?? "连接"}，本次手动同步已跳过。`
      };
    }

    return this.syncWithTemporaryConnection(account);
  }

  private async syncViaManagedConnection(account: ImapAccount, conn: ManagedConnection): Promise<AccountSyncResult> {
    conn.status = "fetching";
    try {
      const result = await this.imapIdle.fetchAndEnqueue({ account, client: this.imapIdle.getConnection(account.id)!.client, mode: "managed" });
      await this.imapIdle.markAccountSynced(account.id);
      return {
        accountId: account.id, email: account.email, mode: "managed", status: "success",
        connectionStatus: "idle", scanned: result.scanned, enqueued: result.enqueued
      };
    } catch (err) {
      conn.lastError = err instanceof Error ? err.message : "Unknown error";
      return {
        accountId: account.id, email: account.email, mode: "managed", status: "failed",
        connectionStatus: "fetching", scanned: 0, enqueued: 0,
        reason: conn.lastError
      };
    } finally {
      const current = this.imapIdle.getConnection(account.id);
      if (current && current.status === "fetching") {
        current.status = "idle";
      }
    }
  }

  private async syncWithTemporaryConnection(account: ImapAccount): Promise<AccountSyncResult> {
    const client = this.imapIdle.createClient(account);
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const result = await this.imapIdle.fetchAndEnqueue({ account, client, mode: "temporary" });
      await this.imapIdle.markAccountSynced(account.id);
      return {
        accountId: account.id, email: account.email, mode: "temporary", status: "success",
        connectionStatus: this.imapIdle.getConnection(account.id)?.status ?? "disconnected",
        scanned: result.scanned, enqueued: result.enqueued
      };
    } catch (err) {
      return {
        accountId: account.id, email: account.email, mode: "temporary", status: "failed",
        connectionStatus: this.imapIdle.getConnection(account.id)?.status ?? "disconnected",
        scanned: 0, enqueued: 0,
        reason: err instanceof Error ? err.message : "Unknown error"
      };
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}
