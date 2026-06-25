import { useLayoutEffect, useRef } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { NotebookTabs } from "lucide-react";
import { Field } from "../../../../components/ui/Field";
import type { WebsiteAnalysis, WebsiteAiInsights, WebsiteAnalysisPage, OemScore, AiRun, ResearchReport } from "./types";

// ── Shared utility functions ──

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function getText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

export function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export function stringifyInsight(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return getText(record, "summary") || getText(record, "name") || getText(record, "description") || (Object.keys(record).length ? JSON.stringify(record) : "");
}

export function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

export function scoreLabel(key: string) {
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

export function gradeText(grade: string) {
  const labels: Record<string, string> = {
    A: "优先开发",
    B: "正常开发",
    C: "观察开发",
    D: "暂缓开发"
  };
  return labels[grade] ?? "待判断";
}

export function statusText(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "排队中",
    RUNNING: "分析中",
    SUCCEEDED: "分析完成",
    FAILED: "分析失败"
  };
  return labels[status] ?? status;
}

export function isPendingStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}

export function researchSearchStatus(report: ResearchReport) {
  if (isPendingStatus(report.status)) return "检测中，完成后显示是否启用";
  if (report.status === "FAILED") return "未完成";
  return report.searchEnabled ? "已启用" : "未启用，基于官网与CRM资料";
}

export function contactTypeLabel(type?: string) {
  if (type === "email") return "公开邮箱";
  if (type === "phone") return "公开电话";
  if (type === "social") return "社交媒体";
  return "联系方式";
}

export function pageTypeLabel(type?: string) {
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

function titleCase(value: string) {
  const cleaned = value.replace(/[-_]/g, " ").trim();
  if (!cleaned) return value;
  return cleaned.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

export function categoryName(value: string) {
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

export function readablePriceRange(value: unknown) {
  const record = asRecord(value);
  const min = getNumber(record, "min");
  const max = getNumber(record, "max");
  const currency = getText(record, "currency") || "USD";
  if (min && max) return `${currency} ${min}-${max}`;
  if (min) return `${currency} ${min}+`;
  if (max) return `${currency} <= ${max}`;
  return "待判断";
}

export function fallbackProductLineText(items?: unknown[]) {
  const categories = asArray(items).map((item) => categoryName(getText(asRecord(item), "name"))).filter(Boolean);
  return categories.length ? `官网识别到的产品/业务方向包括：${categories.join("、")}。` : "官网未识别到清晰产品线，需要人工查看或补充资料。";
}

export function getWebsiteAiInsights(analysis?: WebsiteAnalysis): WebsiteAiInsights | undefined {
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

export type WebsiteAiMetaView = {
  mode: string;
  status: string;
  inputChars: number;
  errorKind?: string;
  errorMessage?: string;
};

export function getWebsiteAiMeta(analysis?: WebsiteAnalysis): WebsiteAiMetaView | undefined {
  const raw = asRecord(analysis?.rawResult);
  const meta = asRecord(raw.aiMeta);
  if (!Object.keys(meta).length) return undefined;
  return {
    mode: getText(meta, "mode"),
    status: getText(meta, "status"),
    inputChars: getNumber(meta, "inputChars"),
    errorKind: getText(meta, "errorKind") || undefined,
    errorMessage: getText(meta, "errorMessage") || undefined
  };
}

// ── Shared UI components ──

export function SimpleRows({ rows, empty }: { rows: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  return <div className="task-list">{rows.map((row) => <div className="task-row" key={row.id}><NotebookTabs size={16} /><div><strong>{row.title}</strong><span>{row.meta}</span></div></div>)}</div>;
}

export function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`detail-block ${wide ? "wide-field" : ""}`}><strong>{label}</strong><span>{value}</span></div>;
}

export function AnalysisSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="analysis-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

export function EvidenceLinks({ urls }: { urls?: unknown[] }) {
  const values = getStringArray(urls);
  if (!values.length) return null;
  return (
    <div className="evidence-links">
      {values.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{shortUrl(url)}</a>)}
    </div>
  );
}

export function InsightList({ items, empty }: { items?: unknown; empty: string }) {
  const values = asArray(items).map(stringifyInsight).filter(Boolean);
  if (!values.length) return <div className="empty-state">{empty}</div>;
  return <ul className="analysis-bullets">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>;
}

export function AiVersions({ run }: { run?: AiRun }) {
  const versions = run?.versions ?? [];
  if (!versions.length) return null;
  return <details className="ai-versions"><summary>AI与人工版本记录 ({versions.length})</summary>{versions.map((version) => <pre key={version.id}>{version.versionType} · {new Date(version.createdAt).toLocaleString()}\n{version.content}</pre>)}</details>;
}

export function CommercialPanel(props: { title: string; rows: Array<{ id: string; title: string; meta: string }>; form: Record<string, string>; setForm: (v: Record<string, string>) => void; onSubmit: () => void; fields: string[][] }) {
  return <section className="panel"><div className="panel-title"><h2>{props.title}</h2><span>{props.rows.length} 条</span></div><SimpleRows rows={props.rows} empty={`暂无${props.title}。`} /><div className="form-grid compact-form">{props.fields.map(([key, label]) => <Field key={key} label={label} value={props.form[key]} onChange={(value) => props.setForm({ ...props.form, [key]: value })} />)}<div><button className="secondary-button" onClick={props.onSubmit}>新增</button></div></div></section>;
}

export function AutoResizeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
