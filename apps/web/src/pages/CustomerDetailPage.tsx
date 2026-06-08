import { EMAIL_DRAFT_PURPOSES, emailDraftPurposeLabel } from "@oem-crm/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Globe2, MailPlus, NotebookTabs, Star } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api/http";
import { AppSelect } from "../components/AppSelect";
import { showClientToast } from "../components/Toast";
import { formatDraftRecipient as formatEmailDraftRecipient, formatDraftSender as formatEmailDraftSender, sameEmailAddress } from "../utils/email-format";

type CustomerDetail = {
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

type Contact = { id: string; name?: string; title?: string; email?: string; phone?: string; linkedinUrl?: string; qualityScore: number; isDecisionMaker: boolean };
type WebsiteAnalysis = Record<string, unknown> & {
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
type WebsiteAiInsights = {
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
  evidence_pages?: Array<{ title?: string; url?: string; reason?: string }>;
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
type WebsiteAnalysisPage = { id?: string; url: string; pageType: string; title?: string; textSummary?: string; headings?: unknown[]; contacts?: unknown[]; depth?: number; errorMessage?: string };
type WebsiteAnalysisProduct = { id?: string; name: string; category?: string; description?: string; keywords?: string[]; evidenceUrls?: string[]; imageUrls?: string[]; priceSignals?: unknown; confidence?: number };
type ResearchReport = {
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
type OemScore = {
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
type AiRun = { versions?: Array<{ id: string; versionType: string; content: string; createdAt: string; editReason?: string }> };
type FollowUpTask = { id: string; title: string; status: string; dueAt: string; type: string };
type EmailDraft = { id: string; purpose?: string; subject: string; body: string; toEmail: string; toNameSnapshot?: string; fromEmailSnapshot?: string; fromNameSnapshot?: string; status: string; emailAccountId?: string; emailAccount?: EmailAccount; customer?: { name: string }; aiGenerationRun?: AiRun; updatedAt: string };
type EmailThread = { id: string; subject: string; lastMessageAt?: string; messages?: Array<{ subject: string; direction: string; status: string; createdAt: string }> };
type EmailAccount = { id: string; name: string; email: string; scope?: string };
type Quote = { id: string; quoteNo: string; amount: string; currency: string; status: string; createdAt: string };
type Sample = { id: string; productSummary: string; status: string; trackingNo?: string; createdAt: string };
type CustomerOptions = {
  sources: Array<{ id: string; name: string }>;
  types: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  stages: string[];
};

const tabs = [
  { to: "overview", label: "概览", icon: NotebookTabs },
  { to: "website-analysis", label: "官网分析", icon: Globe2 },
  { to: "research", label: "背调报告", icon: Bot },
  { to: "oem-score", label: "OEM评分", icon: Star },
  { to: "email", label: "开发邮件", icon: MailPlus },
  { to: "follow-ups", label: "跟进", icon: NotebookTabs },
  { to: "quotes", label: "报价", icon: NotebookTabs },
  { to: "samples", label: "样品", icon: NotebookTabs }
];

export function CustomerDetailPage() {
  const { id = "", tab = "overview" } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiGet<CustomerDetail>(`/customers/${id}`),
    enabled: Boolean(id && localStorage.getItem("accessToken")),
    refetchInterval: (query) => {
      const data = query.state.data as CustomerDetail | undefined;
      const websiteStatus = data?.websiteAnalyses?.[0]?.status;
      const researchStatus = data?.researchReports?.[0]?.status;
      return isPendingStatus(websiteStatus) || isPendingStatus(researchStatus) ? 3000 : false;
    },
    refetchIntervalInBackground: true
  });
  const customer = customerQuery.data;

  const refreshCustomer = () => queryClient.invalidateQueries({ queryKey: ["customer", id] });
  const analyzeMutation = useMutation({
    mutationFn: () => apiPost(`/customers/${id}/website-analyses`),
    onSuccess: () => { setMessage("官网分析任务已提交。请稍后进入“官网分析”页查看结果。"); refreshCustomer(); },
    onError: () => setMessage("官网分析提交失败，请先确认已保存有效官网 URL。")
  });
  const researchMutation = useMutation({
    mutationFn: () => apiPost(`/customers/${id}/research-reports`, {}),
    onSuccess: () => { setMessage("背调任务已提交，系统会在后台整合官网分析、企业资料和公开信息。"); refreshCustomer(); },
    onError: () => setMessage("背调任务提交失败，请刷新后重试。")
  });
  const scoreMutation = useMutation({ mutationFn: () => apiPost(`/customers/${id}/oem-fit-scores`), onSuccess: () => { setMessage("OEM评分已生成。"); refreshCustomer(); } });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{customer?.websiteDomain ?? `Customer #${id}`}</p>
          <h1>{customer?.name ?? "客户详情"}</h1>
        </div>
        <div className="toolbar">
          <button
            className="secondary-button"
            title={customer?.websiteUrl ? "抓取并分析客户官网" : "请先在概览中编辑并保存官网URL"}
            onClick={() => analyzeMutation.mutate()}
            disabled={!customer?.websiteUrl || analyzeMutation.isPending}
          >
            {customer?.websiteUrl ? "官网分析" : "先填写官网"}
          </button>
          <button className="secondary-button" onClick={() => researchMutation.mutate()} disabled={researchMutation.isPending}>生成背调</button>
          <button className="secondary-button" onClick={() => scoreMutation.mutate()} disabled={scoreMutation.isPending}>OEM评分</button>
        </div>
      </header>

      <nav className="tab-bar">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={`/customers/${id}/${item.to}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}>
              <Icon size={15} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {message ? <section className="panel loading-state">{message}</section> : null}
      {customerQuery.isLoading ? <section className="panel empty-state">正在加载客户详情...</section> : null}
      {customerQuery.isError && !customer ? <section className="panel error-state">客户详情加载失败，请重新登录或刷新页面。</section> : null}
      {customerQuery.isError && customer ? <section className="panel error-state">客户详情刷新失败，当前显示的是上一次加载的数据。</section> : null}
      {customer ? <CustomerTab tab={tab} customer={customer} customerId={id} onChanged={refreshCustomer} /> : null}
    </section>
  );
}

function CustomerTab(props: { tab: string; customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  if (props.tab === "website-analysis") return <WebsiteAnalysisPanel customer={props.customer} />;
  if (props.tab === "research") return <ResearchPanel customer={props.customer} />;
  if (props.tab === "oem-score") return <ScorePanel customer={props.customer} />;
  if (props.tab === "email") return <EmailPanel customer={props.customer} customerId={props.customerId} onChanged={props.onChanged} />;
  if (props.tab === "follow-ups") return <FollowUpPanel tasks={props.customer.followUpTasks} />;
  if (props.tab === "quotes") return <QuotePanel customerId={props.customerId} />;
  if (props.tab === "samples") return <SamplePanel customerId={props.customerId} />;
  return <OverviewPanel customer={props.customer} customerId={props.customerId} onChanged={props.onChanged} />;
}

function OverviewPanel({ customer, customerId, onChanged }: { customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(customerToForm(customer));
  const [contact, setContact] = useState(defaultContactForm());
  const { data: options } = useQuery({
    queryKey: ["customer-filter-options"],
    queryFn: () => apiGet<CustomerOptions>("/customers/filter-options")
  });
  useEffect(() => {
    setEditForm(customerToForm(customer));
  }, [customer]);
  const saveCustomer = useMutation({
    mutationFn: async () => {
      await apiPatch(`/customers/${customerId}`, {
        name: editForm.name,
        websiteUrl: editForm.websiteUrl || null,
        country: editForm.country || null,
        language: editForm.language || null,
        timezone: editForm.timezone || null,
        currency: editForm.currency || null,
        sourceId: editForm.sourceId || null,
        typeId: editForm.typeId || null,
        ownerId: editForm.ownerId || null,
        tags: splitList(editForm.tags),
        notes: editForm.notes || null
      });
      if (editForm.stage && editForm.stage !== customer.stage) {
        await apiPost(`/customers/${customerId}/stage`, {
          stage: editForm.stage,
          reason: "Manual update from customer detail"
        });
      }
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onChanged();
    }
  });
  const createContact = useMutation({
    mutationFn: () => apiPost(`/customers/${customerId}/contacts`, { ...contact, qualityScore: Number(contact.qualityScore || 0), isDecisionMaker: contact.isDecisionMaker }),
    onSuccess: () => { setContact(defaultContactForm()); onChanged(); }
  });
  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-title">
          <h2>客户概览</h2>
          <div className="toolbar">
            {isEditing ? (
              <>
                <button className="secondary-button" onClick={() => { setEditForm(customerToForm(customer)); setIsEditing(false); }}>取消</button>
                <button className="primary-button" disabled={!editForm.name || saveCustomer.isPending} onClick={() => saveCustomer.mutate()}>
                  {saveCustomer.isPending ? "保存中..." : "保存客户资料"}
                </button>
              </>
            ) : (
              <button className="secondary-button" onClick={() => setIsEditing(true)}>编辑资料</button>
            )}
          </div>
        </div>
        {saveCustomer.isError ? <div className="error-state">保存失败，请检查字段格式。</div> : null}
        {isEditing ? (
          <div className="form-grid">
            <Field label="公司名称 *" value={editForm.name} onChange={(name) => setEditForm({ ...editForm, name })} />
            <Field label="官网URL" value={editForm.websiteUrl} onChange={(websiteUrl) => setEditForm({ ...editForm, websiteUrl })} />
            <Field label="国家/地区" value={editForm.country} onChange={(country) => setEditForm({ ...editForm, country })} />
            <Field label="语言" value={editForm.language} onChange={(language) => setEditForm({ ...editForm, language })} />
            <Field label="时区" value={editForm.timezone} onChange={(timezone) => setEditForm({ ...editForm, timezone })} />
            <Field label="币种" value={editForm.currency} onChange={(currency) => setEditForm({ ...editForm, currency })} />
            <label>
              <span>客户来源</span>
              <AppSelect
                value={editForm.sourceId}
                onChange={(sourceId) => setEditForm({ ...editForm, sourceId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.sources.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>客户类型</span>
              <AppSelect
                value={editForm.typeId}
                onChange={(typeId) => setEditForm({ ...editForm, typeId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.types.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>负责人</span>
              <AppSelect
                value={editForm.ownerId}
                onChange={(ownerId) => setEditForm({ ...editForm, ownerId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.users.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>客户阶段</span>
              <AppSelect
                value={editForm.stage}
                onChange={(stage) => setEditForm({ ...editForm, stage })}
                options={(options?.stages ?? Object.keys(stageLabels)).map((stage) => ({ value: stage, label: stageLabel(stage) }))}
              />
            </label>
            <Field label="标签" value={editForm.tags} onChange={(tags) => setEditForm({ ...editForm, tags })} />
            <label className="wide-field">
              <span>备注</span>
              <textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} />
            </label>
          </div>
        ) : (
          <div className="detail-grid">
            <Detail label="阶段" value={stageLabel(customer.stage)} />
            <Detail label="风险" value={customer.riskLevel} />
            <Detail label="官网" value={customer.websiteUrl ?? "-"} />
            <Detail label="国家/语言" value={`${customer.country ?? "-"} / ${customer.language ?? "-"}`} />
            <Detail label="时区/币种" value={`${customer.timezone ?? "-"} / ${customer.currency ?? "-"}`} />
            <Detail label="负责人" value={customer.owner?.name ?? "-"} />
            <Detail label="客户来源" value={customer.source?.name ?? "-"} />
            <Detail label="客户类型" value={customer.type?.name ?? "-"} />
            <Detail label="标签" value={customer.tags?.join(", ") || "-"} />
            <Detail label="备注" value={customer.notes ?? "-"} wide />
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title"><h2>联系人</h2><span>{customer.contacts.length} 个</span></div>
        <div className="task-list">
          {customer.contacts.map((item) => <div className="task-row" key={item.id}><NotebookTabs size={16} /><div><strong>{item.name || item.email || "未命名联系人"}</strong><span>{item.title ?? "-"} · {item.email ?? "-"} · {item.phone ?? "-"}</span></div><span className="status-pill">{item.qualityScore}</span></div>)}
          {!customer.contacts.length ? <div className="empty-state">暂无联系人。</div> : null}
        </div>
        <div className="form-grid compact-form">
          <Field label="姓名" value={contact.name} onChange={(name) => setContact({ ...contact, name })} />
          <Field label="职位" value={contact.title} onChange={(title) => setContact({ ...contact, title })} />
          <Field label="邮箱" value={contact.email} onChange={(email) => setContact({ ...contact, email })} />
          <Field label="电话" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} />
          <Field label="质量分" value={contact.qualityScore} onChange={(qualityScore) => setContact({ ...contact, qualityScore })} />
          <div><button className="secondary-button" disabled={createContact.isPending} onClick={() => createContact.mutate()}>新增联系人</button></div>
        </div>
      </section>
    </div>
  );
}

function WebsiteAnalysisPanel({ customer }: { customer: CustomerDetail }) {
  const analysis = customer.websiteAnalyses[0];
  const validPages = (analysis?.pages ?? []).filter((page) => !page.errorMessage);
  const failedPages = (analysis?.pages ?? []).filter((page) => page.errorMessage);
  const aiInsights = getWebsiteAiInsights(analysis);
  return (
    <section className="panel">
      <div className="panel-title"><h2>客户官网分析</h2><span>{analysis ? statusText(analysis.status) : "未分析"}</span></div>
      {!customer.websiteUrl ? <div className="empty-state">请先在“概览”里编辑并保存客户官网 URL，然后再点击右上角“官网分析”。</div> : null}
      {!analysis ? <div className="empty-state">尚未发起官网分析。</div> : (
        <div className="page-stack">
          <div className="detail-grid">
            <Detail label="分析状态" value={statusText(analysis.status)} />
            <Detail label="官网完整度" value={analysis.websiteCompleteness ? `${analysis.websiteCompleteness}/100` : "待判断"} />
            <Detail label="产品数量" value={analysis.productCount ? `${analysis.productCount} 个` : "未识别到明确数量"} />
            <Detail label="价格定位" value={analysis.pricePositioning || readablePriceRange(analysis.priceRange)} />
            <Detail label="官网语言" value={analysis.detectedLanguage || "-"} />
          </div>

          {analysis.status === "QUEUED" || analysis.status === "RUNNING" ? (
            <div className="loading-state">系统正在抓取官网并生成客户分析，完成后会自动刷新。</div>
          ) : null}
          {analysis.status === "FAILED" ? <div className="error-state">{analysis.errorMessage ?? "官网分析失败，请检查官网是否可访问。"}</div> : null}

          <WebsiteBusinessReportV2 analysis={analysis} insights={aiInsights} />

          <details className="ai-versions">
            <summary>抓取异常与技术明细</summary>
            <FailedPageList pages={failedPages} />
            <pre>{JSON.stringify(analysis.rawResult ?? analysis, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}

function ResearchPanel({ customer }: { customer: CustomerDetail }) {
  const report = customer.researchReports[0];
  const evidence = asRecord(report?.sourceEvidence);
  const searchWarning = getText(evidence, "searchWarning") || getText(evidence, "warning");
  return (
    <section className="panel">
      <div className="panel-title"><h2>客户背调报告</h2><span>{report ? statusText(report.status) : "未生成"}</span></div>
      {!report ? <div className="empty-state">尚未生成背调报告。可以先完成官网分析，再点击右上角“生成背调”。</div> : (
        <div className="page-stack">
          <div className="detail-grid">
            <Detail label="报告状态" value={statusText(report.status)} />
            <Detail label="公开网络搜索" value={researchSearchStatus(report)} />
            <Detail label="生成时间" value={new Date(report.createdAt).toLocaleString()} />
            <Detail label="报告标题" value={report.title} />
          </div>
          {isPendingStatus(report.status) ? <div className="loading-state">系统正在整理客户背景、官网分析、我方资料和来源依据，完成后会自动刷新。</div> : null}
          {report.status === "FAILED" ? <div className="error-state">{report.errorMessage ?? "背调报告生成失败，请稍后重试。"}</div> : null}
          {searchWarning ? <div className="loading-state">{searchWarning}</div> : null}
          {report.finalMarkdown ? <MarkdownReport content={report.finalMarkdown} /> : null}
          {!report.finalMarkdown && report.status === "SUCCEEDED" ? <div className="empty-state">背调任务已完成，但未返回可展示的 Markdown 报告，请查看 AI 版本记录或重新生成。</div> : null}
          <AnalysisSection title="来源依据">
            <SourceEvidence evidence={report.sourceEvidence} />
          </AnalysisSection>
          <AiVersions run={report.aiGenerationRun} />
        </div>
      )}
    </section>
  );
}

function ScorePanel({ customer }: { customer: CustomerDetail }) {
  const score = customer.oemFitScores[0];
  const strategy = asRecord(score?.developmentStrategy);
  return (
    <section className="panel">
      <div className="panel-title"><h2>OEM适配评分</h2><span>{score ? `${score.score} / ${score.grade}` : "未评分"}</span></div>
      {!score ? <div className="empty-state">尚未生成OEM评分。建议先完成官网分析和背调，再点击右上角“OEM评分”。</div> : (
        <div className="page-stack">
          <div className="score-summary">
            <div className={`score-badge grade-${score.grade.toLowerCase()}`}>
              <strong>{score.score}</strong>
              <span>{score.grade}级 · {gradeText(score.grade)}</span>
            </div>
            <div>
              <h3>{getText(strategy, "summary") || "系统已生成OEM适配评分，请结合维度理由和推荐动作判断开发优先级。"}</h3>
              <p>生成时间：{new Date(score.createdAt).toLocaleString()}</p>
              {getText(strategy, "priority") ? <span className="status-pill">优先级：{getText(strategy, "priority")}</span> : null}
            </div>
          </div>

          <section className="analysis-section">
            <h3>维度评分</h3>
            <ScoreDimensionList score={score} />
          </section>

          <div className="analysis-grid">
            <AnalysisSection title="推荐供货产品">
              <RecommendedProductList items={score.recommendedProducts} />
            </AnalysisSection>
            <AnalysisSection title="邮件开发切入点">
              <InsightList items={score.emailEntryPoints} empty="暂无邮件切入点。" />
            </AnalysisSection>
            <AnalysisSection title="潜在合作机会">
              <InsightList items={score.opportunities} empty="暂无明确合作机会。" />
            </AnalysisSection>
            <AnalysisSection title="潜在风险">
              <InsightList items={score.risks} empty="暂无明显风险。" />
            </AnalysisSection>
            <AnalysisSection title="下一步行动">
              <InsightList items={score.nextActions} empty="暂无下一步行动建议。" />
            </AnalysisSection>
          </div>

          {score.explanation ? (
            <details className="ai-versions">
              <summary>评分报告原文</summary>
              <MarkdownReport content={score.explanation} />
            </details>
          ) : null}
          <AiVersions run={score.aiGenerationRun} />
        </div>
      )}
    </section>
  );
}

function EmailPanel({ customer, customerId, onChanged }: { customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const contactOptions = customer.contacts.filter((contact) => Boolean(contact.email));
  const [draftForm, setDraftForm] = useState({ purpose: "FIRST_OUTREACH", toEmail: contactOptions[0]?.email ?? "", emailAccountId: "", userInstructions: "" });
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const { data: accounts = [] } = useQuery({ queryKey: ["email-accounts"], queryFn: () => apiGet<EmailAccount[]>("/email-accounts") });
  const selectableAccounts = accounts.filter((account) => !sameEmailAddress(account.email, draftForm.toEmail));
  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === draftForm.emailAccountId);
    if (selectedAccount && sameEmailAddress(selectedAccount.email, draftForm.toEmail)) {
      setDraftForm((current) => ({ ...current, emailAccountId: "" }));
    }
  }, [accounts, draftForm.emailAccountId, draftForm.toEmail]);
  const { data: drafts = [] } = useQuery({
    queryKey: ["email-drafts", customerId],
    queryFn: () => apiGet<EmailDraft[]>(`/customers/${customerId}/email-drafts`),
    refetchInterval: (query) => {
      const data = query.state.data as EmailDraft[] | undefined;
      const hasGenerating = data?.some((draft) => !draft.body);
      return hasGenerating ? 3000 : false;
    }
  });
  const { data: threads = [] } = useQuery({ queryKey: ["email-threads", customerId], queryFn: () => apiGet<EmailThread[]>(`/customers/${customerId}/email-threads`) });
  const generate = useMutation({
    mutationFn: () => apiPost<{ id: string; status: string; message: string }>(`/customers/${customerId}/email-drafts/generate`, cleanPayload(draftForm)),
    onSuccess: () => {
      invalidateEmail(queryClient, customerId, onChanged);
    }
  });
  const update = useMutation({ mutationFn: (draft: EmailDraft) => apiPatch(`/email-drafts/${draft.id}`, cleanPayload({ subject: editDraft[`subject:${draft.id}`] ?? draft.subject, body: editDraft[`body:${draft.id}`] ?? draft.body, emailAccountId: editDraft[`account:${draft.id}`] ?? draft.emailAccountId })), onSuccess: () => invalidateEmail(queryClient, customerId, onChanged) });
  const approve = useMutation({ mutationFn: (draftId: string) => apiPost(`/email-drafts/${draftId}/approve`, { reviewComment: "Approved in customer detail" }), onSuccess: () => invalidateEmail(queryClient, customerId, onChanged) });
  const send = useMutation({
    mutationFn: (draft: EmailDraft) => apiPost(`/email-drafts/${draft.id}/send`, undefined, { toast: false }).then((result) => ({ result, draft })),
    onSuccess: ({ draft }) => {
      const isSampleFollowUp = draft.purpose === "SAMPLE_FOLLOW_UP";
      showClientToast({
        type: "success",
        title: isSampleFollowUp ? "样品跟进邮件已发送" : "邮件已发送",
        message: isSampleFollowUp ? "请前往“样品”页更新样品状态，并继续跟进客户。" : "邮件已成功发送给客户。"
      });
      invalidateEmail(queryClient, customerId, onChanged);
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "邮件发送失败",
        message: error instanceof Error ? error.message : "邮件发送失败"
      });
    }
  });

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-title"><h2>AI邮件生成</h2><span>只生成草稿，人工审核后发送</span></div>
        <div className="form-grid">
          <label>
            <span>邮件类型</span>
            <AppSelect
              value={draftForm.purpose}
              onChange={(purpose) => setDraftForm({ ...draftForm, purpose })}
              options={EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose) }))}
            />
          </label>
          <label>
            <span>收件人</span>
            <AppSelect
              value={draftForm.toEmail}
              onChange={(toEmail) => setDraftForm({ ...draftForm, toEmail })}
              options={[
                { value: "", label: "选择联系人邮箱" },
                ...contactOptions.map((contact) => ({ value: contact.email ?? "", label: `${contact.name || contact.email} · ${contact.email}` }))
              ]}
            />
          </label>
          <label>
            <span>发件邮箱</span>
            <AppSelect
              value={draftForm.emailAccountId}
              onChange={(emailAccountId) => setDraftForm({ ...draftForm, emailAccountId })}
              options={[
                { value: "", label: "发送时自动选择" },
                ...selectableAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.email} ${account.scope === "SHARED" ? "(共享)" : ""}` }))
              ]}
            />
          </label>
          <label className="wide-field"><span>补充要求</span><textarea value={draftForm.userInstructions} onChange={(event) => setDraftForm({ ...draftForm, userInstructions: event.target.value })} /></label>
          <div className="wide-field"><button className="primary-button" disabled={!draftForm.toEmail || !selectableAccounts.length || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "生成中..." : "生成AI草稿"}</button></div>
          {!selectableAccounts.length && draftForm.toEmail ? <div className="wide-field empty-state">当前没有可用发件邮箱，或可用发件邮箱与收件人邮箱相同。</div> : null}
        </div>
      </section>
      <section className="table-panel">
        <div className="panel-title"><h2>邮件草稿</h2><span>{drafts.length} 封</span></div>
        {!drafts.length ? <div className="empty-state">暂无邮件草稿。</div> : drafts.map((draft) => (
          <div className="draft-editor" key={draft.id}>
             <div className="task-row">
              <MailPlus size={16} />
              <div>
                <strong>邮件类型：{emailDraftPurposeLabel(draft.purpose)}</strong>
                <span>发件人：{formatEmailDraftSender(draft, { fallback: "未选择发件邮箱", separator: " · " })}</span>
                <span>收件人：{formatEmailDraftRecipient(draft, { separator: " · " })}</span>
              </div>
              <span className="status-pill">{draft.status}</span>
            </div>
            <input value={editDraft[`subject:${draft.id}`] ?? draft.subject} onChange={(event) => setEditDraft({ ...editDraft, [`subject:${draft.id}`]: event.target.value })} />
            {draft.body ? (
              <AutoResizeTextarea value={editDraft[`body:${draft.id}`] ?? draft.body} onChange={(event) => setEditDraft({ ...editDraft, [`body:${draft.id}`]: event.target.value })} />
            ) : (
              <div className="loading-state">⏳ 稿件生成中，请稍候...</div>
            )}
            <div className="toolbar">
              <button className="secondary-button" onClick={() => update.mutate(draft)}>保存修改</button>
              <button className="secondary-button" onClick={() => approve.mutate(draft.id)}>审核通过</button>
              <button className="primary-button" disabled={draft.status !== "APPROVED"} onClick={() => send.mutate(draft)}>发送邮件</button>
            </div>
            <AiVersions run={draft.aiGenerationRun} />
          </div>
        ))}
      </section>
      <section className="table-panel">
        <div className="panel-title"><h2>邮件线程</h2><span>{threads.length} 条</span></div>
        <SimpleRows rows={threads.map((thread) => ({ id: thread.id, title: thread.subject, meta: `${thread.messages?.[0]?.direction ?? "-"} · ${thread.messages?.[0]?.status ?? "-"} · ${thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"}` }))} empty="暂无邮件往来。" />
      </section>
    </div>
  );
}

