import { Processor, WorkerHost } from "@nestjs/bullmq";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { SSE_EVENTS, InboundMailReceivedPayload } from "../../common/events/event-types";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";
import { ImapInboundService } from "./imap-inbound.service";

type InboundJob = {
  accountId: string;
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  receivedAt: string;
  orgId: string;
};

@Processor(IMAP_INBOUND_QUEUE)
export class ImapInboundProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundService: ImapInboundService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<InboundJob>) {
    const { accountId, messageId, inReplyTo, fromEmail, toEmails, subject, receivedAt, orgId } = job.data;

    const account = await this.prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { userId: true }
    });

    const result = await this.inboundService.handleInboundMessage({
      accountId,
      messageId,
      inReplyTo,
      fromEmail,
      toEmails,
      subject,
      receivedAt: new Date(receivedAt)
    });
    if (!result) return;

    const { customer } = result;

    const targetUserIds = Array.from(
      new Set(
        [customer?.ownerId, account?.userId].filter((value): value is string => Boolean(value))
      )
    );

    this.eventEmitter.emit(SSE_EVENTS.INBOUND_MAIL_RECEIVED, {
      orgId,
      targetUserIds,
      threadId: result.thread.id,
      customerId: result.thread.customerId,
      customerName: customer?.name ?? "",
      fromEmail,
      subject
    } satisfies InboundMailReceivedPayload);
  }
}
