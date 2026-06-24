import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { EmailSecretService } from "../accounts/email-secret.service";
import { ImapConnectionRegistryService } from "./imap-connection-registry.service";
import { ImapFetchEnqueueService } from "./imap-fetch-enqueue.service";
import { ImapReconnectService } from "./imap-reconnect.service";
import type { FetchContext, ImapAccount, ManagedConnection } from "./types";

@Injectable()
export class ImapIdleService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: EmailSecretService,
    private readonly registry: ImapConnectionRegistryService,
    private readonly fetchEnqueue: ImapFetchEnqueueService,
    private readonly reconnect: ImapReconnectService
  ) {}

  async onModuleInit() {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { isActive: true },
      include: { user: { select: { organizationId: true } } }
    });
    for (const account of accounts) {
      await this.startAccount(account).catch((err) => {
        console.error(`[ImapIdle] Failed to start account ${account.id}:`, this.reconnect.formatError(err));
      });
    }
  }

  async onModuleDestroy() {
    const ids = this.registry.getAllIds();
    await Promise.all(ids.map((id) => this.stopAccount(id)));
  }

  // ── Public accessors ──

  getConnection(accountId: string) {
    return this.registry.get(accountId);
  }

  createClient(account: ImapAccount) {
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

  fetchAndEnqueue(context: FetchContext) {
    return this.fetchEnqueue.fetchAndEnqueue(context);
  }

  markAccountSynced(accountId: string) {
    return this.fetchEnqueue.markAccountSynced(accountId);
  }

  // ── Connection lifecycle ──

  async startAccount(account: ImapAccount) {
    if (!account.isActive && account.isActive !== undefined) {
      await this.stopAccount(account.id);
      return;
    }

    if (this.registry.has(account.id)) {
      await this.stopAccount(account.id);
    }

    const client = this.createClient(account);
    const conn: ManagedConnection = {
      client, status: "connecting", account, retryCount: 0, manualStop: false
    };
    this.registry.set(account.id, conn);

    client.on("exists", () => this.onNewMail(account.id));

    client.on("close", () => {
      const current = this.registry.get(account.id);
      if (!current || current.manualStop) return;
      current.status = "disconnected";
      current.lastDisconnectedAt = new Date();
      this.scheduleReconnect(account.id, "IMAP connection closed");
    });

    client.on("error", (err: Error) => {
      const current = this.registry.get(account.id);
      if (current) current.lastError = this.reconnect.formatError(err);
      console.error(`[ImapIdle] Error on account ${account.id}:`, this.reconnect.formatError(err));
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
      conn.lastError = this.reconnect.formatError(err);
      conn.lastDisconnectedAt = new Date();
      conn.status = this.reconnect.isAuthFailure(err) ? "auth_failed" : "disconnected";
      if (conn.status === "disconnected") {
        this.scheduleReconnect(account.id, conn.lastError);
      }
      throw err;
    }
  }

  async stopAccount(accountId: string) {
    const conn = this.registry.get(accountId);
    if (!conn) return;
    conn.manualStop = true;
    conn.status = "disconnected";
    conn.lastDisconnectedAt = new Date();
    if (conn.retryTimer) {
      clearTimeout(conn.retryTimer);
      conn.retryTimer = undefined;
    }
    try { await conn.client.logout(); } catch { /* ignore */ }
    this.registry.delete(accountId);
  }

  // ── Internal helpers ──

  private async onNewMail(accountId: string) {
    const conn = this.registry.get(accountId);
    if (!conn || conn.status !== "idle") return;

    conn.status = "fetching";
    try {
      await this.fetchEnqueue.fetchAndEnqueue({ account: conn.account, client: conn.client, mode: "idle" });
      await this.fetchEnqueue.markAccountSynced(conn.account.id);
    } catch (err) {
      conn.lastError = this.reconnect.formatError(err);
      console.error(`[ImapIdle] Error processing mail for ${accountId}:`, conn.lastError);
    } finally {
      if (this.registry.get(accountId) === conn && conn.status === "fetching") {
        conn.status = "idle";
      }
    }
  }

  private scheduleReconnect(accountId: string, reason: string) {
    const conn = this.registry.get(accountId);
    if (!conn || conn.manualStop || conn.status === "auth_failed" || conn.retryTimer) return;

    const delay = this.reconnect.reconnectDelay(conn.retryCount);
    conn.status = "reconnecting";
    conn.retryCount++;
    conn.lastError = reason;
    conn.nextReconnectAt = new Date(Date.now() + delay);

    conn.retryTimer = setTimeout(async () => {
      conn.retryTimer = undefined;
      try {
        await this.startAccount(conn.account);
      } catch (err) {
        const current = this.registry.get(accountId);
        if (current && !current.manualStop && current.status !== "auth_failed") {
          current.lastError = this.reconnect.formatError(err);
          current.status = "disconnected";
          this.scheduleReconnect(accountId, current.lastError);
        }
        console.error(`[ImapIdle] Reconnect failed for ${accountId}:`, this.reconnect.formatError(err));
      }
    }, delay);
  }
}
