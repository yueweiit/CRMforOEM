import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CustomerStageService } from "../customers/customers.public";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { QuoteReviewDto } from "./dto/quote-review.dto";
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
          comment: "Quote created"
        }
      });
      return created;
    });
    await this.customerStageService.advanceCustomerStage({
      customerId: dto.customerId,
      toStage: CustomerStage.Quoting,
      changedById: user.id,
      reason: "Quote created",
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
      include: { customer: { select: { id: true, name: true, stage: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async createSample(user: RequestUser, dto: CreateSampleRequestDto) {
    await this.ensureCustomerVisible(user, dto.customerId);
    const sample = await this.prisma.sampleRequest.create({
      data: {
        customerId: dto.customerId,
        productSummary: dto.productSummary,
        carrier: dto.carrier,
        trackingNo: dto.trackingNo,
        shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : undefined,
        status: (dto.status ?? "REQUESTED") as never
      }
    });
    await this.customerStageService.advanceCustomerStage({
      customerId: dto.customerId,
      toStage: CustomerStage.Sampling,
      changedById: user.id,
      reason: "Sample request created",
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
          comment: "Quote updated"
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
          comment: "Quote voided"
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
          comment: dto.comment ?? "Submitted for approval"
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
          comment: dto.comment ?? "Quote approved"
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
          comment: dto.comment ?? "Quote rejected"
        }
      });
      return updated;
    });
  }

  async updateSample(user: RequestUser, sampleId: string, dto: UpdateSampleRequestDto) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    return this.prisma.sampleRequest.update({
      where: { id: sampleId },
      data: {
        ...(dto.productSummary !== undefined ? { productSummary: dto.productSummary } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.carrier !== undefined ? { carrier: dto.carrier } : {}),
        ...(dto.trackingNo !== undefined ? { trackingNo: dto.trackingNo } : {}),
        ...(dto.shippedAt !== undefined ? { shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : null } : {}),
        ...(dto.feedback !== undefined ? { feedback: dto.feedback } : {})
      }
    });
  }

  async deleteSample(user: RequestUser, sampleId: string) {
    const sample = await this.prisma.sampleRequest.findFirst({
      where: { id: sampleId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!sample) {
      throw new NotFoundException("Sample request not found");
    }
    await this.prisma.sampleRequest.delete({ where: { id: sampleId } });
    return { deleted: true };
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
