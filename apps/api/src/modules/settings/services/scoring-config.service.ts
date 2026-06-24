import { ForbiddenException, Injectable } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { hasPermission } from "../../../common/auth/permission.utils";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { UpdateOemScoringWeightsDto } from "../dto/settings.dto";

export type OemScoringWeights = {
  productLineFit: number;
  marketFit: number;
  priceBandFit: number;
  brandMaturity: number;
  websiteCompleteness: number;
  contactQuality: number;
  cooperationOpportunity: number;
  riskPenaltyMax: number;
};

export const DEFAULT_OEM_SCORING_WEIGHTS: OemScoringWeights = {
  productLineFit: 20,
  marketFit: 15,
  priceBandFit: 15,
  brandMaturity: 15,
  websiteCompleteness: 10,
  contactQuality: 10,
  cooperationOpportunity: 15,
  riskPenaltyMax: 10
};

const BONUS_WEIGHT_KEYS = [
  "productLineFit",
  "marketFit",
  "priceBandFit",
  "brandMaturity",
  "websiteCompleteness",
  "contactQuality",
  "cooperationOpportunity"
] as const;

export function mergeWithDefaults(partial: Partial<OemScoringWeights>): OemScoringWeights {
  return {
    productLineFit: safeInt(partial.productLineFit, DEFAULT_OEM_SCORING_WEIGHTS.productLineFit),
    marketFit: safeInt(partial.marketFit, DEFAULT_OEM_SCORING_WEIGHTS.marketFit),
    priceBandFit: safeInt(partial.priceBandFit, DEFAULT_OEM_SCORING_WEIGHTS.priceBandFit),
    brandMaturity: safeInt(partial.brandMaturity, DEFAULT_OEM_SCORING_WEIGHTS.brandMaturity),
    websiteCompleteness: safeInt(partial.websiteCompleteness, DEFAULT_OEM_SCORING_WEIGHTS.websiteCompleteness),
    contactQuality: safeInt(partial.contactQuality, DEFAULT_OEM_SCORING_WEIGHTS.contactQuality),
    cooperationOpportunity: safeInt(partial.cooperationOpportunity, DEFAULT_OEM_SCORING_WEIGHTS.cooperationOpportunity),
    riskPenaltyMax: safeInt(partial.riskPenaltyMax, DEFAULT_OEM_SCORING_WEIGHTS.riskPenaltyMax)
  };
}

function safeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : fallback;
}

@Injectable()
export class ScoringConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeights(user: RequestUser): Promise<OemScoringWeights> {
    const config = await this.prisma.oemScoringConfig.findUnique({
      where: { organizationId: user.organizationId }
    });
    if (!config) return { ...DEFAULT_OEM_SCORING_WEIGHTS };
    return mergeWithDefaults(config.weights as Partial<OemScoringWeights>);
  }

  async updateWeights(user: RequestUser, dto: UpdateOemScoringWeightsDto): Promise<OemScoringWeights> {
    if (!hasPermission(user, "settings.scoring_weights.manage")) {
      throw new ForbiddenException("You do not have permission to modify scoring weights");
    }

    const bonusSum = BONUS_WEIGHT_KEYS.reduce((sum, key) => sum + dto[key], 0);
    if (bonusSum !== 100) {
      throw new ForbiddenException("Bonus item weights must sum to 100");
    }

    const oldConfig = await this.prisma.oemScoringConfig.findUnique({
      where: { organizationId: user.organizationId }
    });
    const oldWeights = oldConfig ? mergeWithDefaults(oldConfig.weights as Partial<OemScoringWeights>) : { ...DEFAULT_OEM_SCORING_WEIGHTS };

    const newWeights: OemScoringWeights = {
      productLineFit: dto.productLineFit,
      marketFit: dto.marketFit,
      priceBandFit: dto.priceBandFit,
      brandMaturity: dto.brandMaturity,
      websiteCompleteness: dto.websiteCompleteness,
      contactQuality: dto.contactQuality,
      cooperationOpportunity: dto.cooperationOpportunity,
      riskPenaltyMax: dto.riskPenaltyMax
    };

    const config = await this.prisma.oemScoringConfig.upsert({
      where: { organizationId: user.organizationId },
      update: { weights: newWeights as never },
      create: {
        organizationId: user.organizationId,
        weights: newWeights as never
      }
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "UPDATE",
        entityType: "OEM_SCORING_CONFIG",
        entityId: config.id,
        before: oldWeights as never,
        after: newWeights as never
      }
    });

    return newWeights;
  }
}
