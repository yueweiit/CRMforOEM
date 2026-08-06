import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { FollowUpsService } from "../../follow-ups/follow-ups.public";

export type InboundMessageInput = {
  organizationId: string;
  accountId: string;
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  receivedAt: Date;
  bodyText?: string;
  referencesHeader?: string;
};

@Injectable()
export class ImapInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUps: FollowUpsService
  ) {}

  async findThreadForInbound(organizationId: string, fromEmail: string, inReplyTo?: string, referencesHeader?: string) {
    const referencedIds = [inReplyTo, ...(referencesHeader?.match(/<[^>]+>/g) ?? [])].filter(
      (value): value is string => Boolean(value)
    );
    if (referencedIds.length) {
      const message = await this.prisma.emailMessage.findFirst({
        where: {
          messageId: { in: referencedIds },
          thread: { customer: { organizationId } }
        },
        include: { thread: true }
      });
      if (message?.thread) {
        return { thread: message.thread, quoteId: message.quoteId };
      }
    }

    const contact = await this.prisma.contact.findFirst({
      where: { email: fromEmail, customer: { organizationId } },
      include: {
        customer: {
          include: { emailThreads: { take: 1, orderBy: { updatedAt: "desc" } } }
        }
      }
    });

    const thread = contact?.customer.emailThreads[0];
    if (!thread) return null;
    const outbound = await this.prisma.emailMessage.findFirst({
      where: { threadId: thread.id, direction: "OUTBOUND", quoteId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { quoteId: true }
    });
    return { thread, quoteId: outbound?.quoteId ?? null };
  }

  async handleInboundMessage(input: InboundMessageInput) {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id: input.accountId, user: { organizationId: input.organizationId } },
      select: { id: true }
    });
    if (!account) return null;

    const existing = await this.prisma.emailMessage.findUnique({
      where: { emailAccountId_messageId: { emailAccountId: input.accountId, messageId: input.messageId } },
      include: {
        thread: true
      }
    });

    if (existing) {
      const customer = existing.thread
        ? await this.prisma.customer.findUnique({
            where: { id: existing.thread.customerId },
            select: {
              id: true,
              name: true,
              ownerId: true,
              stage: true
            }
          })
        : null;

      return {
        thread: existing.thread,
        customer,
        created: false,
        duplicate: true
      };
    }

    const matched = await this.findThreadForInbound(input.organizationId, input.fromEmail, input.inReplyTo, input.referencesHeader);
    if (!matched) {
      return null;
    }
    const { thread, quoteId } = matched;

    const inboundMessage = await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        quoteId,
        emailAccountId: input.accountId,
        direction: "INBOUND",
        status: "RECEIVED",
        messageId: input.messageId,
        inReplyTo: input.inReplyTo,
        fromEmail: input.fromEmail,
        toEmails: input.toEmails,
        subject: input.subject,
        bodyText: input.bodyText,
        referencesHeader: input.referencesHeader,
        receivedAt: input.receivedAt
      }
    });

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: input.receivedAt }
    });

    const customer = await this.prisma.customer.findUnique({
      where: { id: thread.customerId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        stage: true
      }
    });

    if (
      customer?.stage === "FIRST_EMAIL_SENT" ||
      customer?.stage === "PENDING_SECOND_FOLLOW_UP"
    ) {
      await this.prisma.customer.update({
        where: { id: thread.customerId },
        data: { stage: "REPLIED" as never }
      });
    }

    await this.followUps.handleCustomerReplied(thread.customerId);

    return {
      thread,
      customer,
      inboundMessage,
      quoteId,
      created: true,
      duplicate: false
    };
  }
}
