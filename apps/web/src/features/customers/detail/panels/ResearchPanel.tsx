import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { Pencil, Trash2 } from "lucide-react";
import { AppSelect } from "../../../../components/AppSelect";
import { deleteResearchReport, getResearchReport, getResearchReportHistory, updateResearchReport } from "../../../../api/customers";
import type { CustomerDetail, ResearchReport, ResearchReportHistoryItem } from "../shared/types";
import { AnalysisSection, asArray, asRecord, getText, getStringArray, InsightList, AiVersions, statusText, isPendingStatus, researchSearchStatus, shortUrl, pageTypeLabel, formatAnalysisTime } from "../shared/ui";
import { MarkdownReport } from "../shared/Markdown";
import { Detail } from "../shared/ui";
import { EvidenceLinks } from "../shared/ui";
import { getAnalysisDetailLoadState, getAnalysisEmptyState, getDefaultAnalysisHistoryId, getNextAnalysisHistorySelection, sortAnalysisHistoryByCreatedAt } from "./analysis-history-state";
import { buildResearchSourceEvidenceView, formatSourceBasisItem, hasResearchSourceEvidence, getResearchAiMeta } from "./research-source-evidence";
import type { ResearchAiMetaView } from "./research-source-evidence";

export function ResearchPanel({ customer, customerId, isGenerating = false }: { customer: CustomerDetail; customerId: string; isGenerating?: boolean }) {
  const baseReports = customer.researchReports ?? [];
  const [historyRequested, setHistoryRequested] = useState(false);
  const historyQuery = useQuery({
    queryKey: ["customer", customerId, "research-report-history"],
    queryFn: () => getResearchReportHistory(customerId),
    enabled: Boolean(historyRequested && customerId && localStorage.getItem("accessToken"))
  });
  const historyReports: Array<ResearchReport | ResearchReportHistoryItem> = historyQuery.data?.length ? historyQuery.data : baseReports;
  const reports = useMemo(() => sortAnalysisHistoryByCreatedAt(historyReports), [historyReports]);
  const defaultReportId = useMemo(() => getDefaultAnalysisHistoryId(reports, canShowResearchReport), [reports]);
  const [selectedReportId, setSelectedReportId] = useState(defaultReportId);
  const [hasManualSelection, setHasManualSelection] = useState(false);

  useEffect(() => {
    const nextSelection = getNextAnalysisHistorySelection(reports, selectedReportId, hasManualSelection, canShowResearchReport);
    if (nextSelection !== selectedReportId) {
      setSelectedReportId(nextSelection);
      if (!reports.some((item) => item.id === selectedReportId)) {
        setHasManualSelection(false);
      }
    }
  }, [reports, hasManualSelection, selectedReportId]);

  const selectedBaseReport = baseReports.find((item) => item.id === selectedReportId) ?? baseReports.find((item) => item.id === defaultReportId) ?? baseReports[0];
  const shouldLoadReportDetail = Boolean(selectedReportId && selectedBaseReport?.id !== selectedReportId);
  const selectedReportQuery = useQuery({
    queryKey: ["customer", customerId, "research-report", selectedReportId],
    queryFn: () => getResearchReport(customerId, selectedReportId),
    enabled: shouldLoadReportDetail
  });
  const report = selectedReportQuery.data ?? selectedBaseReport ?? reports.find((item) => item.id === selectedReportId) ?? reports.find((item) => item.id === defaultReportId) ?? reports[0];
  const selectedDetailLoadState = getAnalysisDetailLoadState(shouldLoadReportDetail, selectedReportQuery);
  const isSelectedDetailLoading = selectedDetailLoadState === "loading";
  const evidence = asRecord(report?.sourceEvidence);
  const searchWarning = getText(evidence, "searchWarning") || getText(evidence, "warning");
  const aiMeta = getResearchAiMeta(report?.reportJson);
  const emptyState = getAnalysisEmptyState(Boolean(report), isGenerating);
  const selectorOptions = reports.map((item) => ({
    label: `${formatAnalysisTime(item.createdAt)} · ${statusText(item.status)}`,
    value: item.id
  }));
  const requestHistory = () => setHistoryRequested(true);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(report?.title ?? "");

  useEffect(() => {
    setEditTitle(report?.title ?? "");
  }, [report?.id]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteResearchReport(customerId, report?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "research-report-history"] });
      setDeleteOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { title?: string }) => updateResearchReport(customerId, report?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "research-report-history"] });
      setEditOpen(false);
    }
  });
  return (
    <section className="panel">
      <div className="panel-title analysis-history-title">
        <h2>客户背调报告</h2>
        <div className="analysis-history-title__actions">
          {report ? (
            <>
              <div onFocus={requestHistory} onMouseDown={requestHistory}>
                <AppSelect
                  className="analysis-history-select"
                  value={report?.id ?? ""}
                  onChange={(value) => {
                    setSelectedReportId(value);
                    setHasManualSelection(true);
                  }}
                  options={selectorOptions}
                  variant="toolbar"
                  title="历史背调报告"
                />
              </div>
              <button className="icon-button" title="编辑标题" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
              </button>
              <button className="icon-button" title="删除报告" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} />
              </button>
            </>
          ) : null}
          <span>{report ? statusText(report.status) : "未生成"}</span>
        </div>
      </div>
      {emptyState === "generating" ? <div className="loading-state">背调报告正在后台生成，完成后会自动显示。当前还没有可展示的历史报告。</div> : null}
      {emptyState === "empty" ? <div className="empty-state">尚未生成背调报告。可以先完成官网分析，再点击右上角"生成背调"。</div> : null}
      {historyQuery.isError ? <div className="error-state">历史背调报告列表加载失败，当前显示已有的概要数据。</div> : null}
      {isSelectedDetailLoading ? <div className="loading-state">正在加载历史背调报告详情...</div> : null}
      {selectedDetailLoadState === "error" ? <div className="error-state">历史背调报告详情加载失败，当前显示可用的概要信息。</div> : null}
      {report ? (
        <div className="page-stack">
          <div className="detail-grid">
            <Detail label="报告状态" value={statusText(report.status)} />
            <Detail label="公开网络搜索" value={researchSearchStatus(report)} />
            <Detail label="生成时间" value={formatAnalysisTime(report.createdAt)} />
            <Detail label="报告标题" value={report.title} />
          </div>
          {isPendingStatus(report.status) && !canShowResearchReport(report) ? <div className="empty-state">暂无可展示的背调报告。</div> : null}
          {report.status === "FAILED" ? <div className="error-state">{report.errorMessage ?? "背调报告生成失败，请稍后重试。"}</div> : null}
          {report.status === "SUCCEEDED" && aiMeta ? <AiStatusWarning meta={aiMeta} /> : null}
          {searchWarning ? <div className="loading-state">{searchWarning}</div> : null}
          {!isSelectedDetailLoading && report.finalMarkdown ? <MarkdownReport content={report.finalMarkdown} /> : null}
          {!isSelectedDetailLoading && !report.finalMarkdown && report.status === "SUCCEEDED" ? <div className="empty-state">背调任务已完成，但未返回可展示的 Markdown 报告，请查看 AI 版本记录或重新生成。</div> : null}
          <AnalysisSection title="来源依据">
            <SourceEvidence evidence={report.sourceEvidence} reportJson={report.reportJson} />
          </AnalysisSection>
          <AiVersions run={report.aiGenerationRun} />
        </div>
      ) : null}
      <Dialog v2 className="crm-action-dialog" title="编辑报告标题" visible={editOpen} onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ title: editTitle })} type="button">{updateMutation.isPending ? "保存中..." : "保存"}</button>
          </div>
        }>
        <div className="form-field">
          <label>报告标题</label>
          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: "100%" }} />
        </div>
      </Dialog>
      <Dialog v2 className="crm-action-dialog" title="确认删除" visible={deleteOpen} onClose={() => setDeleteOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} type="button">{deleteMutation.isPending ? "删除中..." : "确认删除"}</button>
          </div>
        }>
        <p>删除后数据不可恢复。确定要删除本次背调报告吗？</p>
      </Dialog>
    </section>
  );
}

