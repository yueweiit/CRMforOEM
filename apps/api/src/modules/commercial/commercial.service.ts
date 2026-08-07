import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { CustomerStage, calculateQuotePricing } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CustomerStageService } from "../customers/customers.public";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateQuoteRevisionDto } from "./dto/create-quote-revision.dto";
import { QuoteReviewDto } from "./dto/quote-review.dto";
import { UpdateQuoteDto } from "./dto/update-quote.dto";
import { QuoteWorkflowService } from "./quote-workflow.service";

type QuoteExportRecord = {
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
  calcMode: string;
  materialItems: unknown;
  materialProfitRate: { toString(): string } | null;
  processingTime: { toString(): string } | null;
  processingHourlyRate: { toString(): string } | null;
  processingProfitRate: { toString(): string } | null;
  grossWeight: { toString(): string } | null;
  packageLength: { toString(): string } | null;
  packageWidth: { toString(): string } | null;
  packageHeight: { toString(): string } | null;
  volumeDivisor: { toString(): string } | null;
  shippingUnitPrice: { toString(): string } | null;
  vatRate: { toString(): string } | null;
  validUntil: Date | null;
  notes: string | null;
  approvalComment: string | null;
  approvalSubmittedAt: Date | null;
  approvalReviewedAt: Date | null;
  customer: { name: string };
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerStageService: CustomerStageService,
    private readonly quoteWorkflow: QuoteWorkflowService
  ) {}

  listQuotes(user: RequestUser, customerId?: string) {
    return this.prisma.quote.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        customer: { select: { id: true, name: true, stage: true } },
        revisionGroup: { select: { id: true, baseQuoteNo: true } },
        previousRevision: { select: { id: true, quoteNo: true, revisionNo: true, status: true } },
        nextRevision: { select: { id: true, quoteNo: true, revisionNo: true, status: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createQuote(user: RequestUser, dto: CreateQuoteDto) {
    await this.ensureCustomerVisible(user, dto.customerId);
    const pricing = calculateQuotePricing({
      calcMode: dto.calcMode as "formula" | "direct" | undefined,
      materialItems: dto.materialItems,
      materialProfitRate: dto.materialProfitRate,
      processingTime: dto.processingTime,
      processingHourlyRate: dto.processingHourlyRate,
      processingProfitRate: dto.processingProfitRate,
      grossWeight: dto.grossWeight,
      packageLength: dto.packageLength,
      packageWidth: dto.packageWidth,
      packageHeight: dto.packageHeight,
      volumeDivisor: dto.volumeDivisor,
      shippingUnitPrice: dto.shippingUnitPrice,
      vatRate: dto.vatRate,
      materialCost: dto.materialCost,
      processingCost: dto.processingCost,
      taxCost: dto.taxCost,
      shippingCost: dto.shippingCost,
      discountAmount: dto.discountAmount,
      quantity: dto.quantity,
      moq: dto.moq
    });
    if (!pricing.moqValid) {
      throw new BadRequestException(`Quote quantity must be greater than or equal to MOQ (${pricing.moq})`);
    }
    if (!pricing.nonNegativeItemValid) {
      throw new BadRequestException("Quote cost and discount values must not be negative");
    }
    if (!pricing.totalValid) {
      throw new BadRequestException("Quote total must be greater than or equal to 0");
    }
    const actorName = await this.resolveActorName(user);
    const quote = await this.prisma.$transaction(async (tx) => {
      const revisionGroup = await tx.quoteRevisionGroup.create({
        data: {
          customerId: dto.customerId,
          baseQuoteNo: dto.quoteNo
        }
      });
      const created = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          revisionGroupId: revisionGroup.id,
          revisionNo: 1,
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
          calcMode: pricing.calcMode,
          materialItems: this.toJsonOrNull(dto.materialItems),
          materialProfitRate: dto.materialProfitRate ?? null,
          processingTime: dto.processingTime ?? null,
          processingHourlyRate: dto.processingHourlyRate ?? null,
          processingProfitRate: dto.processingProfitRate ?? null,
          grossWeight: dto.grossWeight ?? null,
          packageLength: dto.packageLength ?? null,
          packageWidth: dto.packageWidth ?? null,
          packageHeight: dto.packageHeight ?? null,
          volumeDivisor: dto.volumeDivisor ?? null,
          shippingUnitPrice: dto.shippingUnitPrice ?? null,
          vatRate: dto.vatRate ?? null,
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
          actorName,
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

  async listQuoteRevisions(user: RequestUser, quoteId: string) {
    const source = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) },
      select: { revisionGroupId: true }
    });
    if (!source) {
      throw new NotFoundException("Quote not found");
    }
    return this.prisma.quote.findMany({
      where: {
        revisionGroupId: source.revisionGroupId,
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        revisionGroup: { select: { id: true, baseQuoteNo: true } },
        previousRevision: { select: { id: true, quoteNo: true, revisionNo: true, status: true } },
        nextRevision: { select: { id: true, quoteNo: true, revisionNo: true, status: true } }
      },
      orderBy: { revisionNo: "asc" }
    });
  }

  async createQuoteRevision(user: RequestUser, quoteId: string, dto: CreateQuoteRevisionDto) {
    const revisionReason = this.normalizeOptionalText(dto.reason);
    if (!revisionReason) {
      throw new BadRequestException("Quote revision reason is required");
    }
    const source = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) },
      include: {
        revisionGroup: { select: { id: true, baseQuoteNo: true } },
        nextRevision: { select: { id: true, quoteNo: true, revisionNo: true, status: true } }
      }
    });
    if (!source) {
      throw new NotFoundException("Quote not found");
    }
    if (source.status !== "CUSTOMER_REJECTED") {
      throw new BadRequestException("Only customer-rejected quotes can create a revision");
    }
    if (source.nextRevision) {
      throw this.quoteRevisionConflict(source.nextRevision);
    }

    const pricing = calculateQuotePricing({
      calcMode: source.calcMode as "formula" | "direct",
      materialItems: this.normalizeQuoteMaterialItems(source.materialItems),
      materialProfitRate: Number(source.materialProfitRate ?? 0),
      processingTime: Number(source.processingTime ?? 0),
      processingHourlyRate: Number(source.processingHourlyRate ?? 0),
      processingProfitRate: Number(source.processingProfitRate ?? 0),
      grossWeight: Number(source.grossWeight ?? 0),
      packageLength: Number(source.packageLength ?? 0),
      packageWidth: Number(source.packageWidth ?? 0),
      packageHeight: Number(source.packageHeight ?? 0),
      volumeDivisor: Number(source.volumeDivisor ?? 0),
      shippingUnitPrice: Number(source.shippingUnitPrice ?? 0),
      vatRate: Number(source.vatRate ?? 0),
      materialCost: Number(source.materialCost),
      processingCost: Number(source.processingCost),
      taxCost: Number(source.taxCost),
      shippingCost: Number(source.shippingCost),
      discountAmount: Number(source.discountAmount),
      quantity: source.quantity,
      moq: source.moq
    });
    if (!pricing.moqValid || !pricing.nonNegativeItemValid || !pricing.totalValid) {
      throw new BadRequestException("Source quote pricing is no longer valid for a revision");
    }

    const actorName = await this.resolveActorName(user);
    const nextRevisionNo = source.revisionNo + 1;
    const revisedAt = new Date();
    const quoteNo = this.buildRevisionQuoteNo(source.revisionGroup.baseQuoteNo, nextRevisionNo);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.quote.create({
          data: {
            customerId: source.customerId,
            revisionGroupId: source.revisionGroupId,
            previousRevisionId: source.id,
            revisionNo: nextRevisionNo,
            revisionReason,
            revisedById: user.id,
            revisedAt,
            quoteNo,
            productName: source.productName,
            specification: source.specification,
            moq: pricing.moq,
            quantity: pricing.quantity,
            unitPrice: new Prisma.Decimal(pricing.unitPrice.toFixed(2)),
            currency: source.currency,
            amount: new Prisma.Decimal(pricing.total.toFixed(2)),
            materialCost: new Prisma.Decimal(pricing.materialCost.toFixed(2)),
            processingCost: new Prisma.Decimal(pricing.processingCost.toFixed(2)),
            taxCost: new Prisma.Decimal(pricing.taxCost.toFixed(2)),
            shippingCost: new Prisma.Decimal(pricing.shippingCost.toFixed(2)),
            discountAmount: new Prisma.Decimal(pricing.discountAmount.toFixed(2)),
            calcMode: pricing.calcMode,
            materialItems: this.toJsonOrNull(this.normalizeQuoteMaterialItems(source.materialItems)),
            materialProfitRate: source.materialProfitRate,
            processingTime: source.processingTime,
            processingHourlyRate: source.processingHourlyRate,
            processingProfitRate: source.processingProfitRate,
            grossWeight: source.grossWeight,
            packageLength: source.packageLength,
            packageWidth: source.packageWidth,
            packageHeight: source.packageHeight,
            volumeDivisor: source.volumeDivisor,
            shippingUnitPrice: source.shippingUnitPrice,
            vatRate: source.vatRate,
            validUntil: source.validUntil && source.validUntil > revisedAt ? source.validUntil : null,
            fileAssetId: null,
            notes: source.notes,
            status: "DRAFT" as never,
            approvalStatus: "DRAFT" as never
          }
        });
        const sourceSnapshot = this.buildQuoteSnapshot(source);
        const createdSnapshot = this.buildQuoteSnapshot(created);
        await tx.quoteHistory.create({
          data: {
            quoteId: source.id,
            action: "REVISION_CREATED" as never,
            before: sourceSnapshot as never,
            after: { ...sourceSnapshot, nextRevisionId: created.id, nextRevisionNo } as never,
            actorId: user.id,
            actorName,
            comment: `已创建修订版 ${created.quoteNo}：${revisionReason}`
          }
        });
        await tx.quoteHistory.create({
          data: {
            quoteId: created.id,
            action: "REVISION_CREATED" as never,
            after: createdSnapshot as never,
            actorId: user.id,
            actorName,
            comment: `由 ${source.quoteNo} 创建修订版：${revisionReason}`
          }
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.quote.findFirst({
          where: { previousRevisionId: source.id, customer: buildCustomerDataScopeWhere(user) },
          select: { id: true, quoteNo: true, revisionNo: true, status: true }
        });
        throw this.quoteRevisionConflict(existing);
      }
      throw error;
    }
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
      workbook: await this.buildQuotesWorkbook([quote]),
      fileName: `quote-${quote.quoteNo}.xlsx`
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
      workbook: await this.buildQuotesWorkbook(quotes),
      fileName: customerId ? `quotes-${customerId}.xlsx` : "quotes.xlsx"
    };
  }

  async updateQuote(user: RequestUser, quoteId: string, dto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (dto.status !== undefined) {
      throw new BadRequestException("Quote lifecycle status must be changed through a dedicated command");
    }
    this.assertQuoteEditable(quote.status);
    const actorName = await this.resolveActorName(user);
    const mergedPricing = calculateQuotePricing({
      calcMode: (dto.calcMode as "formula" | "direct" | undefined) ?? (quote.calcMode as "formula" | "direct" | undefined),
      materialItems: dto.materialItems ?? this.normalizeQuoteMaterialItems(quote.materialItems),
      materialProfitRate: dto.materialProfitRate ?? Number(quote.materialProfitRate ?? 0),
      processingTime: dto.processingTime ?? Number(quote.processingTime ?? 0),
      processingHourlyRate: dto.processingHourlyRate ?? Number(quote.processingHourlyRate ?? 0),
      processingProfitRate: dto.processingProfitRate ?? Number(quote.processingProfitRate ?? 0),
      grossWeight: dto.grossWeight ?? Number(quote.grossWeight ?? 0),
      packageLength: dto.packageLength ?? Number(quote.packageLength ?? 0),
      packageWidth: dto.packageWidth ?? Number(quote.packageWidth ?? 0),
      packageHeight: dto.packageHeight ?? Number(quote.packageHeight ?? 0),
      volumeDivisor: dto.volumeDivisor ?? Number(quote.volumeDivisor ?? 0),
      shippingUnitPrice: dto.shippingUnitPrice ?? Number(quote.shippingUnitPrice ?? 0),
      vatRate: dto.vatRate ?? Number(quote.vatRate ?? 0),
      materialCost: dto.materialCost ?? Number(quote.materialCost),
      processingCost: dto.processingCost ?? Number(quote.processingCost),
      taxCost: dto.taxCost ?? Number(quote.taxCost),
      shippingCost: dto.shippingCost ?? Number(quote.shippingCost),
      discountAmount: dto.discountAmount ?? Number(quote.discountAmount),
      quantity: dto.quantity ?? quote.quantity,
      moq: dto.moq ?? quote.moq
    });
    if (!mergedPricing.moqValid) {
      throw new BadRequestException(`Quote quantity must be greater than or equal to MOQ (${mergedPricing.moq})`);
    }
    if (!mergedPricing.nonNegativeItemValid) {
      throw new BadRequestException("Quote cost and discount values must not be negative");
    }
    if (!mergedPricing.totalValid) {
      throw new BadRequestException("Quote total must be greater than or equal to 0");
    }
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
          calcMode: mergedPricing.calcMode,
          ...(dto.materialItems !== undefined ? { materialItems: this.toJsonOrNull(dto.materialItems) } : {}),
          ...(dto.materialProfitRate !== undefined ? { materialProfitRate: dto.materialProfitRate } : {}),
          ...(dto.processingTime !== undefined ? { processingTime: dto.processingTime } : {}),
          ...(dto.processingHourlyRate !== undefined ? { processingHourlyRate: dto.processingHourlyRate } : {}),
          ...(dto.processingProfitRate !== undefined ? { processingProfitRate: dto.processingProfitRate } : {}),
          ...(dto.grossWeight !== undefined ? { grossWeight: dto.grossWeight } : {}),
          ...(dto.packageLength !== undefined ? { packageLength: dto.packageLength } : {}),
          ...(dto.packageWidth !== undefined ? { packageWidth: dto.packageWidth } : {}),
          ...(dto.packageHeight !== undefined ? { packageHeight: dto.packageHeight } : {}),
          ...(dto.volumeDivisor !== undefined ? { volumeDivisor: dto.volumeDivisor } : {}),
          ...(dto.shippingUnitPrice !== undefined ? { shippingUnitPrice: dto.shippingUnitPrice } : {}),
          ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null } : {})
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "UPDATED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: "已更新报价"
        }
      });
      return updated;
    });
  }

  async sendQuote(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction((tx) => this.quoteWorkflow.markSent(tx, {
      quote,
      actor: { id: user.id, name: actorName },
      comment: this.normalizeOptionalText(dto.comment) ?? "已手动发送报价"
    }));
  }

  async acceptQuote(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction((tx) => this.quoteWorkflow.resolveCustomerReply(tx, {
      quote,
      outcome: "ACCEPTED",
      actor: { id: user.id, name: actorName },
      comment: this.normalizeOptionalText(dto.comment) ?? "客户已接受报价"
    }));
  }

  async rejectQuoteByCustomer(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction((tx) => this.quoteWorkflow.resolveCustomerReply(tx, {
      quote,
      outcome: "CUSTOMER_REJECTED",
      actor: { id: user.id, name: actorName },
      comment: this.normalizeOptionalText(dto.comment) ?? "客户已拒绝报价"
    }));
  }

  async expireQuote(user: RequestUser, quoteId: string, dto: QuoteReviewDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    this.assertQuoteExpirable(quote.status);
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const historyComment = this.normalizeOptionalText(dto.comment) ?? "报价已到期失效";
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: "EXPIRED" as never
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "EXPIRED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: historyComment
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
    const actorName = await this.resolveActorName(user);
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
          actorName,
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
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const approvalComment = this.normalizeOptionalText(dto.comment);
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "PENDING_APPROVAL" as never,
          approvalSubmittedAt: new Date(),
          approvalSubmittedById: user.id,
          approvalComment
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "SUBMITTED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: approvalComment ?? "已提交报价审批"
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
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const approvalComment = this.normalizeOptionalText(dto.comment);
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "APPROVED" as never,
          approvalReviewedAt: new Date(),
          approvalReviewedById: user.id,
          approvalComment: approvalComment ?? quote.approvalComment
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "APPROVED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: approvalComment ?? "已通过报价审批"
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
    const actorName = await this.resolveActorName(user);
    return this.prisma.$transaction(async (tx) => {
      const approvalComment = this.normalizeOptionalText(dto.comment);
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          approvalStatus: "REJECTED" as never,
          approvalReviewedAt: new Date(),
          approvalReviewedById: user.id,
          approvalComment: approvalComment ?? quote.approvalComment
        }
      });
      await tx.quoteHistory.create({
        data: {
          quoteId,
          action: "REJECTED" as never,
          before: this.buildQuoteSnapshot(quote) as never,
          after: this.buildQuoteSnapshot(updated) as never,
          actorId: user.id,
          actorName,
          comment: approvalComment ?? "已驳回报价审批"
        }
      });
      return updated;
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

  private async resolveActorName(user: RequestUser) {
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true }
    });
    return actor?.name ?? actor?.email ?? user.name ?? user.email ?? user.id;
  }

  private assertQuoteEditable(status: string) {
    if (status === "CUSTOMER_REJECTED") {
      throw new BadRequestException("Customer-rejected quote is immutable; create a revision instead");
    }
    if (status === "VOIDED") {
      throw new BadRequestException("Finalized quote cannot be edited");
    }
  }

  private buildRevisionQuoteNo(baseQuoteNo: string, revisionNo: number) {
    return `${baseQuoteNo}-R${String(revisionNo).padStart(2, "0")}`;
  }

  private quoteRevisionConflict(existing: { id: string; quoteNo: string; revisionNo: number; status: unknown } | null) {
    return new ConflictException({
      code: "QUOTE_REVISION_ALREADY_EXISTS",
      message: "A later revision already exists for this quote",
      existingRevision: existing
    });
  }

  private assertQuoteExpirable(status: string) {
    if (status !== "SENT") {
      throw new BadRequestException("Only sent quotes can be expired");
    }
  }

  private buildQuoteSnapshot(quote: {
    id: string;
    customerId: string;
    revisionGroupId?: string;
    previousRevisionId?: string | null;
    revisionNo?: number;
    revisionReason?: string | null;
    revisedById?: string | null;
    revisedAt?: Date | null;
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
    calcMode: string;
    materialItems: unknown;
    materialProfitRate: { toString(): string } | string | null;
    processingTime: { toString(): string } | string | null;
    processingHourlyRate: { toString(): string } | string | null;
    processingProfitRate: { toString(): string } | string | null;
    grossWeight: { toString(): string } | string | null;
    packageLength: { toString(): string } | string | null;
    packageWidth: { toString(): string } | string | null;
    packageHeight: { toString(): string } | string | null;
    volumeDivisor: { toString(): string } | string | null;
    shippingUnitPrice: { toString(): string } | string | null;
    vatRate: { toString(): string } | string | null;
    validUntil: Date | null;
    fileAssetId: string | null;
    notes: string | null;
    approvalComment: string | null;
    approvalSubmittedAt: Date | null;
    approvalSubmittedById: string | null;
    approvalReviewedAt: Date | null;
    approvalReviewedById: string | null;
    sentAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: quote.id,
      customerId: quote.customerId,
      revisionGroupId: quote.revisionGroupId ?? null,
      previousRevisionId: quote.previousRevisionId ?? null,
      revisionNo: quote.revisionNo ?? 1,
      revisionReason: quote.revisionReason ?? null,
      revisedById: quote.revisedById ?? null,
      revisedAt: quote.revisedAt ? quote.revisedAt.toISOString() : null,
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
      calcMode: quote.calcMode,
      materialItems: this.normalizeQuoteMaterialItems(quote.materialItems),
      materialProfitRate: quote.materialProfitRate?.toString() ?? null,
      processingTime: quote.processingTime?.toString() ?? null,
      processingHourlyRate: quote.processingHourlyRate?.toString() ?? null,
      processingProfitRate: quote.processingProfitRate?.toString() ?? null,
      grossWeight: quote.grossWeight?.toString() ?? null,
      packageLength: quote.packageLength?.toString() ?? null,
      packageWidth: quote.packageWidth?.toString() ?? null,
      packageHeight: quote.packageHeight?.toString() ?? null,
      volumeDivisor: quote.volumeDivisor?.toString() ?? null,
      volumeWeight: this.calculateVolumeWeightFromQuote(quote).toFixed(2),
      shippingUnitPrice: quote.shippingUnitPrice?.toString() ?? null,
      vatRate: quote.vatRate?.toString() ?? null,
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
      fileAssetId: quote.fileAssetId,
      notes: quote.notes,
      approvalComment: quote.approvalComment,
      approvalSubmittedAt: quote.approvalSubmittedAt ? quote.approvalSubmittedAt.toISOString() : null,
      approvalSubmittedById: quote.approvalSubmittedById,
      approvalReviewedAt: quote.approvalReviewedAt ? quote.approvalReviewedAt.toISOString() : null,
      approvalReviewedById: quote.approvalReviewedById,
      sentAt: quote.sentAt ? quote.sentAt.toISOString() : null,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    };
  }

  private normalizeOptionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private calculateVolumeWeightFromQuote(quote: {
    packageLength?: { toString(): string } | string | null;
    packageWidth?: { toString(): string } | string | null;
    packageHeight?: { toString(): string } | string | null;
    volumeDivisor?: { toString(): string } | string | null;
  }) {
    const packageLength = Number(quote.packageLength?.toString() ?? 0);
    const packageWidth = Number(quote.packageWidth?.toString() ?? 0);
    const packageHeight = Number(quote.packageHeight?.toString() ?? 0);
    const volumeDivisor = Number(quote.volumeDivisor?.toString() ?? 0);
    if (!Number.isFinite(packageLength) || !Number.isFinite(packageWidth) || !Number.isFinite(packageHeight) || !Number.isFinite(volumeDivisor) || volumeDivisor <= 0) {
      return 0;
    }
    return this.roundMoney((packageLength * packageWidth * packageHeight) / volumeDivisor);
  }

  private toJsonOrNull(value: unknown) {
    return value === undefined || value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
  }

  private normalizeQuoteMaterialItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : `物料${index + 1}`,
        usage: this.normalizeJsonNumber(record.usage),
        unitPrice: this.normalizeJsonNumber(record.unitPrice),
        lossRate: this.normalizeJsonNumber(record.lossRate)
      };
    }).filter((item) => item.usage > 0 || item.unitPrice > 0);
  }

  private normalizeJsonNumber(value: unknown) {
    const normalized = Number(value ?? 0);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  private formatMaterialItemsForCsv(value: unknown) {
    return this.normalizeQuoteMaterialItems(value)
      .map((item) => `${item.name}: ${item.usage} × ${item.unitPrice}, 损耗率 ${item.lossRate}`)
      .join("; ");
  }

  private async buildQuotesWorkbook(quotes: QuoteExportRecord[]) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OEM Customer Development CRM";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("报价汇总", { views: [{ state: "frozen", ySplit: 1 }] });
    summarySheet.columns = [
      { header: "报价编号", key: "quoteNo", width: 22 },
      { header: "客户名称", key: "customerName", width: 22 },
      { header: "产品名", key: "productName", width: 24 },
      { header: "规格", key: "specification", width: 20 },
      { header: "MOQ", key: "moq", width: 12 },
      { header: "报价数量", key: "quantity", width: 12 },
      { header: "单价", key: "unitPrice", width: 14 },
      { header: "报价总额", key: "amount", width: 14 },
      { header: "币种", key: "currency", width: 10 },
      { header: "报价状态", key: "status", width: 14 },
      { header: "审批状态", key: "approvalStatus", width: 14 },
      { header: "有效期", key: "validUntil", width: 14 },
      { header: "创建时间", key: "createdAt", width: 22 },
      { header: "更新时间", key: "updatedAt", width: 22 },
      { header: "备注", key: "notes", width: 30 }
    ];
    summarySheet.addRows(quotes.map((quote) => ({
      quoteNo: quote.quoteNo,
      customerName: quote.customer.name,
      productName: quote.productName,
      specification: quote.specification ?? "",
      moq: quote.moq,
      quantity: quote.quantity,
      unitPrice: this.toExportNumber(quote.unitPrice),
      amount: this.toExportNumber(quote.amount),
      currency: quote.currency,
      status: quote.status,
      approvalStatus: quote.approvalStatus,
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      notes: quote.notes ?? ""
    })));
    this.styleExportSheet(summarySheet);

    const detailSheet = workbook.addWorksheet("价格明细", { views: [{ state: "frozen", ySplit: 1 }] });
    detailSheet.columns = [
      { header: "报价编号", key: "quoteNo", width: 22 },
      { header: "客户名称", key: "customerName", width: 22 },
      { header: "产品名", key: "productName", width: 24 },
      { header: "币种", key: "currency", width: 10 },
      { header: "分类", key: "category", width: 14 },
      { header: "项目", key: "item", width: 20 },
      { header: "用量", key: "usage", width: 12 },
      { header: "单价", key: "unitPrice", width: 14 },
      { header: "损耗率", key: "lossRate", width: 12 },
      { header: "利润率", key: "profitRate", width: 12 },
      { header: "金额", key: "amount", width: 14 },
      { header: "计算说明", key: "description", width: 46 }
    ];
    detailSheet.addRows(quotes.flatMap((quote) => this.buildQuotePriceDetailRows(quote)));
    this.styleExportSheet(detailSheet);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildQuotePriceDetailRows(quote: QuoteExportRecord) {
    const base = {
      quoteNo: quote.quoteNo,
      customerName: quote.customer.name,
      productName: quote.productName,
      currency: quote.currency
    };
    const priceRows: Array<Record<string, string | number>> = [];
    const formulaPricing = quote.calcMode === "formula"
      ? calculateQuotePricing({
          calcMode: "formula",
          materialItems: this.normalizeQuoteMaterialItems(quote.materialItems),
          materialProfitRate: quote.materialProfitRate?.toString(),
          processingTime: quote.processingTime?.toString(),
          processingHourlyRate: quote.processingHourlyRate?.toString(),
          processingProfitRate: quote.processingProfitRate?.toString(),
          grossWeight: quote.grossWeight?.toString(),
          packageLength: quote.packageLength?.toString(),
          packageWidth: quote.packageWidth?.toString(),
          packageHeight: quote.packageHeight?.toString(),
          volumeDivisor: quote.volumeDivisor?.toString(),
          shippingUnitPrice: quote.shippingUnitPrice?.toString(),
          vatRate: quote.vatRate?.toString(),
          discountAmount: quote.discountAmount.toString(),
          quantity: quote.quantity,
          moq: quote.moq
        })
      : undefined;

    for (const material of formulaPricing?.breakdown?.materialItems ?? []) {
      priceRows.push({
        ...base,
        category: "物料",
        item: material.name,
        usage: material.usage,
        unitPrice: material.unitPrice,
        lossRate: material.lossRate,
        profitRate: "",
        amount: material.cost,
        description: "用量 × 单价 × (1 + 损耗率)"
      });
    }

    const detailMode = quote.calcMode === "formula" ? "按公式计算" : "直接录入";
    priceRows.push(
      {
        ...base,
        category: "报价构成",
        item: "物料价",
        usage: "",
        unitPrice: "",
        lossRate: "",
        profitRate: quote.materialProfitRate?.toString() ?? "",
        amount: this.toExportNumber(quote.materialCost),
        description: quote.calcMode === "formula" ? "物料成本（含损耗）× (1 + 物料利润率)" : detailMode
      },
      {
        ...base,
        category: "报价构成",
        item: "加工费",
        usage: quote.processingTime?.toString() ?? "",
        unitPrice: quote.processingHourlyRate?.toString() ?? "",
        lossRate: "",
        profitRate: quote.processingProfitRate?.toString() ?? "",
        amount: this.toExportNumber(quote.processingCost),
        description: quote.calcMode === "formula" ? "加工时间 × 工时费率 × (1 + 加工利润率)" : detailMode
      },
      {
        ...base,
        category: "报价构成",
        item: "税费",
        usage: "",
        unitPrice: "",
        lossRate: "",
        profitRate: quote.vatRate?.toString() ?? "",
        amount: this.toExportNumber(quote.taxCost),
        description: quote.calcMode === "formula" ? "（物料价 + 加工费 + 运费）× 增值税率" : detailMode
      },
      {
        ...base,
        category: "报价构成",
        item: "运费",
        usage: formulaPricing?.breakdown?.chargeableWeight ?? "",
        unitPrice: quote.shippingUnitPrice?.toString() ?? "",
        lossRate: "",
        profitRate: "",
        amount: this.toExportNumber(quote.shippingCost),
        description: quote.calcMode === "formula" ? "计费重量 × 运输单位价格" : detailMode
      },
      {
        ...base,
        category: "报价构成",
        item: "优惠金额",
        usage: "",
        unitPrice: "",
        lossRate: "",
        profitRate: "",
        amount: this.toExportNumber(quote.discountAmount),
        description: "从报价总额中扣减"
      },
      {
        ...base,
        category: "报价构成",
        item: "报价总额",
        usage: "",
        unitPrice: "",
        lossRate: "",
        profitRate: "",
        amount: this.toExportNumber(quote.amount),
        description: "物料价 + 加工费 + 税费 + 运费 - 优惠金额"
      }
    );
    return priceRows;
  }

  private styleExportSheet(sheet: ExcelJS.Worksheet) {
    const headerRow = sheet.getRow(1);
    headerRow.alignment = { vertical: "middle" };
    for (let columnNumber = 1; columnNumber <= sheet.columnCount; columnNumber += 1) {
      const headerCell = headerRow.getCell(columnNumber);
      headerCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007F73" } };
    }
    sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columnCount } };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: "top", wrapText: true };
      }
    });
  }

  private toExportNumber(value: { toString(): string }) {
    return Number(value.toString());
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
    calcMode: string;
    materialItems: unknown;
    materialProfitRate: { toString(): string } | null;
    processingTime: { toString(): string } | null;
    processingHourlyRate: { toString(): string } | null;
    processingProfitRate: { toString(): string } | null;
    grossWeight: { toString(): string } | null;
    packageLength: { toString(): string } | null;
    packageWidth: { toString(): string } | null;
    packageHeight: { toString(): string } | null;
    volumeDivisor: { toString(): string } | null;
    shippingUnitPrice: { toString(): string } | null;
    vatRate: { toString(): string } | null;
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
      "计算模式",
      "物料明细(含损耗率)",
      "物料利润率",
      "加工时间",
      "加工工时费率",
      "加工利润率",
      "毛重",
      "长",
      "宽",
      "高",
      "体积系数",
      "体积重量",
      "运输单位价格",
      "增值税率",
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
        quote.calcMode,
        this.formatMaterialItemsForCsv(quote.materialItems),
        quote.materialProfitRate?.toString() ?? "",
        quote.processingTime?.toString() ?? "",
        quote.processingHourlyRate?.toString() ?? "",
        quote.processingProfitRate?.toString() ?? "",
        quote.grossWeight?.toString() ?? "",
        quote.packageLength?.toString() ?? "",
        quote.packageWidth?.toString() ?? "",
        quote.packageHeight?.toString() ?? "",
        quote.volumeDivisor?.toString() ?? "",
        this.calculateVolumeWeightFromQuote(quote).toFixed(2),
        quote.shippingUnitPrice?.toString() ?? "",
        quote.vatRate?.toString() ?? "",
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
      calcMode: string;
      materialItems: unknown;
      materialProfitRate: { toString(): string } | null;
      processingTime: { toString(): string } | null;
      processingHourlyRate: { toString(): string } | null;
      processingProfitRate: { toString(): string } | null;
      grossWeight: { toString(): string } | null;
      packageLength: { toString(): string } | null;
      packageWidth: { toString(): string } | null;
      packageHeight: { toString(): string } | null;
      volumeDivisor: { toString(): string } | null;
      shippingUnitPrice: { toString(): string } | null;
      vatRate: { toString(): string } | null;
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
      "计算模式",
      "物料明细(含损耗率)",
      "物料利润率",
      "加工时间",
      "加工工时费率",
      "加工利润率",
      "毛重",
      "长",
      "宽",
      "高",
      "体积系数",
      "体积重量",
      "运输单位价格",
      "增值税率",
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
        quote.calcMode,
        this.formatMaterialItemsForCsv(quote.materialItems),
        quote.materialProfitRate?.toString() ?? "",
        quote.processingTime?.toString() ?? "",
        quote.processingHourlyRate?.toString() ?? "",
        quote.processingProfitRate?.toString() ?? "",
        quote.grossWeight?.toString() ?? "",
        quote.packageLength?.toString() ?? "",
        quote.packageWidth?.toString() ?? "",
        quote.packageHeight?.toString() ?? "",
        quote.volumeDivisor?.toString() ?? "",
        this.calculateVolumeWeightFromQuote(quote).toFixed(2),
        quote.shippingUnitPrice?.toString() ?? "",
        quote.vatRate?.toString() ?? "",
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
