export type CustomerDetail = {
  id: string;
  name: string;
  websiteUrl?: string;
  websiteDomain?: string;
  country?: string;
  language?: string;
  timezone?: string;
  currency?: string;
  stage: string;
  riskLevel: string;
  tags: string[];
  notes?: string;
  owner?: { id: string; name: string; email: string };
  source?: { id: string; name: string };
  type?: { id: string; name: string };
  contacts: Contact[];
  websiteAnalyses: WebsiteAnalysis[];
  researchReports: ResearchReport[];
  oemFitScores: OemScore[];
  followUpTasks: FollowUpTask[];
};

export type Contact = {
  id: string;
  name?: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  sourceUrl?: string;
  qualityScore: number;
  isDecisionMaker: boolean;
};
export type WebsiteAnalysis = Record<string, unknown> & {
  id: string;
  status: string;
  homePageTitle?: string;
  detectedLanguage?: string;
  websiteCompleteness?: number;
  pricePositioning?: string;
  crawledUrls?: string[];
  contactEvidence?: unknown[];
  productCategories?: unknown[];
  productCount?: number;
  pages?: WebsiteAnalysisPage[];
  products?: WebsiteAnalysisProduct[];
  priceRange?: unknown;
  imageStyle?: string;
  missingCategories?: unknown[];
  opportunities?: unknown[];
  risks?: unknown[];
  rawResult?: unknown;
  errorMessage?: string;
  createdAt: string;
};
export type WebsiteAnalysisHistoryItem = Pick<
  WebsiteAnalysis,
  "id" | "status" | "createdAt" | "homePageTitle" | "websiteCompleteness" | "productCount" | "pricePositioning" | "errorMessage"
> & Partial<WebsiteAnalysis>;
export type WebsiteAiInsights = {
  business_summary?: string;
  customer_profile?: string;
  main_business?: string;
  product_line_analysis?: string;
  brand_positioning?: string;
  market_channel_signals?: string;
  oem_opportunity_assessment?: string;
  cooperation_opportunities?: string[];
  sales_entry_points?: string[];
  suggested_next_actions?: string[];
  risk_notes?: string[];
  evidence_pages?: Array<{ sourceId?: string; title?: string; url?: string; reason?: string }>;
  missing_categories_gap?: Array<{
    category: string;
    customer_has: string;
    we_can_supply: string;
    opportunity_score: number;
    reason: string;
    data_quality_note: string;
  }>;
  price_competitiveness?: {
    level: "competitive" | "neutral" | "challenging" | "unknown";
    summary: string;
    price_nature_note: string;
  };
  unknown_factors?: string[];
  our_data_quality_note?: string;
};
export type WebsiteAnalysisPage = { id?: string; url: string; pageType: string; title?: string; textSummary?: string; headings?: unknown[]; contacts?: unknown[]; depth?: number; errorMessage?: string };
export type WebsiteAnalysisProduct = { id?: string; name: string; category?: string; description?: string; keywords?: string[]; evidenceUrls?: string[]; imageUrls?: string[]; priceSignals?: unknown; confidence?: number };
export type ResearchReport = {
  id: string;
  title: string;
  status: string;
  finalMarkdown?: string;
  reportJson?: unknown;
  sourceEvidence?: unknown;
  searchEnabled?: boolean;
  errorMessage?: string;
  aiGenerationRun?: AiRun;
  createdAt: string;
};
export type ResearchReportHistoryItem = Pick<
  ResearchReport,
  "id" | "title" | "status" | "searchEnabled" | "errorMessage" | "createdAt"
> & Partial<ResearchReport>;
export type OemScore = {
  id: string;
  score: number;
  grade: string;
  breakdown: Record<string, number>;
  weights?: Record<string, number>;
  dimensionDetails?: unknown;
  recommendedProducts?: unknown;
  developmentStrategy?: unknown;
  emailEntryPoints?: unknown;
  opportunities?: unknown;
  risks?: unknown;
  nextActions?: unknown;
  explanation?: string;
  aiGenerationRun?: AiRun;
  createdAt: string;
};
export type OemScoreHistoryItem = Pick<OemScore, "id" | "score" | "grade" | "createdAt"> & Partial<OemScore>;
export type AiRun = { versions?: Array<{ id: string; versionType: string; content: string; createdAt: string; editReason?: string }> };
export type FollowUpTask = { id: string; title: string; status: string; dueAt: string; type: string };
export type EmailDraft = { id: string; purpose?: string; subject: string; body: string; toEmail: string; toNameSnapshot?: string; fromEmailSnapshot?: string; fromNameSnapshot?: string; status: string; emailAccountId?: string; emailAccount?: EmailAccount; customer?: { name: string }; aiGenerationRun?: AiRun; updatedAt: string };
export type EmailThread = { id: string; subject: string; lastMessageAt?: string; messages?: Array<{ subject: string; direction: string; status: string; createdAt: string }> };
export type EmailAccount = { id: string; name: string; email: string; scope?: string };
export type Quote = { id: string; quoteNo: string; amount: string; currency: string; status: string; createdAt: string };
export type Sample = { id: string; productSummary: string; status: string; trackingNo?: string; createdAt: string };
export type CustomerBackgroundTaskView = {
  id: string;
  type: "WEBSITE_ANALYSIS" | "RESEARCH_REPORT" | "OEM_FIT_SCORE" | "EMAIL_DRAFT";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  title: string;
  customerId: string;
  businessEntityId: string;
  aiGenerationRunId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
};

export type CustomerBackgroundTasksResponse = {
  active: CustomerBackgroundTaskView[];
  recent: CustomerBackgroundTaskView[];
};

export type AcceptedResponse<T> =
  | { accepted: true } & T
  | { accepted: false; reason: string; existing: unknown };

export type MarkdownBlock =
  | { type: "h1" | "h2" | "h3" | "quote" | "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] };
