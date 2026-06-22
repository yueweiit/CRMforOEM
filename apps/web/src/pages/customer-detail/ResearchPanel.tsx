import type { CustomerDetail } from "./shared/types";
import { AnalysisSection, asArray, asRecord, getText, getStringArray, InsightList, AiVersions, statusText, isPendingStatus, researchSearchStatus, shortUrl, pageTypeLabel } from "./shared/ui";
import { MarkdownReport } from "./shared/Markdown";
import { Detail } from "./shared/ui";
import { EvidenceLinks } from "./shared/ui";

export function ResearchPanel({ customer }: { customer: CustomerDetail }) {
  const report = customer.researchReports[0];
  const evidence = asRecord(report?.sourceEvidence);
  const searchWarning = getText(evidence, "searchWarning") || getText(evidence, "warning");
  return (
    <section className="panel">
      <div className="panel-title"><h2>客户背调报告</h2><span>{report ? statusText(report.status) : "未生成"}</span></div>
      {!report ? <div className="empty-state">尚未生成背调报告。可以先完成官网分析，再点击右上角"生成背调"。</div> : (
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
