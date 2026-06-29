import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { AppSelect } from "../../../../components/AppSelect";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { deleteWebsiteAnalysis, getWebsiteAnalysis, getWebsiteAnalysisHistory, updateWebsiteAnalysis } from "../../../../api/customers";
import type { CustomerDetail, WebsiteAnalysis, WebsiteAnalysisHistoryItem, WebsiteAiInsights, WebsiteAnalysisPage, WebsiteAnalysisProduct } from "../shared/types";
import { AnalysisSection, asArray, asRecord, getText, getNumber, getStringArray, stringifyInsight, InsightList, EvidenceLinks, statusText, isPendingStatus, contactTypeLabel, pageTypeLabel, shortUrl, categoryName, readablePriceRange, fallbackProductLineText, getWebsiteAiInsights, getWebsiteAiMeta, formatAnalysisTime } from "../shared/ui";
import type { WebsiteAiMetaView } from "../shared/ui";
import { Detail } from "../shared/ui";
import { getAnalysisDetailLoadState, getAnalysisEmptyState } from "./analysis-history-state";
import { getDefaultWebsiteAnalysisId, getNextWebsiteAnalysisSelection, hasWebsiteAnalysisCrawlerData, shouldShowWebsiteAnalysisReport, sortWebsiteAnalysesByCreatedAt } from "./website-analysis-panel-state";
import { WebsiteAnalysisEditDialog, type WebsiteAnalysisUpdatePayload } from "./WebsiteAnalysisEditDialog";

