import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type QuoteLifecycleRecord = {
  id: string;
  status: string;
  approvalStatus: string;
  sentAt?: Date | null;
  [key: string]: unknown;
};

type WorkflowActor = {
  id: string;
  name: string;
};

@Injectable()
export class QuoteWorkflowService {
  assertSendable(quote: Pick<QuoteLifecycleRecord, "status" | "approvalStatus">) {
    if (quote.status !== "DRAFT" && quote.status !== "SENT") {
      throw new BadRequestException("Only draft or previously sent quotes can be sent");
    }
    if (quote.approvalStatus !== "APPROVED") {
      throw new BadRequestException("Only approved quotes can be sent");
    }
  }

  assertCustomerReplyResolvable(quote: Pick<QuoteLifecycleRecord, "status" | "approvalStatus">) {
    if (quote.status !== "SENT") {
      throw new BadRequestException("Only sent quotes can be accepted or rejected by customer");
    }
    if (quote.approvalStatus !== "APPROVED") {
      throw new BadRequestException("Only approved quotes can resolve a customer reply");
    }
  }

  async markSent(
    tx: Prisma.TransactionClient,
    input: {
      quote: QuoteLifecycleRecord;
      actor: WorkflowActor;
      sentAt?: Date;
      comment?: string;
    }
  ) {
    this.assertSendable(input.quote);
    const sentAt = input.sentAt ?? new Date();
    const claimed = await tx.quote.updateMany({
      where: {
        id: input.quote.id,
        status: { in: ["DRAFT", "SENT"] as never },
        approvalStatus: "APPROVED" as never
      },
      data: {
        status: "SENT" as never,
        sentAt: input.quote.sentAt ?? sentAt
      }
    });
    if (claimed.count !== 1) {
      throw new BadRequestException("Quote is no longer sendable");
    }

    const updated = await tx.quote.findUnique({ where: { id: input.quote.id } });
    if (!updated) throw new NotFoundException("Quote not found");
    await tx.quoteHistory.create({
      data: {
        quoteId: input.quote.id,
        action: "SENT" as never,
        before: this.snapshot(input.quote),
        after: this.snapshot(updated),
        actorId: input.actor.id,
        actorName: input.actor.name,
        comment: input.comment ?? "报价邮件已发送"
      }
    });
    return updated;
  }

  async resolveCustomerReply(
    tx: Prisma.TransactionClient,
    input: {
      quote: QuoteLifecycleRecord;
      outcome: "ACCEPTED" | "CUSTOMER_REJECTED";
      actor: WorkflowActor;
      comment?: string;
    }
  ) {
    this.assertCustomerReplyResolvable(input.quote);
    const claimed = await tx.quote.updateMany({
      where: { id: input.quote.id, status: "SENT" as never, approvalStatus: "APPROVED" as never },
      data: { status: input.outcome as never }
    });
    if (claimed.count !== 1) {
      throw new BadRequestException("Quote reply has already been resolved");
    }

    const updated = await tx.quote.findUnique({ where: { id: input.quote.id } });
    if (!updated) throw new NotFoundException("Quote not found");
    await tx.quoteHistory.create({
      data: {
        quoteId: input.quote.id,
        action: input.outcome as never,
        before: this.snapshot(input.quote),
        after: this.snapshot(updated),
        actorId: input.actor.id,
        actorName: input.actor.name,
        comment: input.comment ?? (input.outcome === "ACCEPTED" ? "客户已接受报价" : "客户已拒绝报价")
      }
    });
    return updated;
  }

  private snapshot(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
