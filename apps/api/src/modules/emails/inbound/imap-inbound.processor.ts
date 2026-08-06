import { Processor, WorkerHost } from "@nestjs/bullmq";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Job } from "bullmq";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { SSE_EVENTS, InboundMailReceivedPayload } from "../../../common/events/event-types";
import { IMAP_INBOUND_QUEUE } from "./imap-inbound.constants";
import { ImapInboundService } from "./imap-inbound.service";
import { parseInboundMime } from "./email-mime-parser";
import { QuoteReplyAssessmentService } from "./quote-reply-assessment.service";

type InboundJob = {
  accountId: string;
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  receivedAt: string;
  orgId: string;
  sourceBase64?: string;
};

@Processor(IMAP_INBOUND_QUEUE)
export class ImapInboundProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundService: ImapInboundService,
    private readonly quoteReplyAssessments: QuoteReplyAssessmentService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<InboundJob>) {
    const { accountId, messageId, inReplyTo, fromEmail, toEmails, subject, receivedAt, orgId, sourceBase64 } = job.data;
    const parsed = sourceBase64
      ? await parseInboundMime(Buffer.from(sourceBase64, "base64"))
      : { bodyText: "", classificationText: "", referencesHeader: undefined };

    const account = await this.prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { userId: true }
    });

    const result = await this.inboundService.handleInboundMessage({
      accountId,
      organizationId: orgId,
      messageId,
      inReplyTo,
      fromEmail,
      toEmails,
      subject,
      receivedAt: new Date(receivedAt),
      bodyText: parsed.bodyText,
      referencesHeader: parsed.referencesHeader
    });
    if (!result || !result.created || !result.thread) return;

    const { customer, thread } = result;

    if (result.inboundMessage && result.quoteId && customer) {
      await this.quoteReplyAssessments.assess({
        organizationId: orgId,
        customerId: customer.id,
        customerOwnerId: customer.ownerId,
        quoteId: result.quoteId,
        inboundEmailMessageId: result.inboundMessage.id,
        replyText: parsed.classificationText,
        accountUserId: account?.userId
      });
    }

    const targetUserIds = Array.from(
      new Set(
        [customer?.ownerId, account?.userId].filter((value): value is string => Boolean(value))
      )
    );

    this.eventEmitter.emit(SSE_EVENTS.INBOUND_MAIL_RECEIVED, {
      orgId,
      targetUserIds,
      threadId: thread.id,
      customerId: thread.customerId,
      customerName: customer?.name ?? "",
      fromEmail,
      subject
    } satisfies InboundMailReceivedPayload);
  }
}