export function WebsiteAnalysisPanel({ customer, customerId, isGenerating = false }: { customer: CustomerDetail; customerId: string; isGenerating?: boolean }) {
  const baseAnalyses = customer.websiteAnalyses ?? [];
  const [historyRequested, setHistoryRequested] = useState(false);
  const historyQuery = useQuery({
    queryKey: ["customer", customerId, "website-analysis-history"],
    queryFn: () => getWebsiteAnalysisHistory(customerId),
    enabled: Boolean(historyRequested && customerId && localStorage.getItem("accessToken"))
  });
  const historyAnalyses: Array<WebsiteAnalysis | WebsiteAnalysisHistoryItem> = historyQuery.data?.length ? historyQuery.data : baseAnalyses;
  const analyses = useMemo(() => sortWebsiteAnalysesByCreatedAt(historyAnalyses), [historyAnalyses]);
  const defaultAnalysisId = useMemo(() => getDefaultWebsiteAnalysisId(analyses), [analyses]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(defaultAnalysisId);
  const [hasManualSelection, setHasManualSelection] = useState(false);

  useEffect(() => {
    const nextSelection = getNextWebsiteAnalysisSelection(analyses, selectedAnalysisId, hasManualSelection);
    if (nextSelection !== selectedAnalysisId) {
      setSelectedAnalysisId(nextSelection);
      if (!analyses.some((item) => item.id === selectedAnalysisId)) {
        setHasManualSelection(false);
      }
    }
  }, [analyses, hasManualSelection, selectedAnalysisId]);

  const selectedBaseAnalysis = baseAnalyses.find((item) => item.id === selectedAnalysisId) ?? baseAnalyses.find((item) => item.id === defaultAnalysisId) ?? baseAnalyses[0];
  const shouldLoadAnalysisDetail = Boolean(selectedAnalysisId && selectedBaseAnalysis?.id !== selectedAnalysisId);
  const selectedAnalysisQuery = useQuery({
    queryKey: ["website-analysis", selectedAnalysisId],
    queryFn: () => getWebsiteAnalysis(selectedAnalysisId),
    enabled: shouldLoadAnalysisDetail
  });
  const analysis = selectedAnalysisQuery.data ?? selectedBaseAnalysis ?? analyses.find((item) => item.id === selectedAnalysisId) ?? analyses.find((item) => item.id === defaultAnalysisId) ?? analyses[0];
  const selectedDetailLoadState = getAnalysisDetailLoadState(shouldLoadAnalysisDetail, selectedAnalysisQuery);
  const isSelectedDetailLoading = selectedDetailLoadState === "loading";
  const validPages = (analysis?.pages ?? []).filter((page) => !page.errorMessage);
  const failedPages = (analysis?.pages ?? []).filter((page) => page.errorMessage);
  const aiInsights = getWebsiteAiInsights(analysis);
  const aiMeta = getWebsiteAiMeta(analysis);
  const rawResult = asRecord(analysis?.rawResult);
  const sourceEvidence = asRecord(rawResult.sourceEvidence);
  const aiInsightError = getText(rawResult, "aiInsightError");
  const hasCrawlerData = hasWebsiteAnalysisCrawlerData(analysis);
  const canShowReport = !isSelectedDetailLoading && shouldShowWebsiteAnalysisReport(analysis?.status, hasCrawlerData);
  const emptyState = getAnalysisEmptyState(Boolean(analysis), isGenerating);
  const selectorOptions = analyses.map((item) => ({
    label: `${formatAnalysisTime(item.createdAt)} · ${statusText(item.status)}`,
    value: item.id
  }));
  const requestHistory = () => setHistoryRequested(true);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteWebsiteAnalysis(analysis?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "website-analysis-history"] });
      setDeleteOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: WebsiteAnalysisUpdatePayload) =>
      updateWebsiteAnalysis(analysis?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "website-analysis-history"] });
      setEditOpen(false);
    }
  });

  return (
    <section className="panel">
      <div className="panel-title website-analysis-title">
        <h2>客户官网分析</h2>
        <div className="website-analysis-title__actions">
          {analysis ? (
            <>
              <div onFocus={requestHistory} onMouseDown={requestHistory}>
                <AppSelect
                  className="website-analysis-select"
                  value={analysis?.id ?? ""}
                  onChange={(value) => {
                    setSelectedAnalysisId(value);
                    setHasManualSelection(true);
                  }}
                  options={selectorOptions}
                  variant="toolbar"
                  title="历史官网分析"
                />
              </div>
              <EditIconButton label="编辑分析" onClick={() => setEditOpen(true)} />
              <DeleteIconButton label="删除分析" onClick={() => setDeleteOpen(true)} />
            </>
          ) : null}
          <span>{analysis ? statusText(analysis.status) : "未分析"}</span>
        </div>
      </div>
      {!customer.websiteUrl ? <div className="empty-state">请先在"概览"里编辑并保存客户官网 URL，然后再点击右上角"官网分析"。</div> : null}
      {emptyState === "generating" ? <div className="loading-state">官网分析正在后台生成，完成后会自动显示。当前还没有可展示的历史报告。</div> : null}
      {emptyState === "empty" ? <div className="empty-state">尚未发起官网分析。</div> : null}
      {historyQuery.isError ? <div className="error-state">历史官网分析列表加载失败，当前显示已有的概要数据。</div> : null}
      {isSelectedDetailLoading ? <div className="loading-state">正在加载历史官网分析详情...</div> : null}
      {selectedDetailLoadState === "error" ? <div className="error-state">历史官网分析详情加载失败，当前显示可用的概要信息。</div> : null}
      {analysis ? (
        <div className="page-stack">
          <div className="detail-grid">
            <Detail label="分析状态" value={statusText(analysis.status)} />
            <Detail label="官网完整度" value={analysis.websiteCompleteness ? `${analysis.websiteCompleteness}/100` : "待判断"} />
            <Detail label="产品数量" value={analysis.productCount ? `${analysis.productCount} 个` : "未识别到明确数量"} />
            <Detail label="价格定位" value={analysis.pricePositioning || readablePriceRange(analysis.priceRange)} />
            <Detail label="官网语言" value={analysis.detectedLanguage || "-"} />
          </div>

          {analysis.status === "FAILED" ? <div className="error-state">{analysis.errorMessage ?? "官网分析失败，请检查官网是否可访问。"}</div> : null}
          {isPendingStatus(analysis.status) && !canShowReport ? <div className="empty-state">暂无可展示的官网分析报告。</div> : null}

          {analysis.status !== "FAILED" && aiInsightError ? (
            <div className="warning-state">官网抓取已完成，AI总结生成失败，当前展示的是抓取结果与基础分析。失败原因：{aiInsightError}</div>
          ) : null}
          {analysis.status !== "FAILED" && !aiInsightError && aiMeta ? <AiStatusWarning meta={aiMeta} /> : null}

          {canShowReport ? <WebsiteBusinessReportV2 analysis={analysis} insights={aiInsights} aiMeta={aiMeta} hasAiInsightError={Boolean(aiInsightError)} sourceEvidence={sourceEvidence} /> : null}

          <details className="ai-versions">
            <summary>抓取异常与技术明细</summary>
            <FailedPageList pages={failedPages} />
            <pre>{JSON.stringify(analysis.rawResult ?? analysis, null, 2)}</pre>
          </details>
        </div>
      ) : null}
      <WebsiteAnalysisEditDialog
        key={analysis?.id}
        open={editOpen}
        analysis={analysis}
        busy={updateMutation.isPending}
        onClose={() => setEditOpen(false)}
        onSave={(payload) => updateMutation.mutate(payload)}
      />
      <WebsiteAnalysisDeleteDialog
        open={deleteOpen}
        busy={deleteMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </section>
  );
}

