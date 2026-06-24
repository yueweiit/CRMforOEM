import { Injectable, NotFoundException } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { CreateBlacklistRuleDto, UpdateBlacklistRuleDto } from "../dto/settings.dto";

function normalizeBlacklistValue(type: string, value: string) {
  const trimmed = value.trim();
  if (type === "EMAIL" || type === "DOMAIN" || type === "COMPANY_NAME") return trimmed.toLowerCase();
  return trimmed;
}

@Injectable()
export class BlacklistService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: RequestUser) {
    return this.prisma.blacklistRule.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" }
    });
  }

  create(user: RequestUser, dto: CreateBlacklistRuleDto) {
    return this.prisma.blacklistRule.create({
      data: {
        organizationId: user.organizationId,
        type: dto.type as never,
        value: normalizeBlacklistValue(dto.type, dto.value),
        reason: dto.reason,
        createdById: user.id
      }
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateBlacklistRuleDto) {
    const existing = await this.prisma.blacklistRule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Blacklist rule not found");
    return this.prisma.blacklistRule.update({
      where: { id },
      data: { reason: dto.reason, isActive: dto.isActive }
    });
  }
}