function canShowResearchReport(report: { status?: string; finalMarkdown?: string }) {
  return report.status === "SUCCEEDED" || Boolean(report.finalMarkdown);
}

function AiStatusWarning({ meta }: { meta: ResearchAiMetaView }) {
  if (meta.status === "SUCCEEDED") return null;
  const messages: Record<string, string> = {
    PARTIAL: "AI报告部分完成，部分数据分组使用规则兜底。已成功部分已纳入报告。",
    FAILED: "AI报告生成失败，当前展示的是基于来源数据的系统基础报告。失败原因已记录，建议稍后重试。",
    SKIPPED: "因输入数据过大或信息量不足跳过AI总结，当前展示基础分析报告。完整证据数据仍可在来源依据中查看。"
  };
  const message = messages[meta.status] || `AI状态：${meta.status}${meta.errorMessage ? ` — ${meta.errorMessage}` : ""}`;
  return (
    <div className="warning-state">{message}</div>
  );
}

function SourceEvidence({ evidence, reportJson }: { evidence?: unknown; reportJson?: unknown }) {
  const view = buildResearchSourceEvidenceView(evidence, reportJson);
  const { websiteUrls, websitePages, products, capabilities, caseStudies, publicSearchResults, crmContacts, followups, sourceBasis, hasNewFormat } = view;
  if (!hasResearchSourceEvidence(view)) {
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
            return <span key={`page-${url}-${index}`}>{pageTypeLabel(getText(page, "pageType"))} · {getText(page, "title") || shortUrl(url)}</span>;
          })}
        </div>
      ) : null}
      {websiteUrls.length ? <div className="analysis-row"><strong>抓取URL</strong><EvidenceLinks urls={websiteUrls} /></div> : null}
      {products.length ? (
        <div className="analysis-row">
          <strong>{hasNewFormat ? "官网产品 / 我方产品" : "官网产品"}</strong>
          {products.map((item, index) => {
            const product = asRecord(item);
            return <span key={`prod-${index}`}>{getText(product, "name") || `产品 ${index + 1}`}{getText(product, "category") ? ` · ${getText(product, "category")}` : ""}</span>;
          })}
        </div>
      ) : null}
      {capabilities.length ? (
        <div className="analysis-row">
          <strong>我方产能</strong>
          {capabilities.map((item, index) => {
            const cap = asRecord(item);
            return <span key={`cap-${index}`}>{getText(cap, "name") || `产能 ${index + 1}`}{getText(cap, "category") ? ` · ${getText(cap, "category")}` : ""}</span>;
          })}
        </div>
      ) : null}
      {caseStudies.length ? (
        <div className="analysis-row">
          <strong>我方案例</strong>
          {caseStudies.map((item, index) => {
            const cs = asRecord(item);
            return <span key={`case-${index}`}>{getText(cs, "title") || `案例 ${index + 1}`}{getText(cs, "market") ? ` · ${getText(cs, "market")}` : ""}</span>;
          })}
        </div>
      ) : null}
      {publicSearchResults.length ? (
        <div className="analysis-row">
          <strong>公开搜索结果</strong>
          {publicSearchResults.map((item, index) => {
            const result = asRecord(item);
            const title = getText(result, "title") || getText(result, "url") || `搜索结果 ${index + 1}`;
            const url = getText(result, "url");
            return <span key={`search-${title}-${index}`}>{title}{url ? ` · ${shortUrl(url)}` : ""}</span>;
          })}
        </div>
      ) : null}
      {crmContacts.length ? (
        <div className="analysis-row">
          <strong>联系人</strong>
          {crmContacts.map((item, index) => {
            const contact = asRecord(item);
            if (hasNewFormat) {
              return <span key={`contact-${index}`}>{getText(contact, "name") || getText(contact, "type") || "未命名"} · {getText(contact, "email") || getText(contact, "value") || "-"}</span>;
            }
            return <span key={`contact-${index}`}>{getText(contact, "name") || "未命名"} · {getText(contact, "email") || getText(contact, "phone") || "-"}</span>;
          })}
        </div>
      ) : null}
      {followups.length ? (
        <div className="analysis-row">
          <strong>历史跟进</strong>
          {followups.map((item, index) => {
            const t = asRecord(item);
            return <span key={`followup-${index}`}>{getText(t, "title") || `跟进 ${index + 1}`}{getText(t, "status") ? ` · ${getText(t, "status")}` : ""}{getText(t, "dueAt") ? ` · ${getText(t, "dueAt").slice(0, 10)}` : ""}</span>;
          })}
        </div>
      ) : null}
      {sourceBasis.length ? (
        <div className="analysis-row">
          <strong>AI source basis</strong>
          {sourceBasis.map((item, index) => <span key={`basis-${index}`}>{formatSourceBasisItem(item, index)}</span>)}
        </div>
      ) : null}
    </div>
  );
}
