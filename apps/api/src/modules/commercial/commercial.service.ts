import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerStageService } from "../customers/customer-stage.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";

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