function FollowUpPanel({ tasks }: { tasks: FollowUpTask[] }) {
  return <section className="panel"><div className="panel-title"><h2>跟进任务</h2><span>{tasks.length} 项</span></div><SimpleRows rows={tasks.map((task) => ({ id: task.id, title: task.title, meta: `${task.type} · ${task.status} · ${new Date(task.dueAt).toLocaleString()}` }))} empty="暂无跟进任务。" /></section>;
}

function QuotePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ quoteNo: `Q-${Date.now()}`, currency: "USD", amount: "", notes: "" });
  const { data = [] } = useQuery({ queryKey: ["quotes", customerId], queryFn: () => apiGet<Quote[]>(`/quotes?customerId=${customerId}`) });
  const create = useMutation({ mutationFn: () => apiPost("/quotes", { ...form, customerId, amount: Number(form.amount) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes", customerId] }) });
  return <CommercialPanel title="报价记录" rows={data.map((item) => ({ id: item.id, title: `${item.quoteNo} · ${item.currency} ${item.amount}`, meta: `${item.status} · ${new Date(item.createdAt).toLocaleDateString()}` }))} form={form} setForm={(value) => setForm(value as typeof form)} onSubmit={() => create.mutate()} fields={[["quoteNo", "报价编号"], ["currency", "币种"], ["amount", "金额"], ["notes", "备注"]]} />;
}

function SamplePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ productSummary: "", carrier: "", trackingNo: "" });
  const { data = [] } = useQuery({ queryKey: ["samples", customerId], queryFn: () => apiGet<Sample[]>(`/samples?customerId=${customerId}`) });
  const create = useMutation({ mutationFn: () => apiPost("/samples", { ...form, customerId }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["samples", customerId] }) });
  return <CommercialPanel title="样品记录" rows={data.map((item) => ({ id: item.id, title: item.productSummary, meta: `${item.status} · ${item.trackingNo ?? "-"} · ${new Date(item.createdAt).toLocaleDateString()}` }))} form={form} setForm={(value) => setForm(value as typeof form)} onSubmit={() => create.mutate()} fields={[["productSummary", "样品/产品"], ["carrier", "物流商"], ["trackingNo", "运单号"]]} />;
}

function AutoResizeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const value = typeof props.value === "string" ? props.value : "";

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return <textarea {...props} ref={ref} rows={1} style={{ ...(props.style ?? {}), overflow: "hidden", resize: "none" }} />;
}

function CommercialPanel(props: { title: string; rows: Array<{ id: string; title: string; meta: string }>; form: Record<string, string>; setForm: (v: Record<string, string>) => void; onSubmit: () => void; fields: string[][] }) {
  return <section className="panel"><div className="panel-title"><h2>{props.title}</h2><span>{props.rows.length} 条</span></div><SimpleRows rows={props.rows} empty={`暂无${props.title}。`} /><div className="form-grid compact-form">{props.fields.map(([key, label]) => <Field key={key} label={label} value={props.form[key]} onChange={(value) => props.setForm({ ...props.form, [key]: value })} />)}<div><button className="secondary-button" onClick={props.onSubmit}>新增</button></div></div></section>;
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`detail-block ${wide ? "wide-field" : ""}`}><strong>{label}</strong><span>{value}</span></div>;
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{props.label}</span><input value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function SimpleRows({ rows, empty }: { rows: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  return <div className="task-list">{rows.map((row) => <div className="task-row" key={row.id}><NotebookTabs size={16} /><div><strong>{row.title}</strong><span>{row.meta}</span></div></div>)}</div>;
}

function AnalysisSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="analysis-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function WebsiteBusinessReportV2({ analysis, insights }: { analysis: WebsiteAnalysis; insights?: WebsiteAiInsights }) {
  const summary = insights?.business_summary || "官网分析已完成，但暂未生成完整客户画像。建议重新分析或补充公开搜索能力。";
  const validPages = (analysis.pages ?? []).filter((page) => !page.errorMessage);
  return (
    <section className="analysis-report">
      <div className="analysis-report__summary">
        <span>客户分析结论</span>
        <p>{summary}</p>
        {insights?.our_data_quality_note ? <p style={{ marginTop: 8, color: "#b45309", fontSize: 13 }}>数据质量提示：{insights.our_data_quality_note}</p> : null}
      </div>
      <div className="analysis-grid">
        <div className="page-stack" style={{ gap: 12 }}>
          <AnalysisSection title="客户画像">
            <p className="analysis-copy">{insights?.customer_profile || "官网未明确展示完整客户画像，需要结合公开搜索和人工判断补充。"}</p>
          </AnalysisSection>
          <AnalysisSection title="主营业务与产品线">
            <p className="analysis-copy">{insights?.main_business || insights?.product_line_analysis || fallbackProductLineText(analysis.productCategories)}</p>
          </AnalysisSection>
          <AnalysisSection title="品牌定位与市场信号">
            <p className="analysis-copy">{insights?.brand_positioning || analysis.pricePositioning || "官网未明确展示品牌或价格定位。"}</p>
            {insights?.market_channel_signals ? <p className="analysis-copy" style={{ marginTop: 8 }}>{insights.market_channel_signals}</p> : null}
          </AnalysisSection>
          <AnalysisSection title="OEM/ODM机会判断">
            <p className="analysis-copy">{insights?.oem_opportunity_assessment || "可结合产品线、品牌页和联系人信息继续判断OEM/ODM合作机会。"}</p>
            <InsightList items={insights?.cooperation_opportunities ?? analysis.opportunities} empty="暂未识别到明确合作机会。" />
          </AnalysisSection>
          <AnalysisSection title="开发切入点与下一步建议">
            {insights?.sales_entry_points?.length ? (
              <>
                <p className="analysis-copy" style={{ fontWeight: 600, marginBottom: 6 }}>切入话术</p>
                <InsightList items={insights.sales_entry_points} empty="" />
              </>
            ) : null}
            {insights?.suggested_next_actions?.length ? (
              <>
                <p className="analysis-copy" style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>下一步行动</p>
                <InsightList items={insights.suggested_next_actions} empty="建议先补充采购/产品负责人，再进入开发邮件生成。" />
              </>
            ) : null}
            {!insights?.sales_entry_points?.length && !insights?.suggested_next_actions?.length ? <div className="empty-state">暂无开发切入点建议。</div> : null}
          </AnalysisSection>
          <AnalysisSection title="风险提示">
            <InsightList items={insights?.risk_notes ?? analysis.risks} empty="暂未识别到明显风险。" />
          </AnalysisSection>
        </div>
        <div className="page-stack" style={{ gap: 12 }}>
          <AnalysisSection title="产品分类与页面证据">
            <ProductCategoryList items={analysis.productCategories} />
          </AnalysisSection>
          <AnalysisSection title="公开联系方式">
            <ContactEvidenceList items={analysis.contactEvidence} />
          </AnalysisSection>
          <AnalysisSection title="缺失品类对比分析">
            <MissingCategoriesGapList items={insights?.missing_categories_gap} />
          </AnalysisSection>
          <AnalysisSection title="价格竞争力">
            <PriceCompetitivenessCard data={insights?.price_competitiveness} />
          </AnalysisSection>
          <AnalysisSection title="有效证据页面">
            <WebsiteEvidencePageList pages={insights?.evidence_pages} fallbackPages={validPages} />
          </AnalysisSection>
          <AnalysisSection title="待补充信息">
            <UnknownFactorsList items={insights?.unknown_factors} />
          </AnalysisSection>
        </div>
      </div>
    </section>
  );
}