function WebsiteBusinessReportV2({ analysis, insights, aiMeta, hasAiInsightError, sourceEvidence }: { analysis: WebsiteAnalysis; insights?: WebsiteAiInsights; aiMeta?: WebsiteAiMetaView; hasAiInsightError?: boolean; sourceEvidence?: Record<string, unknown> }) {
  const summary = insights?.business_summary || "官网分析已完成，但暂未生成完整客户画像。建议重新分析或补充公开搜索能力。";
  const validPages = (analysis.pages ?? []).filter((page) => !page.errorMessage);
  return (
    <section className="analysis-report">
      <div className="analysis-report__summary">
        <span>客户分析结论</span>
        <p>{summary}</p>
        {hasAiInsightError || aiMeta?.status === "FAILED" ? <p style={{ marginTop: 8, color: "#a16207", fontSize: 13 }}>AI总结未完成，以下内容优先基于官网抓取结果和系统基础分析生成。</p> : null}
        {aiMeta?.status === "PARTIAL" ? <p style={{ marginTop: 8, color: "#a16207", fontSize: 13 }}>AI分析部分完成，部分分组使用规则兜底。已成功信息已纳入以下报告。</p> : null}
        {aiMeta?.status === "SKIPPED" ? <p style={{ marginTop: 8, color: "#a16207", fontSize: 13 }}>AI总结因输入过大或信息量不足跳过。以下内容基于官网抓取结果和系统基础分析。</p> : null}
        {insights?.our_data_quality_note ? <p style={{ marginTop: 8, color: "#b45309", fontSize: 13 }}>数据质量提示：{insights.our_data_quality_note}</p> : null}
        <div className="analysis-report__generated-at">生成时间：{formatAnalysisTime(analysis.createdAt)}</div>
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
          <AnalysisSection title="来源追溯">
            <SourceEvidenceSection data={sourceEvidence} />
          </AnalysisSection>
        </div>
      </div>
    </section>
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

function AiStatusWarning({ meta }: { meta: WebsiteAiMetaView }) {
  if (meta.status === "SUCCEEDED") return null;
  const messages: Record<string, string> = {
    PARTIAL: "官网数据较多，AI分析部分完成。已成功分组仍参与报告生成，完整抓取数据可在技术明细中查看。",
    FAILED: "官网抓取已完成，但AI总结未完整生成。当前展示的是抓取结果与系统基础分析，建议稍后重试AI总结。",
    SKIPPED: "因输入过大或信息量不足跳过AI总结，当前展示基础抓取报告。完整抓取数据仍保存在技术明细中。"
  };
  const message = messages[meta.status] || `AI状态：${meta.status}${meta.errorMessage ? ` — ${meta.errorMessage}` : ""}`;
  return (
    <div className="warning-state">{message}</div>
  );
}

type SourceEvidenceData = Record<string, unknown>;

function SourceEvidenceSection({ data }: { data?: SourceEvidenceData }) {
  const pages = asArray((data as Record<string, unknown> | undefined)?.pages);
  const products = asArray((data as Record<string, unknown> | undefined)?.products);
  const contacts = asArray((data as Record<string, unknown> | undefined)?.contacts);
  const hasAny = pages.length > 0 || products.length > 0 || contacts.length > 0;

  if (!hasAny) return <div className="empty-state">暂无可追溯的原始证据来源。完整抓取数据请查看下方"抓取异常与技术明细"。</div>;

  return (
    <div className="analysis-list">
      {pages.length > 0 ? (
        <div className="analysis-row">
          <strong>抓取页面 ({pages.length})</strong>
          <span>{pages.slice(0, 6).map((page) => {
            const record = asRecord(page);
            return getText(record, "title") || shortUrl(getText(record, "url"));
          }).join("、")}{pages.length > 6 ? ` 等${pages.length}个页面` : ""}</span>
          <EvidenceLinks urls={pages.map((page) => getText(asRecord(page), "url")).filter(Boolean)} />
        </div>
      ) : null}
      {products.length > 0 ? (
        <div className="analysis-row">
          <strong>识别产品 ({products.length})</strong>
          <span>{products.slice(0, 6).map((product) => getText(asRecord(product), "name")).filter(Boolean).join("、")}{products.length > 6 ? ` 等${products.length}个产品` : ""}</span>
        </div>
      ) : null}
      {contacts.length > 0 ? (
        <div className="analysis-row">
          <strong>公开联系方式 ({contacts.length})</strong>
          <span>{contacts.slice(0, 4).map((contact) => {
            const record = asRecord(contact);
            return `${contactTypeLabel(getText(record, "type"))}: ${getText(record, "value")}`;
          }).join("、")}{contacts.length > 4 ? ` 等${contacts.length}个` : ""}</span>
        </div>
      ) : null}
    </div>
  );
}

function WebsiteAnalysisDeleteDialog({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog v2 className="crm-action-dialog" title="确认删除" visible={open} onClose={onClose}
      footer={
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy} onClick={onConfirm} type="button">{busy ? "删除中..." : "确认删除"}</button>
        </div>
      }>
      <p>删除后数据不可恢复。确定要删除本次官网分析吗？</p>
    </Dialog>
  );
}
