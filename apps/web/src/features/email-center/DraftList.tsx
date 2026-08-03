import {
  EMAIL_DRAFT_PURPOSES,
  emailDraftPurposeLabel,
  emailDraftStatusLabel,
  normalizeEmailDraftPurpose
} from "@oem-crm/shared";
import { Link } from "react-router-dom";
import { AppSelect } from "../../components/AppSelect";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n";
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
  const { locale, t } = useI18n();
  const filteredDrafts = purposeFilter
    ? drafts.filter((draft) => normalizeEmailDraftPurpose(draft.purpose) === purposeFilter)
    : drafts;

  return (
    <section className="table-panel">
      <div className="panel-title">
        <h2>{t("emailCenter.draftsTitle")}</h2>
        <span>{filteredDrafts.length} {t("emailCenter.draftUnit")}</span>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label style={{ minWidth: 240 }}>
          <span>{t("emailCenter.purposeFilter")}</span>
          <AppSelect
            variant="toolbar"
            value={purposeFilter}
            onChange={onPurposeFilterChange}
            options={[
              { value: "", label: t("common.allTypes") },
              ...EMAIL_DRAFT_PURPOSES.map((purpose) => ({ value: purpose, label: emailDraftPurposeLabel(purpose, locale) }))
            ]}
          />
        </label>
      </div>

      {filteredDrafts.length ? (
        <table>
          <thead>
            <tr>
              <th>{t("emailCenter.draftPurpose")}</th>
              <th>{t("emailCenter.subject")}</th>
              <th>{t("common.customer")}</th>
              <th>{t("emailCenter.sender")}</th>
              <th>{t("emailCenter.recipient")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.updatedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredDrafts.map((draft) => (
              <tr key={draft.id}>
                <td>{emailDraftPurposeLabel(draft.purpose, locale)}</td>
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
                  <span className="status-pill">{emailDraftStatusLabel(draft.status, locale)}</span>
                </td>
                <td>{new Date(draft.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState message={drafts.length ? t("emailCenter.emptyFilteredDrafts") : t("emailCenter.emptyDrafts")} />
      )}
    </section>
  );
}
