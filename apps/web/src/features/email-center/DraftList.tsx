import {
  EMAIL_DRAFT_PURPOSES,
  emailDraftPurposeLabel,
  normalizeEmailDraftPurpose
} from "@oem-crm/shared";
import { Link } from "react-router-dom";
import { AppSelect } from "../../components/AppSelect";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatDraftRecipient, formatDraftSender } from "../../shared/utils/email-format";

export type EmailDraft = {
  id: string;
  purpose?: string;
  subject: string;
  toEmail: string;
  toNameSnapshot?: string;
  fromEmailSnapshot?: string;
  fromNameSnapshot?: string;
  status: string;
  emailAccount?: { id: string; name: string; email: string; scope?: string };
  customer?: { id: string; name: string };
  updatedAt: string;
};

export function DraftList({
  drafts,
  purposeFilter,
  onPurposeFilterChange
}: {
  drafts: EmailDraft[];
  purposeFilter: string;
  onPurposeFilterChange: (value: string) => void;
}) {
  const filteredDrafts = purposeFilter
    ? drafts.filter((draft) => normalizeEmailDraftPurpose(draft.purpose) === purposeFilter)
    : drafts;

  return (
    <section className="table-panel">
      <div className="panel-title">
        <h2>邮件草稿</h2>
        <span>{filteredDrafts.length} 封</span>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label style={{ minWidth: 240 }}>
          <span>邮件类型筛选：</span>
          <AppSelect
            variant="toolbar"
            value={purposeFilter}
            onChange={onPurposeFilterChange}
            options={[
              { value: "", label: "全部类型" },
              ...EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose) }))
            ]}
          />
        </label>
      </div>

      {filteredDrafts.length ? (
        <table>
          <thead>
            <tr>
              <th>邮件类型</th>
              <th>主题</th>
              <th>客户</th>
              <th>发件人</th>
              <th>收件人</th>
              <th>状态</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredDrafts.map((draft) => (
              <tr key={draft.id}>
                <td>{emailDraftPurposeLabel(draft.purpose)}</td>
                <td>{draft.subject}</td>
                <td>
                  {draft.customer ? (
                    <Link className="table-link" to={`/customers/${draft.customer.id}/email`}>
                      {draft.customer.name}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{formatDraftSender(draft)}</td>
                <td>{formatDraftRecipient(draft)}</td>
                <td>
                  <span className="status-pill">{draft.status}</span>
                </td>
                <td>{new Date(draft.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState message={drafts.length ? "当前筛选条件下暂无邮件草稿。" : "暂无邮件草稿。"} />
      )}
    </section>
  );
}
