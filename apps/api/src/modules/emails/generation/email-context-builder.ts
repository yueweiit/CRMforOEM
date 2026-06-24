import { Injectable, NotFoundException } from "@nestjs/common";
import { normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { GenerateEmailDraftDto } from "../dto/generate-email-draft.dto";
import type { EmailGenerationContext } from "./types";

@Injectable()
export class EmailContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(user: RequestUser, customerId: string, dto: GenerateEmailDraftDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) },
      include: {
        owner: { select: { id: true, name: true, email: true, title: true } },
        source: { select: { name: true } },
        type: { select: { name: true } }
      }
    });
    if (!customer) throw new NotFoundException("Customer not found");

    const [contacts, websiteAnalysis, researchReport, oemFitScore, companyProfile] = await Promise.all([
      this.prisma.contact.findMany({ where: { customerId }, orderBy: [{ isDecisionMaker: "desc" }, { qualityScore: "desc" }] }),
      this.prisma.websiteAnalysis.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.researchReport.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.oemFitScore.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      this.prisma.companyProfile.findFirst({
        where: { organizationId: user.organizationId },
        include: { capabilities: true, products: true, certificates: true, caseStudies: true, emailMaterials: true }
      })
    ]);

    return {
      purpose: normalizeEmailDraftPurpose(dto.purpose),
      customer,
      bestContact: contacts[0],
      contacts,
      websiteAnalysis,
      researchReport,
      oemFitScore,
      companyProfile,
      userInstructions: dto.userInstructions
    };
  }
}

export type ContextBuildResult = Awaited<ReturnType<EmailContextBuilder["build"]>>;

export function assembleGenerationContext(params: {
  purpose: string;
  customer: {
    name: string; websiteUrl?: string | null; websiteDomain?: string | null;
    country?: string | null; language?: string | null; stage: string; riskLevel: string;
    tags: string[]; notes?: string | null;
    owner?: { id: string; name?: string | null; email?: string | null; title?: string | null } | null;
    source?: { name: string } | null;
    type?: { name: string } | null;
  };
  selectedContact?: {
    name?: string | null; title?: string | null; department?: string | null;
    email?: string | null; isDecisionMaker?: boolean;
  };
  responsibleOwner: { id: string; name?: string | null; email?: string | null } | null;
  websiteAnalysis?: { productCategories?: unknown; productCount?: number | null; pricePositioning?: string | null; websiteCompleteness?: number | null; imageStyle?: string | null; missingCategories?: unknown; opportunities?: unknown; risks?: unknown } | null;
  researchReport?: { title?: string; finalMarkdown?: string | null; searchEnabled?: boolean } | null;
  oemFitScore?: { score?: number; grade?: string; recommendedProducts?: unknown; developmentStrategy?: unknown; emailEntryPoints?: unknown; opportunities?: unknown; risks?: unknown; nextActions?: unknown } | null;
  companyProfile?: {
    displayName?: string; legalName?: string; summary?: string | null; markets?: string[];
    productionScale?: string | null; factoryAddress?: string | null;
    capabilities?: Array<{ name: string; category: string; description?: string | null; moq?: string | null; leadTime?: string | null; certifications?: string[] }>;
    products?: Array<{ name: string; category: string; description?: string | null; material?: string | null; tags?: string[] }>;
    certificates?: Array<{ name: string; certType: string; issuer?: string | null }>;
    caseStudies?: Array<{ title: string; market?: string | null; category?: string | null; summary: string; result?: string | null }>;
    emailMaterials?: Array<{ name: string; materialType: string; content: string; tags?: string[] }>;
  } | null;
  userInstructions?: string;
}): EmailGenerationContext {
  const intendedRecipient = params.selectedContact?.email
    ? { email: params.selectedContact.email, name: params.selectedContact.name, title: params.selectedContact.title, department: params.selectedContact.department, isDecisionMaker: params.selectedContact.isDecisionMaker }
    : { email: "" };

  const customerInsights: EmailGenerationContext["customerInsights"] = {};

  if (params.websiteAnalysis) {
    const wa = params.websiteAnalysis;
    customerInsights.websiteAnalysis = { productCategories: wa.productCategories, productCount: wa.productCount, pricePositioning: wa.pricePositioning, websiteCompleteness: wa.websiteCompleteness, imageStyle: wa.imageStyle, missingCategories: wa.missingCategories, opportunities: wa.opportunities, risks: wa.risks };
  }
  if (params.researchReport) {
    const rr = params.researchReport;
    customerInsights.researchReport = { title: rr.title, markdownExcerpt: (rr.finalMarkdown ?? "").slice(0, 1500), searchEnabled: rr.searchEnabled };
  }
  if (params.oemFitScore) {
    const oem = params.oemFitScore;
    customerInsights.oemFit = { score: oem.score, grade: oem.grade, recommendedProducts: oem.recommendedProducts, developmentStrategy: oem.developmentStrategy, emailEntryPoints: oem.emailEntryPoints, opportunities: oem.opportunities, risks: oem.risks, nextActions: oem.nextActions };
  }

  return {
    purpose: params.purpose,
    intendedRecipient,
    responsibleOwner: params.responsibleOwner ? { id: params.responsibleOwner.id, name: params.responsibleOwner.name, email: params.responsibleOwner.email } : null,
    customer: { name: params.customer.name, sourceName: params.customer.source?.name, typeName: params.customer.type?.name, websiteUrl: params.customer.websiteUrl, websiteDomain: params.customer.websiteDomain, country: params.customer.country, language: params.customer.language, stage: params.customer.stage, riskLevel: params.customer.riskLevel, tags: params.customer.tags, notes: params.customer.notes },
    customerInsights,
    ourCompany: params.companyProfile ? { displayName: params.companyProfile.displayName, legalName: params.companyProfile.legalName, summary: params.companyProfile.summary, markets: params.companyProfile.markets, productionScale: params.companyProfile.productionScale, factoryAddress: params.companyProfile.factoryAddress, capabilities: pickDiverseByCategory(params.companyProfile.capabilities, 8), products: pickDiverseByCategory(params.companyProfile.products, 8), certificates: (params.companyProfile.certificates ?? []).slice(0, 5), caseStudies: (params.companyProfile.caseStudies ?? []).slice(0, 5), emailMaterials: (params.companyProfile.emailMaterials ?? []).slice(0, 10) } : null,
    userInstructions: params.userInstructions
  };
}

function pickDiverseByCategory<T extends { category?: string }>(items: T[] | undefined, limit: number): T[] {
  if (!items || items.length === 0) return [];
  if (items.length <= limit) return items;
  const seen = new Set<string>();
  const result: T[] = [];
  const remainder: T[] = [];
  for (const item of items) {
    const cat = item.category ?? "";
    if (!seen.has(cat)) { seen.add(cat); result.push(item); if (result.length >= limit) return result; }
    else { remainder.push(item); }
  }
  for (const item of remainder) { if (result.length >= limit) break; result.push(item); }
  return result;
}