function ScoreDimensionList({ score }: { score: OemScore }) {
  const details = asArray(score.dimensionDetails);
  const weights = score.weights as Record<string, number> | undefined;
  const breakdown = score.breakdown as Record<string, number> | undefined;

  const resolveMaxScore = (key: string, rawMax: number) => {
    if (weights && typeof weights[key] === "number") return weights[key];
    if (rawMax > 0) return rawMax;
    return key === "riskPenalty" ? 10 : 15;
  };

  const resolveScore = (key: string, rawScore: number) => {
    if (breakdown && typeof breakdown[key] === "number") return breakdown[key];
    return rawScore;
  };

  const rows = details.length
    ? details.map((item) => {
        const record = asRecord(item);
        const key = getText(record, "key");
        const rawScore = getNumber(record, "score");
        const rawMax = getNumber(record, "maxScore");
        return {
          key,
          label: getText(record, "label") || scoreLabel(key),
          score: resolveScore(key, rawScore),
          maxScore: resolveMaxScore(key, rawMax),
          reason: getText(record, "reason"),
          evidence: asArray(record.evidence).map(stringifyInsight).filter(Boolean)
        };
      })
    : Object.entries(score.breakdown ?? {}).map(([key, value]) => ({
        key,
        label: scoreLabel(key),
        score: value,
        maxScore: resolveMaxScore(key, 0),
        reason: "",
        evidence: []
      }));
  return (
    <div className="score-dimensions">
      {rows.map((row) => {
        const percent = Math.max(0, Math.min(100, Math.round((row.score / Math.max(row.maxScore, 1)) * 100)));
        return (
          <div className="score-dimension" key={row.key || row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.reason || "系统根据客户资料、官网分析、背调和企业资料库自动评分。"}</span>
              {row.evidence.length ? <small>{row.evidence.slice(0, 3).join("；")}</small> : null}
            </div>
            <div className="score-meter">
              <span>{row.key === "riskPenalty" ? "-" : ""}{row.score}/{row.maxScore}</span>
              <i><b style={{ width: `${percent}%` }} /></i>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecommendedProductList({ items }: { items?: unknown }) {
  const products = asArray(items);
  if (!products.length) return <div className="empty-state">暂无推荐产品。请先完善企业资料库中的产品资料。</div>;
  return (
    <div className="analysis-list">
      {products.slice(0, 8).map((item, index) => {
        const record = asRecord(item);
        const name = getText(record, "name") || `推荐产品 ${index + 1}`;
        const category = getText(record, "category");
        const reason = getText(record, "reason") || getText(record, "description") || "建议人工复核匹配度。";
        const priceRange = getText(record, "priceRange");
        return (
          <div className="analysis-row" key={`${name}-${index}`}>
            <strong>{name}</strong>
            <span>{[category, priceRange].filter(Boolean).join(" · ") || "待补充品类/价格"}</span>
            <span>{reason}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProductCategoryList({ items }: { items?: unknown[] }) {
  const categories = asArray(items);
  if (!categories.length) return <div className="empty-state">暂未识别到具体产品分类。</div>;
  return (
    <div className="analysis-list">
      {categories.map((item, index) => {
        const record = asRecord(item);
        const name = categoryName(getText(record, "name") || getText(record, "category") || `产品线 ${index + 1}`);
        const productCount = getNumber(record, "productCount");
        const keywords = getStringArray(record.keywords);
        const urls = getStringArray(record.evidenceUrls);
        return (
          <div className="analysis-row" key={`${name}-${index}`}>
            <strong>{name}</strong>
            <span>{productCount ? `识别到约 ${productCount} 个产品` : keywords.length ? `关键词：${keywords.join(", ")}` : "基于官网页面链接识别"}</span>
            <EvidenceLinks urls={urls} />
          </div>
        );
      })}
    </div>
  );
}

function WebsiteEvidencePageList({ pages, fallbackPages }: { pages?: Array<{ title?: string; url?: string; reason?: string }>; fallbackPages?: WebsiteAnalysisPage[] }) {
  const values = (pages?.length ? pages : (fallbackPages ?? []).map((page) => ({ title: page.title, url: page.url, reason: pageTypeLabel(page.pageType) }))).filter((page) => page.url).slice(0, 8);
  if (!values.length) return <div className="empty-state">暂无有效证据页面。</div>;
  return (
    <div className="analysis-list">
      {values.map((page, index) => (
        <div className="analysis-row" key={`${page.url}-${index}`}>
          <strong>{page.title || shortUrl(page.url || "")}</strong>
          <span>{page.reason || "用于支撑客户分析"}</span>
          <EvidenceLinks urls={page.url ? [page.url] : []} />
        </div>
      ))}
    </div>
  );
}

function MissingCategoriesGapList({ items }: { items?: WebsiteAiInsights["missing_categories_gap"] }) {
  if (!items?.length) return <div className="empty-state">暂无品类对比数据。完善企业产品资料库后可自动生成。</div>;
  return (
    <div className="analysis-list">
      {items.map((item, index) => {
        const scoreTone = item.opportunity_score >= 8 ? "strong" : item.opportunity_score >= 6 ? "medium" : "weak";
        const scoreStyle =
          scoreTone === "strong"
            ? { background: "#dcfce7", color: "#166534" }
            : scoreTone === "medium"
              ? { background: "#fef9c3", color: "#854d0e" }
              : { background: "#fee2e2", color: "#991b1b" };
        return (
          <div className="analysis-row" key={`${item.category}-${index}`}>
            <strong>{item.category || `待确认品类 ${index + 1}`}</strong>
            <span>客户现有：{item.customer_has || "未明确展示"}</span>
            <span>我方可供：{item.we_can_supply || "需人工确认"}</span>
            {item.reason ? <span>{item.reason}</span> : null}
            <span>
              机会评分：<span className="status-pill" style={scoreStyle}>{item.opportunity_score}/10</span>
            </span>
            {item.data_quality_note ? <small style={{ color: "#b45309" }}>{item.data_quality_note}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

function PriceCompetitivenessCard({ data }: { data?: WebsiteAiInsights["price_competitiveness"] }) {
  const level = data?.level || "unknown";
  const levelLabel: Record<string, string> = {
    competitive: "有竞争力",
    neutral: "持平",
    challenging: "偏弱",
    unknown: "暂无对比数据"
  };
  const levelColor: Record<string, string> = {
    competitive: "#dcfce7",
    neutral: "#fef9c3",
    challenging: "#fee2e2",
    unknown: "#f3f4f6"
  };
  return (
    <div>
      <p className="analysis-copy" style={{ marginBottom: 8 }}>
        竞争力判断：<span className="status-pill" style={{ background: levelColor[level] || levelColor.unknown, color: "#1f2933" }}>{levelLabel[level] || level}</span>
      </p>
      <p className="analysis-copy">{data?.summary || "客户官网价格通常为零售价或MSRP，或缺少可确认的B2B/wholesale/trade价格信号，暂不进行价格竞争力判断。"}</p>
      {data?.price_nature_note ? <small style={{ display: "block", marginTop: 6, color: "#6b7280" }}>{data.price_nature_note}</small> : null}
    </div>
  );
}

function UnknownFactorsList({ items }: { items?: string[] }) {
  if (!items?.length) return <div className="empty-state">暂未列出待补充信息。</div>;
  return (
    <div>
      <p className="analysis-copy" style={{ marginBottom: 8 }}>以下关键信息尚未获得，建议在开发过程中逐步补充：</p>
      <ul className="analysis-bullets">
        {items.map((item, index) => <li key={`${item}-${index}`} style={{ color: "#b45309" }}>{item}</li>)}
      </ul>
    </div>
  );
}

function FailedPageList({ pages }: { pages: WebsiteAnalysisPage[] }) {
  if (!pages.length) return <div className="empty-state">本次抓取没有明显异常页面。</div>;
  return (
    <div className="analysis-list">
      {pages.slice(0, 12).map((page, index) => (
        <div className="analysis-row" key={`${page.url}-${index}`}>
          <strong>{shortUrl(page.url)}</strong>
          <span>{page.errorMessage || "页面不可用"}</span>
        </div>
      ))}
    </div>
  );
}

function ProductDetailList({ items }: { items?: WebsiteAnalysisProduct[] }) {
  const products = (items ?? []).slice(0, 12);
  if (!products.length) return <div className="empty-state">暂未识别到具体产品明细，建议检查官网是否存在产品详情页或重新分析。</div>;
  return (
    <div className="analysis-list">
      {products.map((item, index) => (
        <div className="analysis-row" key={`${item.name}-${index}`}>
          <strong>{item.name}</strong>
          <span>
            {item.category ? `${categoryName(item.category)} · ` : ""}
            {item.description || (item.keywords?.length ? `关键词：${item.keywords.join(", ")}` : "从官网产品页识别")}
            {typeof item.confidence === "number" ? ` · 可信度 ${item.confidence}` : ""}
          </span>
          <EvidenceLinks urls={item.evidenceUrls} />
        </div>
      ))}
    </div>
  );
}

function ContactEvidenceList({ items }: { items?: unknown[] }) {
  const contacts = asArray(items);
  if (!contacts.length) return <div className="empty-state">暂未识别到公开邮箱或电话。</div>;
  return (
    <div className="analysis-list">
      {contacts.map((item, index) => {
        const record = asRecord(item);
        const type = contactTypeLabel(getText(record, "type"));
        const value = getText(record, "value") || stringifyInsight(item);
        const sourceUrl = getText(record, "sourceUrl");
        return (
          <div className="analysis-row" key={`${value}-${index}`}>
            <strong>{type}</strong>
            <span>{value}</span>
            {sourceUrl ? <EvidenceLinks urls={[sourceUrl]} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function InsightList({ items, empty }: { items?: unknown; empty: string }) {
  const values = asArray(items).map(stringifyInsight).filter(Boolean);
  if (!values.length) return <div className="empty-state">{empty}</div>;
  return <ul className="analysis-bullets">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>;
}

function WebsitePageList({ pages, fallbackUrls }: { pages?: WebsiteAnalysisPage[]; fallbackUrls?: unknown[] }) {
  const visiblePages = (pages ?? []).slice(0, 16);
  if (!visiblePages.length) return <EvidenceLinks urls={fallbackUrls} />;
  return (
    <div className="analysis-list">
      {visiblePages.map((page, index) => (
        <div className="analysis-row" key={`${page.url}-${index}`}>
          <strong>{pageTypeLabel(page.pageType)} · {page.title || shortUrl(page.url)}</strong>
          <span>{page.textSummary || (typeof page.depth === "number" ? `抓取深度 ${page.depth}` : "已抓取页面")}</span>
          {page.errorMessage ? <span>抓取提示：{page.errorMessage}</span> : null}
          <EvidenceLinks urls={[page.url]} />
        </div>
      ))}
    </div>
  );
}

function SourceEvidence({ evidence }: { evidence?: unknown }) {
  const record = asRecord(evidence);
  const websiteUrls = getStringArray(record.websiteUrls).slice(0, 12);
  const websitePages = asArray(record.websitePages).slice(0, 12);
  const publicResults = asArray(record.publicSearchResults).slice(0, 8);
  const contacts = asArray(record.crmContacts).slice(0, 8);
  if (!websiteUrls.length && !websitePages.length && !publicResults.length && !contacts.length) {
    return <div className="empty-state">暂无可展示来源依据。</div>;
  }
  return (
    <div className="analysis-list">
      {websitePages.length ? (
        <div className="analysis-row">
          <strong>官网页面</strong>
          {websitePages.map((item, index) => {
            const page = asRecord(item);
            const url = getText(page, "url");
            return <span key={`${url}-${index}`}>{pageTypeLabel(getText(page, "pageType"))} · {getText(page, "title") || shortUrl(url)}</span>;
          })}
        </div>
      ) : null}
      {websiteUrls.length ? <div className="analysis-row"><strong>抓取URL</strong><EvidenceLinks urls={websiteUrls} /></div> : null}
      {publicResults.length ? (
        <div className="analysis-row">
          <strong>公开搜索结果</strong>
          {publicResults.map((item, index) => {
            const result = asRecord(item);
            const title = getText(result, "title") || getText(result, "url") || `搜索结果 ${index + 1}`;
            const url = getText(result, "url");
            return <span key={`${title}-${index}`}>{title}{url ? ` · ${shortUrl(url)}` : ""}</span>;
          })}
        </div>
      ) : null}
      {contacts.length ? (
        <div className="analysis-row">
          <strong>CRM联系人</strong>
          {contacts.map((item, index) => {
            const contact = asRecord(item);
            return <span key={index}>{getText(contact, "name") || "未命名"} · {getText(contact, "email") || getText(contact, "phone") || "-"}</span>;
          })}
        </div>
      ) : null}
    </div>
  );
}

function MarkdownReport({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <article className="markdown-report">
      {blocks.map((block, index) => {
        if (block.type === "h1") return <h1 key={index}>{cleanMarkdownText(block.text)}</h1>;
        if (block.type === "h2") return <h2 key={index}>{cleanMarkdownText(block.text)}</h2>;
        if (block.type === "h3") return <h3 key={index}>{cleanMarkdownText(block.text)}</h3>;
        if (block.type === "quote") return <div className="report-note" key={index}>{cleanMarkdownText(block.text)}</div>;
        if (block.type === "list") return <ul key={index}>{block.items?.map((item, itemIndex) => <li key={itemIndex}>{cleanMarkdownText(item)}</li>)}</ul>;
        if (block.type === "table") return <MarkdownTable key={index} rows={block.rows ?? []} />;
        return <p key={index}>{cleanMarkdownText(block.text)}</p>;
      })}
    </article>
  );
}

function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length < 2) return null;
  const [head, ...body] = rows;
  return (
    <table className="report-table">
      <thead><tr>{head.map((cell, index) => <th key={index}>{cleanMarkdownText(cell)}</th>)}</tr></thead>
      <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cleanMarkdownText(cell)}</td>)}</tr>)}</tbody>
    </table>
  );
}

function EvidenceLinks({ urls }: { urls?: unknown[] }) {
  const values = getStringArray(urls);
  if (!values.length) return null;
  return (
    <div className="evidence-links">
      {values.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{shortUrl(url)}</a>)}
    </div>
  );
}

function AiVersions({ run }: { run?: AiRun }) {
  const versions = run?.versions ?? [];
  if (!versions.length) return null;
  return <details className="ai-versions"><summary>AI与人工版本记录 ({versions.length})</summary>{versions.map((version) => <pre key={version.id}>{version.versionType} · {new Date(version.createdAt).toLocaleString()}\n{version.content}</pre>)}</details>;
}

function defaultContactForm() {
  return { name: "", title: "", email: "", phone: "", qualityScore: "50", isDecisionMaker: false };
}

function customerToForm(customer: CustomerDetail) {
  return {
    name: customer.name ?? "",
    websiteUrl: customer.websiteUrl ?? "",
    country: customer.country ?? "",
    language: customer.language ?? "",
    timezone: customer.timezone ?? "",
    currency: customer.currency ?? "",
    sourceId: customer.source?.id ?? "",
    typeId: customer.type?.id ?? "",
    ownerId: customer.owner?.id ?? "",
    stage: customer.stage,
    tags: customer.tags?.join(", ") ?? "",
    notes: customer.notes ?? ""
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function invalidateEmail(queryClient: ReturnType<typeof useQueryClient>, customerId: string, onChanged: () => void) {
  queryClient.invalidateQueries({ queryKey: ["email-drafts", customerId] });
  queryClient.invalidateQueries({ queryKey: ["email-threads", customerId] });
  onChanged();
}

function cleanPayload(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value));
}

function formatDraftSender(draft: EmailDraft) {
  if (draft.fromEmailSnapshot) return draft.fromNameSnapshot ? `${draft.fromNameSnapshot} · ${draft.fromEmailSnapshot}` : draft.fromEmailSnapshot;
  if (draft.emailAccount) return `${draft.emailAccount.name} · ${draft.emailAccount.email}`;
  return "未选择发件邮箱";
}

function formatDraftRecipient(draft: EmailDraft) {
  return draft.toNameSnapshot ? `${draft.toNameSnapshot} · ${draft.toEmail}` : draft.toEmail;
}

function scoreLabel(key: string) {
  const labels: Record<string, string> = {
    productLineFit: "产品匹配度",
    marketFit: "市场匹配度",
    priceBandFit: "价格匹配度",
    brandMaturity: "品牌成熟度",
    websiteCompleteness: "官网完整度",
    contactQuality: "联系人质量",
    cooperationOpportunity: "合作机会",
    riskPenalty: "风险因素"
  };
  return labels[key] ?? key;
}

function gradeText(grade: string) {
  const labels: Record<string, string> = {
    A: "优先开发",
    B: "正常开发",
    C: "观察开发",
    D: "暂缓开发"
  };
  return labels[grade] ?? "待判断";
}

const stageLabels: Record<string, string> = {
  PENDING_RESEARCH: "待背调",
  RESEARCHING: "背调中",
  RESEARCHED: "已背调",
  PENDING_EMAIL_GENERATION: "待生成邮件",
  PENDING_EMAIL_SEND: "待发送邮件",
  FIRST_EMAIL_SENT: "已发送首封邮件",
  PENDING_SECOND_FOLLOW_UP: "待二次跟进",
  REPLIED: "客户已回复",
  REQUIREMENT_CONFIRMING: "需求确认中",
  QUOTING: "报价中",
  SAMPLING: "样品中",
  NEGOTIATING: "订单谈判",
  WON: "已成交",
  PAUSED: "暂缓开发",
  INVALID: "无效客户",
  BLACKLISTED: "黑名单"
};

function stageLabel(stage: string) {
  return stageLabels[stage] ?? stage;
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "排队中",
    RUNNING: "分析中",
    SUCCEEDED: "分析完成",
    FAILED: "分析失败"
  };
  return labels[status] ?? status;
}

function researchSearchStatus(report: ResearchReport) {
  if (isPendingStatus(report.status)) return "检测中，完成后显示是否启用";
  if (report.status === "FAILED") return "未完成";
  return report.searchEnabled ? "已启用" : "未启用，基于官网与CRM资料";
}

function isPendingStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}

function contactTypeLabel(type?: string) {
  if (type === "email") return "公开邮箱";
  if (type === "phone") return "公开电话";
  if (type === "social") return "社交媒体";
  return "联系方式";
}

function pageTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    HOME: "首页",
    PRODUCT_LIST: "产品列表",
    PRODUCT_DETAIL: "产品详情",
    BRAND: "品牌页",
    ABOUT: "公司介绍",
    CONTACT: "联系页",
    SUPPORT: "支持页",
    OTHER: "其他页面"
  };
  return labels[type ?? ""] ?? "页面";
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getWebsiteAiInsights(analysis?: WebsiteAnalysis): WebsiteAiInsights | undefined {
  const raw = asRecord(analysis?.rawResult);
  const insights = asRecord(raw.aiInsights);
  if (!Object.keys(insights).length) return undefined;
  const priceCompetitiveness = asRecord(insights.price_competitiveness);
  const priceLevel = getText(priceCompetitiveness, "level");
  return {
    business_summary: getText(insights, "business_summary"),
    customer_profile: getText(insights, "customer_profile"),
    main_business: getText(insights, "main_business"),
    product_line_analysis: getText(insights, "product_line_analysis"),
    brand_positioning: getText(insights, "brand_positioning"),
    market_channel_signals: getText(insights, "market_channel_signals"),
    oem_opportunity_assessment: getText(insights, "oem_opportunity_assessment"),
    cooperation_opportunities: getStringArray(insights.cooperation_opportunities),
    sales_entry_points: getStringArray(insights.sales_entry_points),
    suggested_next_actions: getStringArray(insights.suggested_next_actions),
    risk_notes: getStringArray(insights.risk_notes),
    evidence_pages: asArray(insights.evidence_pages).map((item) => {
      const record = asRecord(item);
      return { title: getText(record, "title"), url: getText(record, "url"), reason: getText(record, "reason") };
    }),
    missing_categories_gap: asArray(insights.missing_categories_gap).map((item) => {
      const record = asRecord(item);
      const rawScore = record.opportunity_score;
      const opportunityScore = typeof rawScore === "number" && Number.isFinite(rawScore) ? rawScore : Number(rawScore);
      return {
        category: getText(record, "category"),
        customer_has: getText(record, "customer_has") || "未明确展示",
        we_can_supply: getText(record, "we_can_supply") || "需人工确认",
        opportunity_score: Number.isFinite(opportunityScore) ? opportunityScore : 5,
        reason: getText(record, "reason"),
        data_quality_note: getText(record, "data_quality_note")
      };
    }),
    price_competitiveness: {
      level: priceLevel === "competitive" || priceLevel === "neutral" || priceLevel === "challenging" || priceLevel === "unknown" ? priceLevel : "unknown",
      summary: getText(priceCompetitiveness, "summary"),
      price_nature_note: getText(priceCompetitiveness, "price_nature_note")
    },
    unknown_factors: getStringArray(insights.unknown_factors),
    our_data_quality_note: getText(insights, "our_data_quality_note")
  };
}

function getText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function stringifyInsight(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return getText(record, "summary") || getText(record, "name") || getText(record, "description") || (Object.keys(record).length ? JSON.stringify(record) : "");
}

function fallbackProductLineText(items?: unknown[]) {
  const categories = asArray(items).map((item) => categoryName(getText(asRecord(item), "name"))).filter(Boolean);
  return categories.length ? `官网识别到的产品/业务方向包括：${categories.join("、")}。` : "官网未识别到清晰产品线，需要人工查看或补充资料。";
}

type MarkdownBlock =
  | { type: "h1" | "h2" | "h3" | "quote" | "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] };

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((row) => !row.every((cell) => /^-+$/.test(cell.replace(/:/g, "").trim())));
      if (rows.length > 1) blocks.push({ type: "table", rows });
      table = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }
    if (/^\|.+\|$/.test(line)) {
      flushParagraph();
      flushList();
      table.push(line.split("|").slice(1, -1).map((cell) => cell.trim()));
      continue;
    }
    flushTable();
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") });
    } else if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") });
    } else if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
    } else if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushAll();
  return blocks.filter((block) => block.type !== "p" || Boolean(block.text));
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function readablePriceRange(value: unknown) {
  const record = asRecord(value);
  const min = getNumber(record, "min");
  const max = getNumber(record, "max");
  const currency = getText(record, "currency") || "USD";
  if (min && max) return `${currency} ${min}-${max}`;
  if (min) return `${currency} ${min}+`;
  if (max) return `${currency} <= ${max}`;
  return "待判断";
}

function titleCase(value: string) {
  const cleaned = value.replace(/[-_]/g, " ").trim();
  if (!cleaned) return value;
  return cleaned.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function categoryName(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    products: "官网产品页",
    product: "官网产品页",
    shop: "在线商店页",
    collections: "产品集合页",
    collection: "产品集合页",
    catalog: "产品目录页",
    category: "产品分类页"
  };
  return labels[normalized] ?? titleCase(value);
}

function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}
