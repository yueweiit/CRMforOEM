import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AiGenerationType } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { SSE_EVENTS, QuoteReplyAssessedPayload } from "../../../common/events/event-types";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiGenerationService, AiProviderService } from "../../ai/ai.public";
import { QuoteWorkflowService } from "../../commercial/commercial.public";
import type { ResolveQuoteReplyAssessmentDto } from "../dto/resolve-quote-reply-assessment.dto";
import { buildQuoteReplyClassificationPrompt, parseQuoteReplyClassification } from "./quote-reply-classifier";

const QUOTE_REPLY_PROMPT_VERSION = "quote-reply-v1";
const SUGGESTION_CONFIDENCE_THRESHOLD = 0.8;

@Injectable()
export class QuoteReplyAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly aiGeneration: AiGenerationService,
    private readonly quoteWorkflow: QuoteWorkflowService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async assess(input: {
    organizationId: string;
    customerId: string;
    customerOwnerId?: string | null;
    accountUserId?: string;
    quoteId: string;
    inboundEmailMessageId: string;
    replyText: string;
  }) {
    const existing = await this.prisma.quoteReplyAssessment.findUnique({
      where: { inboundEmailMessageId: input.inboundEmailMessageId }
    });
    if (existing) return existing;

    const quote = await this.prisma.quote.findFirst({
      where: {
        id: input.quoteId,
        status: "SENT",
        customer: { organizationId: input.organizationId }
      },
      include: { customer: { select: { id: true, name: true } } }
    });
    if (!quote || !input.replyText.trim()) return null;

    const prompt = buildQuoteReplyClassificationPrompt({
      quoteNo: quote.quoteNo,
      productName: quote.productName,
      currency: quote.currency,
      amount: quote.amount.toString(),
      replyText: input.replyText
    });
    const run = await this.aiGeneration.createRun({
      organizationId: input.organizationId,
      customerId: input.customerId,
      type: AiGenerationType.QuoteReplyClassification,
      model: this.aiProvider.model,
      promptVersion: QUOTE_REPLY_PROMPT_VERSION,
      rawInput: { quoteId: quote.id, inboundEmailMessageId: input.inboundEmailMessageId, prompt },
      createdById: input.accountUserId
    });

    const startedAt = Date.now();
    let classification;
    try {
      const completion = await this.aiProvider.complete({ ...prompt, jsonMode: true });
      classification = parseQuoteReplyClassification(completion.content, input.replyText);
      await this.aiGeneration.markSucceeded(run.id, completion.raw, completion.tokenUsage, Date.now() - startedAt);
      await this.aiGeneration.addRawAiVersion(run.id, completion.content, classification);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quote reply classification failed";
      await this.aiGeneration.markFailed(run.id, message);
      classification = { intent: "UNCERTAIN" as const, confidence: 0, evidence: "", reason: message };
    }

    const assessment = await this.prisma.quoteReplyAssessment.create({
      data: {
        organizationId: input.organizationId,
        quoteId: quote.id,
        inboundEmailMessageId: input.inboundEmailMessageId,
        aiGenerationRunId: run.id,
        intent: classification.intent,
        confidence: classification.confidence,
        evidence: classification.evidence,
        reason: classification.reason
      }
    });

    if ((assessment.intent === "ACCEPT" || assessment.intent === "REJECT") && assessment.confidence >= SUGGESTION_CONFIDENCE_THRESHOLD) {
      const targetUserIds = Array.from(new Set([input.customerOwnerId, input.accountUserId].filter((id): id is string => Boolean(id))));
      this.eventEmitter.emit(SSE_EVENTS.QUOTE_REPLY_ASSESSED, {
        orgId: input.organizationId,
        targetUserIds,
        assessmentId: assessment.id,
        quoteId: quote.id,
        customerId: quote.customer.id,
        customerName: quote.customer.name,
        quoteNo: quote.quoteNo,
        intent: assessment.intent,
        confidence: assessment.confidence
      } satisfies QuoteReplyAssessedPayload);
    }
    return assessment;
  }

  async list(user: RequestUser, filters: { customerId?: string; status?: string } = {}) {
    const status = ["PENDING", "CONFIRMED", "DISMISSED", "STALE"].includes(filters.status ?? "")
      ? filters.status
      : "PENDING";
    return this.prisma.quoteReplyAssessment.findMany({
      where: {
        organizationId: user.organizationId,
        status: status as never,
        quote: {
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          customer: buildCustomerDataScopeWhere(user)
        }
      },
      include: {
        quote: { select: { id: true, quoteNo: true, productName: true, currency: true, amount: true, status: true, customerId: true } },
        inboundEmailMessage: { select: { id: true, fromEmail: true, subject: true, receivedAt: true, bodyText: true } },
        reviewedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async confirm(user: RequestUser, id: string, dto: ResolveQuoteReplyAssessmentDto) {
    const assessment = await this.findAccessiblePending(user, id);
    const expected = assessment.intent === "ACCEPT" ? "ACCEPTED" : assessment.intent === "REJECT" ? "CUSTOMER_REJECTED" : null;
    if (!expected || dto.outcome !== expected) {
      throw new BadRequestException("Confirmation outcome must match the AI suggestion");
    }

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: assessment.quoteId } });
      if (!quote) throw new NotFoundException("Quote not found");
      const updatedQuote = await this.quoteWorkflow.resolveCustomerReply(tx, {
        quote,
        outcome: dto.outcome,
        actor: { id: user.id, name: user.name ?? user.email ?? user.id },
        comment: `操作员确认客户回复判断：${assessment.evidence || assessment.reason}`
      });
      const changed = await tx.quoteReplyAssessment.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "CONFIRMED", reviewedById: user.id, reviewedAt: new Date() }
      });
      if (changed.count !== 1) throw new BadRequestException("Reply suggestion has already been handled");
      return { assessmentId: id, assessmentStatus: "CONFIRMED", quote: updatedQuote };
    });
  }

  async dismiss(user: RequestUser, id: string) {
    await this.findAccessiblePending(user, id);
    const changed = await this.prisma.quoteReplyAssessment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "DISMISSED", reviewedById: user.id, reviewedAt: new Date() }
    });
    if (changed.count !== 1) throw new BadRequestException("Reply suggestion has already been handled");
    return { assessmentId: id, assessmentStatus: "DISMISSED" };
  }

  private async findAccessiblePending(user: RequestUser, id: string) {
    const assessment = await this.prisma.quoteReplyAssessment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        status: "PENDING",
        quote: { customer: buildCustomerDataScopeWhere(user) }
      }
    });
    if (!assessment) throw new NotFoundException("Pending quote reply suggestion not found");
    return assessment;
  }
}
