import { Injectable, NotFoundException } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { CreateCustomerDictionaryDto, UpdateCustomerDictionaryDto } from "../dto/settings.dto";

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

@Injectable()
export class CustomerDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(organizationId: string) {
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

  async listSources(user: RequestUser) {
    await this.ensureDefaults(user.organizationId);
    return this.prisma.customerSource.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createSource(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerSource.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateSource(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerSource.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer source not found");
    return this.prisma.customerSource.update({
      where: { id },
      data: { name: dto.name?.trim(), description: dto.description, isActive: dto.isActive }
    });
  }

  async listTypes(user: RequestUser) {
    await this.ensureDefaults(user.organizationId);
    return this.prisma.customerType.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createType(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerType.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateType(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerType.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer type not found");
    return this.prisma.customerType.update({
      where: { id },
      data: { name: dto.name?.trim(), description: dto.description, isActive: dto.isActive }
    });
  }
}
