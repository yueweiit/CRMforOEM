import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CustomerStageService } from "../customers/customers.public";
import { CreateSampleFeeDto } from "./dto/create-sample-fee.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { QuoteReviewDto } from "./dto/quote-review.dto";
import { RecordSampleReturnDto } from "./dto/record-sample-return.dto";
import { UpdateQuoteDto } from "./dto/update-quote.dto";
import { UpdateSampleRequestDto } from "./dto/update-sample-request.dto";

@Injectable()
export class CommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerStageService: CustomerStageService
  ) {}

  listQuotes(user: RequestUser, customerId?: string) {
    return this.prisma.quote.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: { customer: { select: { id: true, name: true, stage: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async createQuote(user: RequestUser, dto: CreateQuoteDto) {
    await this.ensureCustomerVisible(user, dto.customerId);
    const pricing = this.calculateQuotePricing({
      materialCost: dto.materialCost,
      processingCost: dto.processingCost,
      taxCost: dto.taxCost,
      shippingCost: dto.shippingCost,
      discountAmount: dto.discountAmount,
      quantity: dto.quantity,
      moq: dto.moq
    });
    const quote = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          quoteNo: dto.quoteNo,
          productName: dto.productName,
          specification: dto.specification ?? null,
          moq: pricing.moq,
          quantity: pricing.quantity,
          unitPrice: new Prisma.Decimal(pricing.unitPrice.toFixed(2)),
          currency: dto.currency,
          amount: new Prisma.Decimal(pricing.total.toFixed(2)),
          materialCost: new Prisma.Decimal(pricing.materialCost.toFixed(2)),
          processingCost: new Prisma.Decimal(pricing.processingCost.toFixed(2)),
          taxCost: new Prisma.Decimal(pricing.taxCost.toFixed(2)),
          shippingCost: new Prisma.Decimal(pricing.shippingCost.toFixed(2)),
          discountAmount: new Prisma.Decimal(pricing.discountAmount.toFixed(2)),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          fileAssetId: dto.fileAssetId,
          notes: dto.notes,
          status: "DRAFT" as never,
          approvalStatus: "DRAFT" as never
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId: created.id,
          action: "CREATED" as never,
          after: this.buildQuoteSnapshot(created) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: "已创建报价"
        }
      });
      return created;
    });
    await this.customerStageService.advanceCustomerStage({
      customerId: dto.customerId,
      toStage: CustomerStage.Quoting,
      changedById: user.id,
      reason: "已创建报价",
      expectedFromStages: [
        CustomerStage.Replied,
        CustomerStage.RequirementConfirming,
        CustomerStage.Quoting
      ]
    });
    return quote;
  }

  getQuoteHistory(user: RequestUser, quoteId: string) {
    return this.prisma.quoteHistory.findMany({
      where: {
        quoteId,
        quote: { customer: buildCustomerDataScopeWhere(user) }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async getQuoteExport(user: RequestUser, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) },
      include: { customer: { select: { id: true, name: true, stage: true } } }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    return {
      csv: this.buildQuoteCsv(quote),
      fileName: `quote-${quote.quoteNo}.csv`
    };
  }

  async getQuotesExport(user: RequestUser, customerId?: string) {
    const quotes = await this.prisma.quote.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: { customer: { select: { id: true, name: true, stage: true } } },
      orderBy: { createdAt: "desc" }
    });
    return {
      csv: this.buildQuotesCsv(quotes),
      fileName: customerId ? `quotes-${customerId}.csv` : `quotes.csv`
    };
  }

  listSamples(user: RequestUser, customerId?: string) {
    return this.prisma.sampleRequest.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        customer: { select: { id: true, name: true, stage: true } },
        quote: { select: { id: true, quoteNo: true, productName: true, status: true, approvalStatus: true, amount: true, currency: true } },
        fees: { orderBy: { incurredAt: "desc" } },
        returnRecords: { orderBy: { recordedAt: "desc" } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createSample(user: RequestUser, dto: CreateSampleRequestDto) {
    await this.ensureCustomerVisible(user, dto.customerId);
    const quote = dto.quoteId ? await this.ensureQuoteVisible(user, dto.quoteId, dto.customerId) : null;
    const actorName = await this.resolveActorName(user);
    const sample = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sampleRequest.create({
        data: {
          customerId: dto.customerId,
          quoteId: quote?.id ?? null,
          productSummary: dto.productSummary,
          fileAssetIds: dto.fileAssetIds ?? [],
          carrier: this.normalizeOptionalText(dto.carrier),
          trackingNo: this.normalizeOptionalText(dto.trackingNo),
          shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : undefined,
          status: "APPROVING" as never
        }
      });
      await tx.sampleHistory.create({
        data: {
          sampleRequestId: created.id,
          action: "CREATED" as never,
          after: this.buildSampleSnapshot(created, quote) as never,
          actorId: user.id,
          actorName,
          comment: "已创建样品申请"
        }
      });
      if (quote) {
        await tx.sampleHistory.create({
          data: {
            sampleRequestId: created.id,
            action: "QUOTE_LINKED" as never,
            after: { quoteId: quote.id, quoteNo: quote.quoteNo, productName: quote.productName } as never,
            actorId: user.id,
            actorName,
            comment: `已关联报价 ${quote.quoteNo}`
          }
        });
      }
      return created;
    });
    await this.customerStageService.advanceCustomerStage({
      customerId: dto.customerId,
      toStage: CustomerStage.Sampling,
      changedById: user.id,
      reason: "已创建样品申请",
      expectedFromStages: [
        CustomerStage.Quoting,
        CustomerStage.Sampling
      ]
    });
    return sample;
  }

  async updateQuote(user: RequestUser, quoteId: string, dto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.status === "VOIDED") {
      throw new BadRequestException("Voided quote cannot be edited");
    }
    const mergedPricing = this.calculateQuotePricing({
      materialCost: dto.materialCost ?? Number(quote.materialCost),
      processingCost: dto.processingCost ?? Number(quote.processingCost),
      taxCost: dto.taxCost ?? Number(quote.taxCost),
      shippingCost: dto.shippingCost ?? Number(quote.shippingCost),
      discountAmount: dto.discountAmount ?? Number(quote.discountAmount),
      quantity: dto.quantity ?? quote.quantity,
      moq: dto.moq ?? quote.moq
    });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          ...(dto.quoteNo !== undefined ? { quoteNo: dto.quoteNo } : {}),
          ...(dto.productName !== undefined ? { productName: dto.productName } : {}),
          ...(dto.specification !== undefined ? { specification: dto.specification } : {}),
          ...(dto.moq !== undefined ? { moq: mergedPricing.moq } : {}),
          ...(dto.quantity !== undefined ? { quantity: mergedPricing.quantity } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          unitPrice: new Prisma.Decimal(mergedPricing.unitPrice.toFixed(2)),
          amount: new Prisma.Decimal(mergedPricing.total.toFixed(2)),
          materialCost: new Prisma.Decimal(mergedPricing.materialCost.toFixed(2)),
          processingCost: new Prisma.Decimal(mergedPricing.processingCost.toFixed(2)),
          taxCost: new Prisma.Decimal(mergedPricing.taxCost.toFixed(2)),
          shippingCost: new Prisma.Decimal(mergedPricing.shippingCost.toFixed(2)),
          discountAmount: new Prisma.Decimal(mergedPricing.discountAmount.toFixed(2)),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null } : {}),
          approvalStatus: "DRAFT" as never,
          approvalComment: null,
          approvalSubmittedAt: null,
          approvalSubmittedById: null,
          approvalReviewedAt: null,
          approvalReviewedById: null
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "UPDATED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: "已更新报价"
        }
      });
      return updated;
    });
  }

  async deleteQuote(user: RequestUser, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.status === "VOIDED") {
      return quote;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: "VOIDED" as never
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "VOIDED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: "已作废报价"
        }
      });
      return updated;
    });
  }

  async submitQuoteReview(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.status === "VOIDED") {
      throw new BadRequestException("Voided quote cannot be submitted for review");
    }
    if (quote.approvalStatus !== "DRAFT" && quote.approvalStatus !== "REJECTED") {
      throw new BadRequestException("Only draft or rejected quotes can be submitted for review");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "PENDING_APPROVAL" as never,
          approvalSubmittedAt: new Date(),
          approvalSubmittedById: user.id,
          approvalComment: dto.comment ?? null
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "SUBMITTED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: dto.comment ?? "已提交报价审批"
        }
      });
      return updated;
    });
  }

  async approveQuote(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.approvalStatus !== "PENDING_APPROVAL") {
      throw new BadRequestException("Only pending review quotes can be approved");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "APPROVED" as never,
          approvalReviewedAt: new Date(),
          approvalReviewedById: user.id,
          approvalComment: dto.comment ?? quote.approvalComment
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "APPROVED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: dto.comment ?? "已通过报价审批"
        }
      });
      return updated;
    });
  }

  async rejectQuote(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.approvalStatus !== "PENDING_APPROVAL") {
      throw new BadRequestException("Only pending review quotes can be rejected");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "REJECTED" as never,
          approvalReviewedAt: new Date(),
          approvalReviewedById: user.id,
          approvalComment: dto.comment ?? quote.approvalComment
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "REJECTED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName: user.name ?? user.email ?? user.id,
          comment: dto.comment ?? "已驳回报价审批"
        }
      });
      return updated;
    });
  }

  async updateSample(user: RequestUser, sampleId: string, dto: UpdateSampleRequestDto) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleId, customer: buildCustomerDataScopeWhere(user) },
      include: { quote: true, fees: true, returnRecords: true }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    this.ensureSampleEditable(sample.status);
    const actorName = await this.resolveActorName(user);
    const targetStatus = dto.status ? (dto.status as never) : sample.status;
    this.assertSampleTransition(sample.status, targetStatus as string);
    const nextCarrier = dto.carrier !== undefined ? this.normalizeOptionalText(dto.carrier) : sample.carrier;
    const nextTrackingNo = dto.trackingNo !== undefined ? this.normalizeOptionalText(dto.trackingNo) : sample.trackingNo;
    this.assertSampleShipmentFields(targetStatus as string, nextCarrier, nextTrackingNo);
    const targetQuote = dto.quoteId !== undefined
      ? (dto.quoteId ? await this.ensureQuoteVisible(user, dto.quoteId, sample.customerId) : null)
      : sample.quote;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRequest.update({
        where: { id: sampleId },
        data: {
          ...(dto.productSummary !== undefined ? { productSummary: dto.productSummary } : {}),
          ...(dto.quoteId !== undefined ? { quoteId: dto.quoteId || null } : {}),
          ...(dto.fileAssetIds !== undefined ? { fileAssetIds: dto.fileAssetIds } : {}),
          ...(dto.carrier !== undefined ? { carrier: nextCarrier } : {}),
          ...(dto.trackingNo !== undefined ? { trackingNo: nextTrackingNo } : {}),
          ...(dto.shippedAt !== undefined ? { shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : null } : {}),
          ...(dto.deliveredAt !== undefined ? { deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : null } : {}),
          ...(dto.feedback !== undefined ? { feedback: dto.feedback } : {}),
          ...(dto.status !== undefined ? { status: dto.status as never } : {}),
          ...(dto.status === "PREPARING" ? { approvedAt: sample.approvedAt ?? new Date() } : {}),
          ...(dto.status === "SHIPPED" ? { shippedAt: sample.shippedAt ?? new Date() } : {}),
          ...(dto.status === "DELIVERED" ? { deliveredAt: sample.deliveredAt ?? new Date() } : {}),
          ...(dto.status === "RETURNED" ? { returnedAt: sample.returnedAt ?? new Date() } : {}),
          ...(dto.status === "STORED" ? { storedAt: sample.storedAt ?? new Date() } : {}),
          ...(dto.status === "VOIDED" ? { voidedAt: sample.voidedAt ?? new Date() } : {}),
          ...(dto.status === "CLOSED" ? { closedAt: sample.closedAt ?? new Date() } : {})
        }
      });
      if (dto.quoteId !== undefined && dto.quoteId !== sample.quoteId) {
        await tx.sampleHistory.create({
          data: {
            sampleRequestId: sampleId,
            action: "QUOTE_LINKED" as never,
            ...(sample.quote
              ? {
                  before: {
                    quoteId: sample.quote.id,
                    quoteNo: sample.quote.quoteNo,
                    productName: sample.quote.productName
                  }
                }
              : {}),
            ...(updated.quoteId
              ? {
                  after: {
                    quoteId: updated.quoteId,
                    quoteNo: targetQuote?.quoteNo,
                    productName: targetQuote?.productName
                  }
                }
              : {}),
            actorId: user.id,
            actorName,
            comment: dto.quoteId ? `已关联报价 ${targetQuote?.quoteNo ?? dto.quoteId}` : "已取消关联报价"
          }
        });
      }
      if (dto.status !== undefined && dto.status !== sample.status) {
        await tx.sampleHistory.create({
          data: {
            sampleRequestId: sampleId,
            action: this.mapSampleHistoryAction(dto.status as string) as never,
            before: this.buildSampleSnapshot(sample) as never,
            after: this.buildSampleSnapshot(updated, targetQuote ?? sample.quote ?? null) as never,
            actorId: user.id,
            actorName,
          comment: `样品状态变更为 ${this.labelSampleStatus(dto.status as string)}`
          }
        });
      } else {
        await tx.sampleHistory.create({
          data: {
            sampleRequestId: sampleId,
            action: "UPDATED" as never,
            before: this.buildSampleSnapshot(sample) as never,
            after: this.buildSampleSnapshot(updated, targetQuote ?? sample.quote ?? null) as never,
            actorId: user.id,
            actorName,
            comment: "已更新样品信息"
          }
        });
      }
      return updated;
    });
  }

  async recordSampleFee(user: RequestUser, sampleRequestId: string, dto: CreateSampleFeeDto) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleRequestId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    this.ensureSampleNotVoided(sample.status);
    const actorName = await this.resolveActorName(user);
    const fee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sampleFee.create({
        data: {
          sampleRequestId,
          feeType: dto.feeType as never,
          amount: new Prisma.Decimal(this.normalizeMoney(dto.amount).toFixed(2)),
          currency: dto.currency,
          note: dto.note ?? null,
          incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(),
          createdById: user.id
        }
      });
      await tx.sampleHistory.create({
        data: {
          sampleRequestId,
          action: "FEE_ADDED" as never,
          after: {
            id: created.id,
            feeType: created.feeType,
            amount: created.amount.toString(),
            currency: created.currency,
            note: created.note,
            incurredAt: created.incurredAt.toISOString()
          } as never,
          actorId: user.id,
          actorName,
          comment: `已记录样品费用 ${created.feeType}`
        }
      });
      return created;
    });
    return fee;
  }

  async recordSampleReturn(user: RequestUser, sampleRequestId: string, dto: RecordSampleReturnDto) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleRequestId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    this.ensureSampleReturnable(sample.status);
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const now = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
      const updated = await tx.sampleRequest.update({
        where: { id: sampleRequestId },
        data: {
          status: dto.returnType as never,
          ...(dto.returnType === "RETURNED" ? { returnedAt: now } : { storedAt: now }),
          closedAt: sample.closedAt ?? (dto.returnType === "STORED" ? now : sample.closedAt)
        }
      });
      const created = await tx.sampleReturnRecord.create({
        data: {
          sampleRequestId,
          returnType: dto.returnType as never,
          receiverName: dto.receiverName ?? null,
          destination: dto.destination ?? null,
          note: dto.note ?? null,
          recordedById: user.id,
          recordedAt: now
        }
      });
      await tx.sampleHistory.create({
        data: {
          sampleRequestId,
          action: dto.returnType as never,
          before: this.buildSampleSnapshot(sample) as never,
          after: this.buildSampleSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: dto.note ?? (dto.returnType === "RETURNED" ? "已记录样品归还" : "已记录样品留样")
        }
      });
      await tx.sampleHistory.create({
        data: {
          sampleRequestId,
          action: "STATUS_CHANGED" as never,
          after: {
            id: created.id,
            returnType: created.returnType,
            recordedAt: created.recordedAt.toISOString(),
            receiverName: created.receiverName,
            destination: created.destination,
            note: created.note
          } as never,
          actorId: user.id,
          actorName,
          comment: `样品${dto.returnType === "RETURNED" ? "已归还" : "已留样"}`
        }
      });
      return updated;
    });
  }

  getSampleHistory(user: RequestUser, sampleId: string) {
    return this.prisma.sampleHistory.findMany({
      where: {
        sampleRequestId: sampleId,
        sampleRequest: { customer: buildCustomerDataScopeWhere(user) }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async deleteSample(user: RequestUser, sampleId: string) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    this.ensureSampleEditable(sample.status);
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRequest.update({
        where: { id: sampleId },
        data: {
          status: "VOIDED" as never,
          voidedAt: sample.voidedAt ?? new Date()
        }
      });
      await tx.sampleHistory.create({
        data: {
          sampleRequestId: sampleId,
          action: "VOIDED" as never,
          before: this.buildSampleSnapshot(sample) as never,
          after: this.buildSampleSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: "已作废样品"
        }
      });
      return { deleted: true };
    });
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private async ensureQuoteVisible(user: RequestUser, quoteId: string, customerId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customerId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    return quote;
  }

  private async resolveActorName(user: RequestUser) {
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true }
    });
    return actor?.name ?? actor?.email ?? user.name ?? user.email ?? user.id;
  }

  private ensureSampleEditable(status: string) {
    if (status === "VOIDED" || status === "CLOSED") {
      throw new BadRequestException("Void or closed sample cannot be edited");
    }
  }

  private ensureSampleNotVoided(status: string) {
    if (status === "VOIDED" || status === "CLOSED") {
      throw new BadRequestException("Closed or voided sample cannot be changed");
    }
  }

  private ensureSampleReturnable(status: string) {
    if (status === "VOIDED" || status === "CLOSED") {
      throw new BadRequestException("Voided or closed sample cannot be returned");
    }
    if (!["SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED"].includes(status)) {
      throw new BadRequestException("Only shipped or delivered samples can be returned or stored");
    }
  }

  private assertSampleTransition(fromStatus: string, toStatus: string) {
    if (fromStatus === toStatus) {
      return;
    }
    const allowedTransitions: Record<string, string[]> = {
      REQUESTED: ["APPROVING", "VOIDED"],
      APPROVING: ["PREPARING", "VOIDED"],
      PREPARING: ["SHIPPED", "VOIDED"],
      SHIPPED: ["DELIVERED", "VOIDED"],
      DELIVERED: ["FEEDBACK_RECEIVED", "RETURNED", "STORED", "CLOSED", "VOIDED"],
      FEEDBACK_RECEIVED: ["RETURNED", "STORED", "CLOSED", "VOIDED"],
      RETURNED: ["STORED", "CLOSED", "VOIDED"],
      STORED: ["CLOSED", "VOIDED"],
      CLOSED: [],
      VOIDED: []
    };
    const allowed = allowedTransitions[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Sample status cannot transition from ${fromStatus} to ${toStatus}`);
    }
  }

  private assertSampleShipmentFields(status: string, carrier: string | null, trackingNo: string | null) {
    if (status !== "SHIPPED") {
      return;
    }
    if (!carrier || !trackingNo) {
      throw new BadRequestException("Shipping a sample requires both carrier and tracking number");
    }
  }

  private mapSampleHistoryAction(status: string) {
    const actionMap: Record<string, string> = {
      APPROVING: "STATUS_CHANGED",
      PREPARING: "STATUS_CHANGED",
      SHIPPED: "STATUS_CHANGED",
      DELIVERED: "STATUS_CHANGED",
      FEEDBACK_RECEIVED: "STATUS_CHANGED",
      RETURNED: "RETURNED",
      STORED: "STORED",
      VOIDED: "VOIDED",
      CLOSED: "CLOSED"
    };
    return actionMap[status] ?? "STATUS_CHANGED";
  }

  private labelSampleStatus(status: string) {
    const labels: Record<string, string> = {
      REQUESTED: "待申请",
      APPROVING: "待审核",
      PREPARING: "打样中",
      SHIPPED: "已寄出",
      DELIVERED: "已签收",
      FEEDBACK_RECEIVED: "已反馈",
      RETURNED: "已归还",
      STORED: "已留样",
      VOIDED: "已作废",
      CLOSED: "已关闭"
    };
    return labels[status] ?? status;
  }

  private buildSampleSnapshot(sample: {
    id: string;
    customerId: string;
    quoteId: string | null;
    status: string;
    productSummary: string;
    fileAssetIds: string[];
    trackingNo: string | null;
    carrier: string | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    approvedAt: Date | null;
    returnedAt: Date | null;
    storedAt: Date | null;
    voidedAt: Date | null;
    closedAt: Date | null;
    feedback: string | null;
    createdAt: Date;
    updatedAt: Date;
  }, quote?: { id: string; quoteNo: string; productName: string } | null) {
    return {
      id: sample.id,
      customerId: sample.customerId,
      quoteId: sample.quoteId,
      quote: quote
        ? {
            id: quote.id,
            quoteNo: quote.quoteNo,
            productName: quote.productName
          }
        : null,
      status: sample.status,
      productSummary: sample.productSummary,
      fileAssetIds: sample.fileAssetIds ?? [],
      trackingNo: sample.trackingNo,
      carrier: sample.carrier,
      shippedAt: sample.shippedAt ? sample.shippedAt.toISOString() : null,
      deliveredAt: sample.deliveredAt ? sample.deliveredAt.toISOString() : null,
      approvedAt: sample.approvedAt ? sample.approvedAt.toISOString() : null,
      returnedAt: sample.returnedAt ? sample.returnedAt.toISOString() : null,
      storedAt: sample.storedAt ? sample.storedAt.toISOString() : null,
      voidedAt: sample.voidedAt ? sample.voidedAt.toISOString() : null,
      closedAt: sample.closedAt ? sample.closedAt.toISOString() : null,
      feedback: sample.feedback,
      createdAt: sample.createdAt.toISOString(),
      updatedAt: sample.updatedAt.toISOString()
    };
  }

  private buildQuoteSnapshot(quote: {
    id: string;
    customerId: string;
    quoteNo: string;
    productName: string;
    specification: string | null;
    moq: number;
    quantity: number;
    unitPrice: { toString(): string } | string;
    status: string;
    approvalStatus: string;
    currency: string;
    amount: { toString(): string } | string;
    materialCost: { toString(): string } | string;
    processingCost: { toString(): string } | string;
    taxCost: { toString(): string } | string;
    shippingCost: { toString(): string } | string;
    discountAmount: { toString(): string } | string;
    validUntil: Date | null;
    fileAssetId: string | null;
    notes: string | null;
    approvalComment: string | null;
    approvalSubmittedAt: Date | null;
    approvalSubmittedById: string | null;
    approvalReviewedAt: Date | null;
    approvalReviewedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: quote.id,
      customerId: quote.customerId,
      quoteNo: quote.quoteNo,
      productName: quote.productName,
      specification: quote.specification,
      moq: quote.moq,
      quantity: quote.quantity,
      unitPrice: quote.unitPrice.toString(),
      status: quote.status,
      approvalStatus: quote.approvalStatus,
      currency: quote.currency,
      amount: quote.amount.toString(),
      materialCost: quote.materialCost.toString(),
      processingCost: quote.processingCost.toString(),
      taxCost: quote.taxCost.toString(),
      shippingCost: quote.shippingCost.toString(),
      discountAmount: quote.discountAmount.toString(),
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
      fileAssetId: quote.fileAssetId,
      notes: quote.notes,
      approvalComment: quote.approvalComment,
      approvalSubmittedAt: quote.approvalSubmittedAt ? quote.approvalSubmittedAt.toISOString() : null,
      approvalSubmittedById: quote.approvalSubmittedById,
      approvalReviewedAt: quote.approvalReviewedAt ? quote.approvalReviewedAt.toISOString() : null,
      approvalReviewedById: quote.approvalReviewedById,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    };
  }

  private calculateQuotePricing(input: {
    materialCost?: number;
    processingCost?: number;
    taxCost?: number;
    shippingCost?: number;
    discountAmount?: number;
    quantity?: number;
    moq?: number;
  }) {
    const materialCost = this.normalizeMoney(input.materialCost);
    const processingCost = this.normalizeMoney(input.processingCost);
    const taxCost = this.normalizeMoney(input.taxCost);
    const shippingCost = this.normalizeMoney(input.shippingCost);
    const discountAmount = this.normalizeMoney(input.discountAmount);
    const quantity = this.normalizeInteger(input.quantity, "quantity");
    const moq = this.normalizeInteger(input.moq ?? 1, "moq");
    if (quantity < moq) {
      throw new BadRequestException(`Quote quantity must be greater than or equal to MOQ (${moq})`);
    }
    const total = this.roundMoney(materialCost + processingCost + taxCost + shippingCost - discountAmount);
    const unitPrice = this.roundMoney(total / quantity);
    return { materialCost, processingCost, taxCost, shippingCost, discountAmount, total, quantity, moq, unitPrice };
  }

  private normalizeOptionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeMoney(value?: number) {
    const normalized = Number(value ?? 0);
    if (!Number.isFinite(normalized)) {
      throw new BadRequestException("Quote cost values must be valid numbers");
    }
    return this.roundMoney(normalized);
  }

  private normalizeInteger(value: number | undefined, fieldName: string) {
    const normalized = Number(value ?? 0);
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return normalized;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildQuoteCsv(quote: {
    quoteNo: string;
    productName: string;
    specification: string | null;
    moq: number;
    quantity: number;
    unitPrice: { toString(): string };
    status: string;
    approvalStatus: string;
    currency: string;
    amount: { toString(): string };
    materialCost: { toString(): string };
    processingCost: { toString(): string };
    taxCost: { toString(): string };
    shippingCost: { toString(): string };
    discountAmount: { toString(): string };
    validUntil: Date | null;
    notes: string | null;
    approvalComment: string | null;
    approvalSubmittedAt: Date | null;
    approvalReviewedAt: Date | null;
    customer: { name: string };
    createdAt: Date;
    updatedAt: Date;
  }) {
    const headers = [
      "报价编号",
      "产品名",
      "规格",
      "MOQ",
      "报价数量",
      "单价",
      "客户名称",
      "报价状态",
      "审批状态",
      "币种",
      "物料价",
      "加工费",
      "税费",
      "运费",
      "优惠金额",
      "报价总额",
      "有效期",
      "审批备注",
      "创建时间",
      "更新时间",
      "备注"
    ];
    const rows = [
      headers,
      [
        quote.quoteNo,
        quote.productName,
        quote.specification ?? "",
        String(quote.moq),
        String(quote.quantity),
        quote.unitPrice.toString(),
        quote.customer.name,
        quote.status,
        quote.approvalStatus,
        quote.currency,
        quote.materialCost.toString(),
        quote.processingCost.toString(),
        quote.taxCost.toString(),
        quote.shippingCost.toString(),
        quote.discountAmount.toString(),
        quote.amount.toString(),
        quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
        quote.approvalComment ?? "",
        quote.createdAt.toISOString(),
        quote.updatedAt.toISOString(),
        quote.notes ?? ""
      ]
    ];
    return `\ufeff${rows.map((row) => row.map((value) => this.escapeCsv(value)).join(",")).join("\n")}`;
  }

  private buildQuotesCsv(
    quotes: Array<{
      quoteNo: string;
      productName: string;
      specification: string | null;
      moq: number;
      quantity: number;
      unitPrice: { toString(): string };
      status: string;
      approvalStatus: string;
      currency: string;
      amount: { toString(): string };
      materialCost: { toString(): string };
      processingCost: { toString(): string };
      taxCost: { toString(): string };
      shippingCost: { toString(): string };
      discountAmount: { toString(): string };
      validUntil: Date | null;
      notes: string | null;
      approvalComment: string | null;
      approvalSubmittedAt: Date | null;
      approvalReviewedAt: Date | null;
      customer: { name: string };
      createdAt: Date;
      updatedAt: Date;
    }>
  ) {
    const headers = [
      "报价编号",
      "产品名",
      "规格",
      "MOQ",
      "报价数量",
      "单价",
      "客户名称",
      "报价状态",
      "审批状态",
      "币种",
      "物料价",
      "加工费",
      "税费",
      "运费",
      "优惠金额",
      "报价总额",
      "有效期",
      "审批备注",
      "创建时间",
      "更新时间",
      "备注"
    ];
    const rows = [
      headers,
      ...quotes.map((quote) => [
        quote.quoteNo,
        quote.productName,
        quote.specification ?? "",
        String(quote.moq),
        String(quote.quantity),
        quote.unitPrice.toString(),
        quote.customer.name,
        quote.status,
        quote.approvalStatus,
        quote.currency,
        quote.materialCost.toString(),
        quote.processingCost.toString(),
        quote.taxCost.toString(),
        quote.shippingCost.toString(),
        quote.discountAmount.toString(),
        quote.amount.toString(),
        quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
        quote.approvalComment ?? "",
        quote.createdAt.toISOString(),
        quote.updatedAt.toISOString(),
        quote.notes ?? ""
      ])
    ];
    return `\ufeff${rows.map((row) => row.map((value) => this.escapeCsv(value)).join(",")).join("\n")}`;
  }

  private escapeCsv(value: string) {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
