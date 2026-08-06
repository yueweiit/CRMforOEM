import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { hasPermission } from "../../common/auth/permission.utils";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const REFERENCE_CANDIDATE_LIMIT = 50;
const HISTORICAL_REFERENCE_LIMIT = 5;

const publicQuoteSelect = {
  id: true,
  customerId: true,
  quoteNo: true,
  productName: true,
  specification: true,
  moq: true,
  quantity: true,
  unitPrice: true,
  currency: true,
  amount: true,
  validUntil: true,
  status: true,
  approvalStatus: true,
  createdAt: true,
  updatedAt: true
} as const;

type PublicQuoteRecord = Prisma.QuoteGetPayload<{ select: typeof publicQuoteSelect }>;

export type PublicQuoteSnapshot = {
  id: string;
  quoteNo: string;
  productName: string;
  specification: string | null;
  moq: number;
  quantity: number;
  unitPrice: string;
  currency: string;
  amount: string;
  validUntil: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class QuoteReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getReferenceContext(
    user: RequestUser,
    quoteId: string,
    options: { customerId?: string; includeHistorical?: boolean } = {}
  ) {
    if (!hasPermission(user, "quotes.read")) {
      throw new ForbiddenException("You do not have permission to read quotes");
    }
    if (options.includeHistorical !== false && !hasPermission(user, "quotes.reference.read")) {
      throw new ForbiddenException("You do not have permission to reference historical quotes");
    }

    const selected = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: buildCustomerDataScopeWhere(user) },
      select: publicQuoteSelect
    });
    if (!selected) throw new NotFoundException("Quote not found");
    if (options.customerId && selected.customerId !== options.customerId) {
      throw new NotFoundException("Quote not found for customer");
    }
    if (selected.approvalStatus !== "APPROVED") {
      throw new BadRequestException("Quotation email requires an approved quote");
    }
    if (selected.status !== "DRAFT" && selected.status !== "SENT") {
      throw new BadRequestException("Quotation email requires a draft or sent quote");
    }

    const historical = options.includeHistorical === false
      ? []
      : await this.findHistoricalReferences(user, selected);

    return {
      selectedQuote: this.toPublicSnapshot(selected),
      historicalQuotes: historical.map((quote) => this.toPublicSnapshot(quote)),
      historicalQuoteIds: historical.map((quote) => quote.id),
      quoteUpdatedAt: selected.updatedAt
    };
  }

  private async findHistoricalReferences(
    user: RequestUser,
    selected: PublicQuoteRecord
  ) {
    const candidates = await this.prisma.quote.findMany({
      where: {
        id: { not: selected.id },
        approvalStatus: "APPROVED" as never,
        status: { in: ["SENT", "ACCEPTED"] as never },
        currency: selected.currency,
        customer: buildCustomerDataScopeWhere(user)
      },
      select: publicQuoteSelect,
      orderBy: { updatedAt: "desc" },
      take: REFERENCE_CANDIDATE_LIMIT
    });

    return candidates
      .map((candidate) => ({ candidate, score: this.scoreReference(selected, candidate) }))
      .sort((left, right) => right.score - left.score || right.candidate.updatedAt.getTime() - left.candidate.updatedAt.getTime())
      .slice(0, HISTORICAL_REFERENCE_LIMIT)
      .map(({ candidate }) => candidate);
  }

  private scoreReference(
    selected: PublicQuoteRecord,
    candidate: PublicQuoteRecord
  ) {
    let score = candidate.status === "ACCEPTED" ? 100 : 0;
    const selectedProduct = this.normalizeText(selected.productName);
    const candidateProduct = this.normalizeText(candidate.productName);
    if (selectedProduct && selectedProduct === candidateProduct) score += 80;
    else if (selectedProduct && candidateProduct && (selectedProduct.includes(candidateProduct) || candidateProduct.includes(selectedProduct))) score += 40;

    const selectedSpecification = this.normalizeText(selected.specification);
    const candidateSpecification = this.normalizeText(candidate.specification);
    if (selectedSpecification && selectedSpecification === candidateSpecification) score += 30;

    const maxQuantity = Math.max(selected.quantity, candidate.quantity, 1);
    score += Math.round((1 - Math.abs(selected.quantity - candidate.quantity) / maxQuantity) * 20);
    return score;
  }

  private normalizeText(value?: string | null) {
    return value?.trim().toLocaleLowerCase() ?? "";
  }

  private toPublicSnapshot(quote: PublicQuoteRecord): PublicQuoteSnapshot {
    return {
      id: quote.id,
      quoteNo: quote.quoteNo,
      productName: quote.productName,
      specification: quote.specification,
      moq: quote.moq,
      quantity: quote.quantity,
      unitPrice: quote.unitPrice.toString(),
      currency: quote.currency,
      amount: quote.amount.toString(),
      validUntil: quote.validUntil?.toISOString() ?? null,
      status: quote.status,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    };
  }
}
