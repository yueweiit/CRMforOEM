import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AssignCustomerDto } from "./dto/assign-customer.dto";
import { ChangeCustomerStageDto } from "./dto/change-customer-stage.dto";
import { CreateContactDto } from "./dto/create-contact.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: RequestUser, filters: { stage?: string; q?: string }) {
    const where: Record<string, unknown> = {
      ...buildCustomerDataScopeWhere(user),
      ...(filters.stage ? { stage: filters.stage } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { websiteDomain: { contains: filters.q, mode: "insensitive" } }
            ]
          }
        : {})
    };

    return this.prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: { take: 3, orderBy: { createdAt: "desc" } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } }
      }
    });
  }

  async filterOptions(user: RequestUser) {
    await this.ensureDefaultCustomerDictionaries(user.organizationId);
    const [sources, types, users] = await Promise.all([
      this.prisma.customerSource.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { name: "asc" } }),
      this.prisma.customerType.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { name: "asc" } }),
      this.prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
          ...(user.dataScope === "SELF" ? { id: user.id } : {}),
          ...(user.dataScope === "TEAM" && user.teamId ? { teamId: user.teamId } : {})
        },
        select: { id: true, name: true, email: true, teamId: true },
        orderBy: { name: "asc" }
      })
    ]);
    return {
      sources,
      types,
      users,
      stages: Object.values(CustomerStage)
    };
  }

  private async ensureDefaultCustomerDictionaries(organizationId: string) {
    await Promise.all([
      ...DEFAULT_CUSTOMER_SOURCES.map(([name, description]) =>
        this.prisma.customerSource.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description, isActive: true },
          create: { organizationId, name, description }
        })
      ),
      ...DEFAULT_CUSTOMER_TYPES.map(([name, description]) =>
        this.prisma.customerType.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description, isActive: true },
          create: { organizationId, name, description }
        })
      )
    ]);
  }

  async create(user: RequestUser, dto: CreateCustomerDto) {
    const normalizedName = normalizeCustomerName(dto.name);
    const websiteDomain = dto.websiteUrl ? extractDomain(dto.websiteUrl) : undefined;
    const existing = await this.prisma.customer.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ normalizedName }, ...(websiteDomain ? [{ websiteDomain }] : [])]
      }
    });
    if (existing) {
      throw new ConflictException("Customer already exists");
    }

    const ownerId = dto.ownerId ?? user.id;
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          organizationId: user.organizationId,
          sourceId: dto.sourceId,
          typeId: dto.typeId,
          ownerId,
          createdById: user.id,
          name: dto.name,
          normalizedName,
          websiteUrl: dto.websiteUrl,
          websiteDomain,
          country: dto.country,
          language: dto.language,
          timezone: dto.timezone,
          currency: dto.currency,
          tags: dto.tags ?? [],
          notes: dto.notes,
          stage: CustomerStage.PendingResearch as never
        }
      });

      await tx.customerStageHistory.create({
        data: {
          customerId: customer.id,
          toStage: CustomerStage.PendingResearch as never,
          changedById: user.id,
          reason: "Customer created"
        }
      });

      return customer;
    });
  }

  async get(user: RequestUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...buildCustomerDataScopeWhere(user) },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        source: true,
        type: true,
        contacts: true,
        websiteAnalyses: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            pages: { orderBy: [{ pageType: "asc" }, { depth: "asc" }] },
            products: { orderBy: { confidence: "desc" } }
          }
        },
        researchReports: { take: 1, orderBy: { createdAt: "desc" } },
        oemFitScores: { take: 1, orderBy: { createdAt: "desc" } },
        followUpTasks: { orderBy: { dueAt: "asc" } }
      }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  async update(user: RequestUser, id: string, dto: UpdateCustomerDto) {
    await this.ensureVisible(user, id);
    return this.prisma.customer.update({
      where: { id },
      data: buildCustomerUpdateData(dto)
    });
  }

  async assign(user: RequestUser, id: string, dto: AssignCustomerDto) {
    const customer = await this.ensureVisible(user, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.customerAssignmentHistory.create({
        data: {
          customerId: id,
          previousOwnerId: customer.ownerId,
          newOwnerId: dto.ownerId,
          assignedById: user.id,
          reason: dto.reason
        }
      });
      return tx.customer.update({
        where: { id },
        data: { ownerId: dto.ownerId }
      });
    });
  }

  async changeStage(user: RequestUser, id: string, dto: ChangeCustomerStageDto) {
    const customer = await this.ensureVisible(user, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.customerStageHistory.create({
        data: {
          customerId: id,
          fromStage: customer.stage,
          toStage: dto.stage as never,
          changedById: user.id,
          reason: dto.reason
        }
      });
      return tx.customer.update({
        where: { id },
        data: { stage: dto.stage as never }
      });
    });
  }

  async timeline(user: RequestUser, id: string) {
    await this.ensureVisible(user, id);
    const [stageHistories, assignments, tasks, messages] = await Promise.all([
      this.prisma.customerStageHistory.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
      this.prisma.customerAssignmentHistory.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
      this.prisma.followUpTask.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
      this.prisma.emailThread.findMany({
        where: { customerId: id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 5 } },
        orderBy: { updatedAt: "desc" }
      })
    ]);

    return { stageHistories, assignments, tasks, messages };
  }

  async createContact(user: RequestUser, customerId: string, dto: CreateContactDto) {
    await this.ensureVisible(user, customerId);
    return this.prisma.contact.create({
      data: {
        customerId,
        ...buildContactCreateData(dto)
      }
    });
  }

  async updateContact(user: RequestUser, customerId: string, contactId: string, dto: UpdateContactDto) {
    await this.ensureVisible(user, customerId);
    await this.ensureContactBelongsToCustomer(customerId, contactId);

    return this.prisma.contact.update({
      where: { id: contactId },
      data: buildContactUpdateData(dto)
    });
  }

  async deleteContact(user: RequestUser, customerId: string, contactId: string) {
    await this.ensureVisible(user, customerId);
    await this.ensureContactBelongsToCustomer(customerId, contactId);

    return this.prisma.contact.delete({
      where: { id: contactId }
    });
  }

  private async ensureVisible(user: RequestUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private async ensureContactBelongsToCustomer(customerId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, customerId }
    });
    if (!contact) {
      throw new NotFoundException("Contact not found");
    }
    return contact;
  }
}

