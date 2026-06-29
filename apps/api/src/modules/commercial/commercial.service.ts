import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CustomerStageService } from "../customers/customers.public";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
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
    const quote = await this.prisma.quote.create({
      data: {
        customerId: dto.customerId,
        quoteNo: dto.quoteNo,
        currency: dto.currency,
        amount: dto.amount as never,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        fileAssetId: dto.fileAssetId,
        notes: dto.notes,
        status: "SENT" as never
      }
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
    return this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        ...(dto.quoteNo !== undefined ? { quoteNo: dto.quoteNo } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount as never } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null } : {})
      }
    });
  }

  async deleteQuote(user: RequestUser, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    await this.prisma.quote.delete({ where: { id: quoteId } });
    return { deleted: true };
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
}
