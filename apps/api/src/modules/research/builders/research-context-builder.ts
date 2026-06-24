import { Injectable } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { SearchProviderService } from "../services/search-provider.service";

export type ResearchContextLike = {
  customer: {
    name: string;
    websiteUrl?: string | null;
    country?: string | null;
    language?: string | null;
    typeName?: string | null;
    sourceName?: string | null;
  };
  contacts?: Array<{ name?: string | null; title?: string | null; email?: string | null; qualityScore?: number | null }>;
  websiteSummary?: {
    status?: string; productCount?: number | null; pricePositioning?: string | null;
    websiteCompleteness?: number | null; productCategories?: unknown;
    pages?: Array<{ url: string; pageType: string; title?: string | null; textSummary?: string | null }>;
  } | null;
  websiteInsights?: Record<string, unknown> | null;
  companyKnowledge?: {
    products?: Array<{ name: string; category: string; description?: string | null; tags?: string[] }>;
    capabilities?: Array<{ name: string; category: string; description?: string | null }>;
    caseStudies?: Array<{ title: string; market?: string | null; category?: string | null; summary: string }>;
  };
  publicSearch: { warning?: string; enabled?: boolean; results?: Array<{ title?: string; url?: string; snippet?: string }> };
  sourceEvidence?: { websiteAnalysisStatus?: string | null; searchWarning?: string | null; contactCount?: number };
};

@Injectable()
export class ResearchContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchProvider: SearchProviderService
  ) {}

  async build(organizationId: string, customerId: string, salesNotes?: string) {
    const [customer, websiteAnalysis, companyProfiles, contacts] = await Promise.all([
      this.prisma.customer.findFirstOrThrow({
        where: { id: customerId, organizationId },
        include: { source: true, type: true }
      }),
      this.prisma.websiteAnalysis.findFirst({
        where: { customerId }, orderBy: { createdAt: "desc" },
        include: { pages: true, products: true }
      }),
      this.prisma.companyProfile.findMany({
        where: { organizationId },
        include: { capabilities: true, products: { take: 80 }, caseStudies: true }
      }),
      this.prisma.contact.findMany({ where: { customerId } })
    ]);

    const publicSearch = await this.searchProvider.searchCustomer({
      name: customer.name,
      websiteUrl: customer.websiteUrl,
      country: customer.country
    });

    const rawResult = asRecord(websiteAnalysis?.rawResult);
    const aiInsights = asRecord(rawResult.aiInsights);
    const websiteInsights = Object.keys(aiInsights).length
      ? {
          businessSummary: aiInsights.business_summary,
          customerProfile: aiInsights.customer_profile,
          mainBusiness: aiInsights.main_business,
          productLineAnalysis: aiInsights.product_line_analysis,
          brandPositioning: aiInsights.brand_positioning,
          marketChannelSignals: aiInsights.market_channel_signals,
          priceCompetitiveness: aiInsights.price_competitiveness,
          missingCategoriesGap: aiInsights.missing_categories_gap,
          unknownFactors: aiInsights.unknown_factors,
          evidencePages: aiInsights.evidence_pages
        }
      : null;

    const allProducts = companyProfiles.flatMap((p) => p.products);
    const allCapabilities = companyProfiles.flatMap((p) => p.capabilities);
    const allCaseStudies = companyProfiles.flatMap((p) => p.caseStudies);

    return {
      promptVersion: "research-report-v4",
      companyKnowledge: {
        products: allProducts
          .map((p) => ({ name: p.name, category: p.category, description: p.description, tags: p.tags }))
          .sort(byCategoryThenName).slice(0, 50),
        capabilities: allCapabilities
          .map((c) => ({ name: c.name, category: c.category, description: c.description }))
          .sort(byCategoryThenName).slice(0, 20),
        caseStudies: allCaseStudies
          .map((c) => ({ title: c.title, market: c.market, category: c.category, summary: c.summary }))
          .sort(byMarketThenCategoryThenTitle).slice(0, 10)
      },
      customer: {
        name: customer.name, websiteUrl: customer.websiteUrl, country: customer.country,
        language: customer.language, typeName: customer.type?.name ?? null, sourceName: customer.source?.name ?? null
      },
      contacts: contacts
        .map((c) => ({ name: c.name, title: c.title, email: c.email, qualityScore: c.qualityScore }))
        .sort(byQualityScoreDescThenEmail),
      websiteSummary: websiteAnalysis
        ? {
            status: websiteAnalysis.status, productCount: websiteAnalysis.productCount,
            pricePositioning: websiteAnalysis.pricePositioning,
            websiteCompleteness: websiteAnalysis.websiteCompleteness,
            productCategories: websiteAnalysis.productCategories,
            pages: websiteAnalysis.pages
              .filter((p) => !p.errorMessage)
              .map((p) => ({ url: p.url, pageType: p.pageType, title: p.title, textSummary: p.textSummary }))
              .sort(byPageTypeThenUrl)
          }
        : null,
      websiteInsights,
      publicSearch: {
        enabled: publicSearch.enabled, warning: publicSearch.warning,
        results: (publicSearch.results ?? [])
          .slice(0, 8)
          .map((r) => ({ title: r.title, url: r.url, snippet: (r as { snippet?: string }).snippet }))
          .sort(byUrl)
      },
      salesNotes,
      sourceEvidence: {
        websiteAnalysisStatus: websiteAnalysis?.status ?? null,
        searchWarning: publicSearch.warning ?? null,
        contactCount: contacts.length
      }
    };
  }
}

// ── Sort helpers ──

function byCategoryThenName(a: { category?: string | null; name?: string | null }, b: { category?: string | null; name?: string | null }) {
  const ca = a.category ?? ""; const cb = b.category ?? "";
  if (ca !== cb) return ca.localeCompare(cb);
  return (a.name ?? "").localeCompare(b.name ?? "");
}

function byMarketThenCategoryThenTitle(a: { market?: string | null; category?: string | null; title?: string | null }, b: { market?: string | null; category?: string | null; title?: string | null }) {
  const ma = a.market ?? ""; const mb = b.market ?? "";
  if (ma !== mb) return ma.localeCompare(mb);
  return byCategoryThenName({ name: a.title, category: a.category }, { name: b.title, category: b.category });
}

function byQualityScoreDescThenEmail(a: { qualityScore?: number | null; email?: string | null }, b: { qualityScore?: number | null; email?: string | null }) {
  const sb = b.qualityScore ?? 0; const sa = a.qualityScore ?? 0;
  if (sa !== sb) return sb - sa;
  return (a.email ?? "").localeCompare(b.email ?? "");
}

function byPageTypeThenUrl(a: { pageType?: string | null; url?: string | null }, b: { pageType?: string | null; url?: string | null }) {
  const pa = a.pageType ?? ""; const pb = b.pageType ?? "";
  if (pa !== pb) return pa.localeCompare(pb);
  return (a.url ?? "").localeCompare(b.url ?? "");
}

function byUrl(a: { url?: string | null }, b: { url?: string | null }) {
  return (a.url ?? "").localeCompare(b.url ?? "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
