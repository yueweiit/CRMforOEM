import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateBlacklistRuleDto, CreateCustomerDictionaryDto, CreateUserDto, UpdateBlacklistRuleDto, UpdateCustomerDictionaryDto, UpdateUserDto } from "./dto/settings.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  users(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        title: true,
        teamId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
        userRoles: { include: { role: { select: { id: true, code: true, name: true, dataScope: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  roles(user: RequestUser) {
    return this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { code: "asc" }
    });
  }

  teams(user: RequestUser) {
    return this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  auditLogs(user: RequestUser) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: user.organizationId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async customerSources(user: RequestUser) {
    await this.ensureDefaultCustomerDictionaries(user.organizationId);
    return this.prisma.customerSource.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createCustomerSource(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerSource.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateCustomerSource(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerSource.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer source not found");
    return this.prisma.customerSource.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive
      }
    });
  }

  async customerTypes(user: RequestUser) {
    await this.ensureDefaultCustomerDictionaries(user.organizationId);
    return this.prisma.customerType.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createCustomerType(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerType.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateCustomerType(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerType.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer type not found");
    return this.prisma.customerType.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive
      }
    });
  }

  async createUser(user: RequestUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("User email already exists");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: user.organizationId,
          teamId: dto.teamId,
          email: dto.email,
          name: dto.name,
          title: dto.title,
          passwordHash: await bcrypt.hash(dto.password, 10)
        }
      });
      await this.replaceUserRoles(tx, user.organizationId, created.id, dto.roleCodes ?? ["SALES_REP"]);
      return created;
    });
  }

  async updateUser(user: RequestUser, id: string, dto: UpdateUserDto) {
    await this.ensureUser(user, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          teamId: dto.teamId,
          title: dto.title,
          isActive: dto.isActive
        }
      });
      if (dto.roleCodes) {
        await this.replaceUserRoles(tx, user.organizationId, id, dto.roleCodes);
      }
      return updated;
    });
  }

  blacklistRules(user: RequestUser) {
    return this.prisma.blacklistRule.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" }
    });
  }

  createBlacklistRule(user: RequestUser, dto: CreateBlacklistRuleDto) {
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

  async updateBlacklistRule(user: RequestUser, id: string, dto: UpdateBlacklistRuleDto) {
    const existing = await this.prisma.blacklistRule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Blacklist rule not found");
    return this.prisma.blacklistRule.update({
      where: { id },
      data: { reason: dto.reason, isActive: dto.isActive }
    });
  }

  private async ensureUser(user: RequestUser, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("User not found");
    return existing;
  }

  private async replaceUserRoles(tx: Prisma.TransactionClient, organizationId: string, userId: string, roleCodes: string[]) {
    const roles = await tx.role.findMany({ where: { organizationId, code: { in: roleCodes } } });
    await tx.userRole.deleteMany({ where: { userId } });
    if (!roles.length) return;
    await tx.userRole.createMany({
      data: roles.map((role) => ({ userId, roleId: role.id })),
      skipDuplicates: true
    });
  }

  private async ensureDefaultCustomerDictionaries(organizationId: string) {
    await Promise.all([
      ...DEFAULT_CUSTOMER_SOURCES.map(([name, description]) =>
        this.prisma.customerSource.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description },
          create: { organizationId, name, description }
        })
      ),
      ...DEFAULT_CUSTOMER_TYPES.map(([name, description]) =>
        this.prisma.customerType.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description },
          create: { organizationId, name, description }
        })
      )
    ]);
  }
}

function normalizeBlacklistValue(type: string, value: string) {
  const trimmed = value.trim();
  if (type === "EMAIL" || type === "DOMAIN" || type === "COMPANY_NAME") return trimmed.toLowerCase();
  return trimmed;
}

const DEFAULT_CUSTOMER_SOURCES = [
  ["手动录入", "Manual customer entry"],
  ["线下", "Offline lead or existing offline customer"],
  ["Google搜索", "Customers found through Google search"],
  ["LinkedIn", "Customers found through LinkedIn"],
  ["展会", "Trade show leads"],
  ["阿里国际站", "Alibaba international leads"],
  ["老客推荐", "Customer referral"],
  ["行业名录", "Industry directory"]
] as const;

const DEFAULT_CUSTOMER_TYPES = [
  ["品牌商", "Brand owner"],
  ["最终客户", "End customer"],
  ["代理商", "Agent or buying representative"],
  ["批发商", "Wholesaler"],
  ["分销商", "Distributor"],
  ["零售商", "Retailer"],
  ["跨境电商", "Cross-border ecommerce"],
  ["采购商", "Procurement buyer"],
  ["OEM/ODM Target", "General OEM/ODM target"]
] as const;
