export type EmailGenerationContext = {
  purpose: string;

  intendedRecipient: {
    email: string;
    name?: string | null;
    title?: string | null;
    department?: string | null;
    isDecisionMaker?: boolean;
  };

  responsibleOwner: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;

  customer: {
    name: string;
    sourceName?: string | null;
    typeName?: string | null;
    websiteUrl?: string | null;
    websiteDomain?: string | null;
    country?: string | null;
    language?: string | null;
    stage?: string;
    riskLevel?: string;
    tags?: string[];
    notes?: string | null;
  };

  customerInsights: {
    websiteAnalysis?: {
      productCategories?: unknown;
      productCount?: number | null;
      pricePositioning?: string | null;
      websiteCompleteness?: number | null;
      imageStyle?: string | null;
      missingCategories?: unknown;
      opportunities?: unknown;
      risks?: unknown;
    } | null;
    researchReport?: {
      title?: string;
      markdownExcerpt?: string;
      searchEnabled?: boolean;
    } | null;
    oemFit?: {
      score?: number;
      grade?: string;
      recommendedProducts?: unknown;
      developmentStrategy?: unknown;
      emailEntryPoints?: unknown;
      opportunities?: unknown;
      risks?: unknown;
      nextActions?: unknown;
    } | null;
  };

  ourCompany: {
    displayName?: string;
    legalName?: string;
    summary?: string | null;
    markets?: string[];
    productionScale?: string | null;
    factoryAddress?: string | null;
    capabilities?: Array<{
      name: string;
      category: string;
      description?: string | null;
      moq?: string | null;
      leadTime?: string | null;
      certifications?: string[];
    }>;
    products?: Array<{
      name: string;
      category: string;
      description?: string | null;
      material?: string | null;
      tags?: string[];
    }>;
    certificates?: Array<{
      name: string;
      certType: string;
      issuer?: string | null;
    }>;
    caseStudies?: Array<{
      title: string;
      market?: string | null;
      category?: string | null;
      summary: string;
      result?: string | null;
    }>;
    emailMaterials?: Array<{
      name: string;
      materialType: string;
      content: string;
      tags?: string[];
    }>;
  } | null;

  userInstructions?: string;
};
