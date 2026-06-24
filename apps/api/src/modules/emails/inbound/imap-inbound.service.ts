import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { FollowUpsService } from "../../follow-ups/follow-ups.public";

export type InboundMessageInput = {
  accountId: string;
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  receivedAt: Date;
};

@Injectable()
export class ImapInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUps: FollowUpsService
  ) {}

  async findThreadForInbound(fromEmail: string, inReplyTo?: string) {
    if (inReplyTo) {
      const message = await this.prisma.emailMessage.findFirst({
        where: { messageId: inReplyTo },
        include: { thread: true }
      });
      if (message?.thread) {
        return message.thread;
      }
    }

    const contact = await this.prisma.contact.findFirst({
      where: { email: fromEmail },
      include: {
        customer: {
          include: { emailThreads: { take: 1, orderBy: { updatedAt: "desc" } } }
        }
      }
    });

    return contact?.customer.emailThreads[0];
  }

  async handleInboundMessage(input: InboundMessageInput) {
    const existing = await this.prisma.emailMessage.findUnique({
      where: { messageId: input.messageId },
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

    const thread = await this.findThreadForInbound(input.fromEmail, input.inReplyTo);
    if (!thread) {
      return null;
    }

    await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        emailAccountId: input.accountId,
        direction: "INBOUND",
        status: "RECEIVED",
        messageId: input.messageId,
        inReplyTo: input.inReplyTo,
        fromEmail: input.fromEmail,
        toEmails: input.toEmails,
        subject: input.subject,
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
      created: true,
      duplicate: false
    };
  }
}
