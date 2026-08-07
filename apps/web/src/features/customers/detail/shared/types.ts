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
  reportJson?: ResearchReportJson;
  sourceEvidence?: unknown;
  searchEnabled?: boolean;
  errorMessage?: string;
  aiGenerationRun?: AiRun;
  createdAt: string;
};
export type ResearchReportSection = Record<string, string | string[] | undefined> & {
  confirmed_facts?: string[];
  analysis?: string;
  missing_info?: string[];
};
export type ResearchReportJson = Record<string, unknown> & {
  title?: string;
  sections?: Record<string, ResearchReportSection>;
  source_basis?: unknown;
  sourceEvidence?: unknown;
  aiMeta?: unknown;
  summaryPipeline?: unknown;
  markdown_report?: string;
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
  aiScore?: number;
  aiGrade?: string;
  aiBreakdown?: Record<string, number>;
  manualScore?: number;
  manualGrade?: string;
  manualBreakdown?: Record<string, number>;
  manualNotes?: string;
  manualUpdatedById?: string;
  manualUpdatedAt?: string;
  createdAt: string;
};
export type OemScoreHistoryItem = Pick<OemScore, "id" | "score" | "grade" | "createdAt"> & Partial<OemScore>;
export type AiRun = { id?: string; status?: string; versions?: Array<{ id: string; versionType: string; content: string; createdAt: string; editReason?: string }> };
export type FollowUpTask = { id: string; title: string; status: string; dueAt: string; type: string };
export type EmailDraft = { id: string; quoteId?: string; quoteSnapshot?: { quoteNo?: string; productName?: string; currency?: string; amount?: string }; purpose?: string; subject: string; body: string; toEmail: string; toNameSnapshot?: string; fromEmailSnapshot?: string; fromNameSnapshot?: string; status: string; emailAccountId?: string; emailAccount?: EmailAccount; customer?: { id?: string; name: string }; aiGenerationRun?: AiRun; updatedAt: string };
export type EmailDraftListItem = Omit<EmailDraft, "body"> & { body?: never };
export type EmailDraftPage = { items: EmailDraftListItem[]; nextCursor?: string | null };
export type EmailThread = { id: string; subject: string; lastMessageAt?: string; messages?: Array<{ subject: string; direction: string; status: string; createdAt: string }> };
export type EmailAccount = { id: string; name: string; email: string; scope?: string };
export type QuoteReplyAssessment = {
  id: string;
  intent: "ACCEPT" | "REJECT" | "NEGOTIATE" | "QUESTION" | "UNCERTAIN";
  confidence: number;
  evidence: string;
  reason: string;
  status: string;
  createdAt: string;
  quote: { id: string; quoteNo: string; productName: string; currency: string; amount: string; status: string; customerId: string };
  inboundEmailMessage: { id: string; fromEmail: string; subject: string; receivedAt?: string; bodyText?: string };
};
export type Quote = {
  id: string;
  revisionGroupId: string;
  previousRevisionId?: string | null;
  revisionNo: number;
  revisionReason?: string | null;
  revisedById?: string | null;
  revisedAt?: string | null;
  revisionGroup?: { id: string; baseQuoteNo: string };
  previousRevision?: QuoteRevisionSummary | null;
  nextRevision?: QuoteRevisionSummary | null;
  quoteNo: string;
  amount: string;
  productName: string;
  specification?: string | null;
  moq: number;
  quantity: number;
  unitPrice: string;
  materialCost: string;
  processingCost: string;
  taxCost: string;
  shippingCost: string;
  discountAmount: string;
  calcMode: string;
  materialItems?: Array<{ name?: string | null; usage?: number | string | null; unitPrice?: number | string | null; lossRate?: number | string | null }> | null;
  materialProfitRate?: string | null;
  processingTime?: string | null;
  processingHourlyRate?: string | null;
  processingProfitRate?: string | null;
  grossWeight?: string | null;
  packageLength?: string | null;
  packageWidth?: string | null;
  packageHeight?: string | null;
  volumeDivisor?: string | null;
  volumeWeight?: string | null;
  shippingUnitPrice?: string | null;
  vatRate?: string | null;
  currency: string;
  status: string;
  approvalStatus: string;
  notes?: string;
  validUntil?: string;
  approvalComment?: string;
  approvalSubmittedAt?: string;
  approvalReviewedAt?: string;
  approvalSubmittedById?: string;
  approvalReviewedById?: string;
  createdAt: string;
  updatedAt: string;
};
export type QuoteRevisionSummary = Pick<Quote, "id" | "quoteNo" | "revisionNo" | "status">;
export type QuoteHistoryItem = {
  id: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  comment?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  createdAt: string;
};
export type SampleLinkedQuote = { id: string; quoteNo: string; productName: string; status: string; approvalStatus: string; amount?: string; currency?: string };
export type SampleFee = { id: string; feeType: string; amount: string; currency: string; note?: string | null; incurredAt: string; createdAt: string; sampleRoundId?: string | null; costNature?: string | null; responsibility?: string | null; paymentStatus?: string | null };
export type SampleRetentionRecord = {
  id: string;
  retainedQuantity: number;
  retainedAt: string;
  retainedLocation: string;
  fileAssetIds?: string[];
};
export type SampleReturnRecord = { id: string; sampleRoundId?: string; dispositionStatus: string; receiverName?: string | null; destination?: string | null; note?: string | null; recordedAt: string; createdAt: string };
export type SampleRound = {
  id: string;
  roundNo: number;
  previousRoundId?: string | null;
  status: string;
  dispositionStatus: string;
  specification?: string | null;
  material?: string | null;
  process?: string | null;
  requestedQuantity?: number | null;
  deliveryDeadline?: string | null;
  fileAssetIds?: string[];
  trackingNo?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  approvedAt?: string | null;
  approvalComment?: string | null;
  producedQuantity?: number | null;
  shippedQuantity?: number | null;
  feedbackResult?: string | null;
  feedback?: string | null;
  feedbackAt?: string | null;
  resampleReason?: string | null;
  changeSummary?: string | null;
  completedAt?: string | null;
  voidedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  fees?: SampleFee[];
  returnRecords?: SampleReturnRecord[];
  retentionRecord?: SampleRetentionRecord | null;
};
export type SampleHistoryItem = {
  id: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  comment?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  createdAt: string;
};
export type Sample = {
  id: string;
  productSummary: string;
  specification?: string | null;
  material?: string | null;
  process?: string | null;
  sampleQuantity?: number | null;
  samplePurpose?: string | null;
  deliveryDeadline?: string | null;
  currentRoundId?: string | null;
  currentAction?: string;
  previousRound?: SampleRound | null;
  currentRound?: SampleRound | null;
  rounds?: SampleRound[];
  quoteId?: string | null;
  quote?: SampleLinkedQuote | null;
  fileAssetIds?: string[];
  terminationReason?: string | null;
  closedAt?: string | null;
  fees?: SampleFee[];
  returnRecords?: SampleReturnRecord[];
  costSummary?: {
    byCurrency: Array<{ currency: string; firstRoundCost: number; resampleCost: number; totalActualCost: number; customerCharge: number; receivedAmount: number; companyBorneAmount: number }>;
    byRound: Array<{ roundId: string | null; roundNo: number | null; currencies: Array<{ currency: string; totalActualCost: number }> }>;
  };
  createdAt: string;
  updatedAt?: string;
};
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
