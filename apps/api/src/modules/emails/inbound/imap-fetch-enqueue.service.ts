import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";
import type { FetchContext } from "./types";

@Injectable()
export class ImapFetchEnqueueService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(IMAP_INBOUND_QUEUE) private readonly inboundQueue: Queue
  ) {}

  async fetchAndEnqueue(context: FetchContext) {
    let scanned = 0;
    let enqueued = 0;
    const lock = await context.client.getMailboxLock("INBOX");
    try {
      const query = context.mode === "idle"
        ? { seen: false }
        : { since: await this.resolveManualSyncSince(context.account.id) };

      for await (const raw of context.client.fetch(query, { envelope: true, source: false })) {
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
          toEmails: msg.envelope.to?.map((item: { address?: string }) => item.address ?? "").filter(Boolean) ?? [],
          subject: msg.envelope.subject ?? "(no subject)",
          receivedAt: (msg.envelope.date ?? new Date()).toISOString(),
          orgId: context.account.user.organizationId
        }, { jobId: this.buildInboundJobId(context.account.id, messageId) });

        enqueued++;
      }
    } finally {
      lock.release();
    }
    return { scanned, enqueued };
  }

  async markAccountSynced(accountId: string) {
    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() }
    });
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

  private buildInboundJobId(accountId: string, messageId: string) {
    return `imap-inbound:${accountId}:${Buffer.from(messageId).toString("base64url")}`;
  }
}