function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractDomain(input: string) {
  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

function buildCustomerUpdateData(dto: UpdateCustomerDto) {
  const data: {
    sourceId?: string | null;
    typeId?: string | null;
    ownerId?: string | null;
    name?: string;
    normalizedName?: string;
    websiteUrl?: string | null;
    websiteDomain?: string | null;
    country?: string | null;
    language?: string | null;
    timezone?: string | null;
    currency?: string | null;
    tags?: string[];
    notes?: string | null;
  } = {};

  if (hasOwn(dto, "sourceId")) data.sourceId = nullableUpdateString(dto.sourceId);
  if (hasOwn(dto, "typeId")) data.typeId = nullableUpdateString(dto.typeId);
  if (hasOwn(dto, "ownerId")) data.ownerId = nullableUpdateString(dto.ownerId);
  if (dto.name !== undefined) {
    data.name = dto.name;
    data.normalizedName = normalizeCustomerName(dto.name);
  }
  if (hasOwn(dto, "websiteUrl")) {
    const websiteUrl = nullableUpdateString(dto.websiteUrl);
    data.websiteUrl = websiteUrl;
    data.websiteDomain = websiteUrl ? extractDomain(websiteUrl) : null;
  }
  if (hasOwn(dto, "country")) data.country = nullableUpdateString(dto.country);
  if (hasOwn(dto, "language")) data.language = nullableUpdateString(dto.language);
  if (hasOwn(dto, "timezone")) data.timezone = nullableUpdateString(dto.timezone);
  if (hasOwn(dto, "currency")) data.currency = nullableUpdateString(dto.currency);
  if (dto.tags !== undefined) data.tags = dto.tags;
  if (hasOwn(dto, "notes")) data.notes = nullableUpdateString(dto.notes);

  return data;
}

function hasOwn<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nullableUpdateString(value: string | undefined | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return !trimmed || trimmed === "{}" ? null : trimmed;
}

function buildContactCreateData(dto: CreateContactDto) {
  return {
    name: dto.name,
    title: dto.title,
    department: dto.department,
    email: dto.email,
    phone: dto.phone,
    linkedinUrl: dto.linkedinUrl,
    sourceUrl: dto.sourceUrl,
    qualityScore: dto.qualityScore ?? 0,
    isDecisionMaker: dto.isDecisionMaker ?? false
  };
}

function buildContactUpdateData(dto: UpdateContactDto) {
  const data: {
    name?: string | null;
    title?: string | null;
    department?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    sourceUrl?: string | null;
    qualityScore?: number;
    isDecisionMaker?: boolean;
  } = {};

  if (hasOwn(dto, "name")) data.name = nullableUpdateString(dto.name);
  if (hasOwn(dto, "title")) data.title = nullableUpdateString(dto.title);
  if (hasOwn(dto, "department")) data.department = nullableUpdateString(dto.department);
  if (hasOwn(dto, "email")) data.email = nullableUpdateString(dto.email);
  if (hasOwn(dto, "phone")) data.phone = nullableUpdateString(dto.phone);
  if (hasOwn(dto, "linkedinUrl")) data.linkedinUrl = nullableUpdateString(dto.linkedinUrl);
  if (hasOwn(dto, "sourceUrl")) data.sourceUrl = nullableUpdateString(dto.sourceUrl);
  if (dto.qualityScore !== undefined) data.qualityScore = dto.qualityScore;
  if (dto.isDecisionMaker !== undefined) data.isDecisionMaker = dto.isDecisionMaker;

  return data;
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
