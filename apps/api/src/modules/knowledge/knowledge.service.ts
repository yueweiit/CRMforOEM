import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { UpsertKnowledgeDto } from "./dto/upsert-knowledge.dto";

const ENTITY_MODEL_MAP = {
  brands:             "brand",
  products:           "product",
  "oem-capabilities": "oemCapability",
  certificates:       "certificate",
  "case-studies":     "caseStudy",
  "email-materials":  "emailMaterial"
} as const;

type EntityKey = keyof typeof ENTITY_MODEL_MAP;

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  getCompanyProfile(user: RequestUser) {
    return this.prisma.companyProfile.findFirst({
      where: { organizationId: user.organizationId },
      include: {
        brands: true,
        capabilities: true,
        products: true,
        certificates: true,
        caseStudies: true,
        emailMaterials: true
      }
    });
  }

  async upsertCompanyProfile(user: RequestUser, dto: UpsertKnowledgeDto) {
    const existing = await this.prisma.companyProfile.findFirst({
      where: { organizationId: user.organizationId }
    });
    if (!existing) {
      return this.prisma.companyProfile.create({
        data: {
          organizationId: user.organizationId,
          legalName: dto.legalName ?? dto.name ?? "Company",
          displayName: dto.displayName ?? dto.name ?? "Company",
          websiteUrl: dto.websiteUrl,
          summary: dto.summary,
          markets: dto.markets ?? [],
          foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : undefined,
          factoryAddress: dto.factoryAddress,
          productionScale: dto.productionScale
        }
      });
    }
    return this.prisma.companyProfile.update({
      where: { id: existing.id },
      data: pickDefined({
        legalName: dto.legalName,
        displayName: dto.displayName,
        websiteUrl: dto.websiteUrl,
        summary: dto.summary,
        markets: dto.markets,
        foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : undefined,
        factoryAddress: dto.factoryAddress,
        productionScale: dto.productionScale
      }) as never
    });
  }

  async listBrands(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.brand.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createBrand(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.brand.create({
      data: {
        companyProfileId: profile.id,
        name: requireField(dto.name, "name"),
        positioning: dto.positioning,
        websiteUrl: dto.websiteUrl,
        competitiveAdvantage: dto.competitiveAdvantage,
        targetMarkets: dto.targetMarkets ?? []
      }
    });
  }

  async listProducts(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.product.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createProduct(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.product.create({
      data: {
        companyProfileId: profile.id,
        sku: dto.sku,
        name: requireField(dto.name, "name"),
        category: requireField(dto.category, "category"),
        description: dto.description,
        priceMin: dto.priceMin as never,
        priceMax: dto.priceMax as never,
        currency: dto.currency,
        specifications: validateSpec(dto.specifications) as never,
        material: dto.material,
        targetMarkets: dto.targetMarkets ?? [],
        imageAssetIds: dto.imageAssetIds ?? [],
        tags: dto.tags ?? []
      }
    });
  }

  async listCapabilities(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.oemCapability.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createCapability(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.oemCapability.create({
      data: {
        companyProfileId: profile.id,
        name: requireField(dto.name, "name"),
        category: requireField(dto.category, "category"),
        description: dto.description,
        moq: dto.moq,
        leadTime: dto.leadTime,
        certifications: dto.certifications ?? [],
        packagingCustomization: dto.packagingCustomization,
        supportedMarkets: dto.supportedMarkets ?? []
      }
    });
  }

  async listCertificates(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.certificate.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createCertificate(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.certificate.create({
      data: {
        companyProfileId: profile.id,
        name: requireField(dto.name, "name"),
        certType: requireField(dto.certType, "certType"),
        issuer: dto.issuer,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        description: dto.description,
        fileAssetIds: dto.fileAssetIds ?? []
      } as never
    });
  }

  async listCaseStudies(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.caseStudy.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createCaseStudy(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.caseStudy.create({
      data: {
        companyProfileId: profile.id,
        title: requireField(dto.title ?? dto.name, "title"),
        clientName: dto.clientName,
        cooperationDate: dto.cooperationDate ? new Date(dto.cooperationDate) : undefined,
        market: dto.market,
        category: dto.category,
        summary: requireField(dto.summary, "summary"),
        result: dto.result,
        fileAssetIds: dto.fileAssetIds ?? []
      }
    });
  }

  async listEmailMaterials(user: RequestUser) {
    const profile = await this.ensureProfile(user);
    return this.prisma.emailMaterial.findMany({ where: { companyProfileId: profile.id }, orderBy: { updatedAt: "desc" } });
  }

  async createEmailMaterial(user: RequestUser, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    return this.prisma.emailMaterial.create({
      data: {
        companyProfileId: profile.id,
        name: requireField(dto.name, "name"),
        materialType: requireField(dto.materialType, "materialType"),
        content: requireField(dto.content, "content"),
        tags: dto.tags ?? []
      }
    });
  }

  async updateEntity(user: RequestUser, entity: string, id: string, dto: UpsertKnowledgeDto) {
    const profile = await this.ensureProfile(user);
    const where = { id, companyProfileId: profile.id };
    switch (entity) {
      case "brands": {
        const existing = await this.prisma.brand.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.brand.update({ where: { id }, data: pickDefined({
          name: dto.name,
          positioning: dto.positioning,
          websiteUrl: dto.websiteUrl,
          competitiveAdvantage: dto.competitiveAdvantage,
          targetMarkets: dto.targetMarkets
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "brands", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      case "products": {
        const existing = await this.prisma.product.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.product.update({ where: { id }, data: pickDefined({
          sku: dto.sku,
          name: dto.name,
          category: dto.category,
          description: dto.description,
          specifications: validateSpec(dto.specifications) as never,
          material: dto.material,
          targetMarkets: dto.targetMarkets,
          imageAssetIds: dto.imageAssetIds,
          priceMin: dto.priceMin,
          priceMax: dto.priceMax,
          currency: dto.currency,
          tags: dto.tags
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "products", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      case "oem-capabilities": {
        const existing = await this.prisma.oemCapability.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.oemCapability.update({ where: { id }, data: pickDefined({
          name: dto.name,
          category: dto.category,
          description: dto.description,
          moq: dto.moq,
          leadTime: dto.leadTime,
          packagingCustomization: dto.packagingCustomization,
          certifications: dto.certifications,
          supportedMarkets: dto.supportedMarkets
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "oem-capabilities", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      case "certificates": {
        const existing = await this.prisma.certificate.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.certificate.update({ where: { id }, data: pickDefined({
          name: dto.name,
          certType: dto.certType,
          issuer: dto.issuer,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          description: dto.description,
          fileAssetIds: dto.fileAssetIds
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "certificates", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      case "case-studies": {
        const existing = await this.prisma.caseStudy.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.caseStudy.update({ where: { id }, data: pickDefined({
          title: dto.title ?? dto.name,
          clientName: dto.clientName,
          cooperationDate: dto.cooperationDate ? new Date(dto.cooperationDate) : undefined,
          market: dto.market,
          category: dto.category,
          summary: dto.summary,
          result: dto.result,
          fileAssetIds: dto.fileAssetIds
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "case-studies", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      case "email-materials": {
        const existing = await this.prisma.emailMaterial.findFirst({ where });
        await this.ensureExists(Promise.resolve(existing));
        const beforeSnapshot = JSON.parse(JSON.stringify(existing));
        const result = await this.prisma.emailMaterial.update({ where: { id }, data: pickDefined({
          name: dto.name,
          materialType: dto.materialType,
          content: dto.content,
          tags: dto.tags
        }) as never });
        await this.audit({ user, action: "UPDATE", entityType: "email-materials", entityId: id, before: beforeSnapshot, after: result });
        return result;
      }
      default:
        throw new BadRequestException("Unsupported knowledge entity");
    }
  }

  async deleteEntity(user: RequestUser, entity: string, id: string) {
    const profile = await this.ensureProfile(user);

    const modelName = ENTITY_MODEL_MAP[entity as EntityKey];
    if (!modelName) {
      throw new BadRequestException("Unsupported knowledge entity");
    }

    const model = this.prisma[modelName] as {
      findFirst: (args: unknown) => Promise<unknown>;
      delete:    (args: unknown) => Promise<unknown>;
    };

    const where = { id, companyProfileId: profile.id };
    const existing = await model.findFirst({ where });
    await this.ensureExists(Promise.resolve(existing));

    const snapshot = JSON.parse(JSON.stringify(existing));
    const result = await model.delete({ where: { id } });

    await this.audit({ user, action: "DELETE", entityType: entity, entityId: id, before: snapshot });

    return result;
  }

  private async ensureProfile(user: RequestUser) {
    const profile = await this.prisma.companyProfile.findFirst({ where: { organizationId: user.organizationId } });
    if (!profile) {
      throw new NotFoundException("Company profile must be created first");
    }
    return profile;
  }

  private async ensureExists<T>(promise: Promise<T | null>) {
    const entity = await promise;
    if (!entity) {
      throw new NotFoundException("Knowledge entity not found");
    }
  }

  private async audit(params: {
    user: RequestUser;
    action: AuditAction;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: params.user.organizationId,
          actorId: params.user.id,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          before: (params.before ?? null) as never,
          after: (params.after ?? null) as never,
          ipAddress: null,
          userAgent: null
        }
      });
    } catch (err) {
      console.warn(`[Audit] Failed to write audit log: ${(err as Error).message}`);
    }
  }
}

function requireField(value: string | undefined, field: string) {
  if (!value) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function pickDefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function validateSpec(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("specifications must be a JSON object");
  }
  return value as Record<string, unknown>;
}
