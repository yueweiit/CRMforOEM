import { EmptyState } from "../../components/ui/EmptyState";
import { EditIconButton } from "../../components/EditIconButton";
import { Switch } from "../../components/Switch";
import { useI18n, translate } from "../../i18n";
import type { TranslationKey } from "../../i18n/resources";

export type EmailAccount = {
  id: string;
  scope: "PERSONAL" | "SHARED";
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  dailySendLimit: number;
  hourlySendLimit: number;
  isActive: boolean;
  lastSyncAt?: string;
};

export type EmailSyncAccountStatus = {
  accountId: string;
  connectionStatus: "connecting" | "idle" | "fetching" | "reconnecting" | "disconnected" | "auth_failed";
  lastSyncAt?: string | null;
  lastError?: string;
  nextReconnectAt?: string | null;
};

export function AccountTable({
  rows,
  statuses,
  onEdit,
  onTest,
  onToggle
}: {
  rows: EmailAccount[];
  statuses: EmailSyncAccountStatus[];
  onEdit: (account: EmailAccount) => void;
  onTest: (id: string) => void;
  onToggle: (account: EmailAccount) => void;
}) {
  const { locale, t } = useI18n();
  if (!rows.length) return <EmptyState message={t("emailCenter.noAccounts")} />;

  const statusByAccount = new Map(statuses.map((status) => [status.accountId, status]));

  return (
    <table>
      <thead>
        <tr>
          <th>{t("common.name")}</th>
          <th>{t("common.email")}</th>
          <th>{t("emailCenter.accountScope")}</th>
          <th>SMTP/IMAP</th>
          <th>{t("emailCenter.limits")}</th>
          <th>{t("emailCenter.syncStatus")}</th>
          <th>{t("common.enabled")}</th>
          <th>{t("common.operation")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((account) => {
          const status = statusByAccount.get(account.id);
          return (
            <tr key={account.id}>
              <td>{account.name}</td>
              <td>{account.email}</td>
              <td>{account.scope === "SHARED" ? t("emailCenter.shared") : t("emailCenter.personal")}</td>
              <td>
                {account.smtpHost}:{account.smtpPort} / {account.imapHost}:{account.imapPort}
              </td>
              <td>
                {account.hourlySendLimit}/{t("emailCenter.perHour")} / {account.dailySendLimit}/{t("emailCenter.perDay")}
              </td>
              <td>
                <div className="stacked-cell">
                  <span className="status-pill">{syncStatusLabel(status?.connectionStatus, account.isActive, locale)}</span>
                  <span>{formatSyncTime(status?.lastSyncAt ?? account.lastSyncAt, locale)}</span>
                  {status?.lastError ? <small>{status.lastError}</small> : null}
                </div>
              </td>
              <td>
                <Switch checked={account.isActive} onChange={() => onToggle(account)} />
              </td>
              <td>
                <div className="toolbar">
                  <EditIconButton onClick={() => onEdit(account)} />
                  <button className="secondary-button" onClick={() => onTest(account.id)}>
                    {t("emailCenter.test")}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function syncStatusLabel(status: EmailSyncAccountStatus["connectionStatus"] | undefined, isActive: boolean | undefined, locale: Parameters<typeof translate>[0]) {
  if (!isActive) return translate(locale, "emailCenter.disabled");

  const labels: Record<EmailSyncAccountStatus["connectionStatus"], TranslationKey> = {
    idle: "emailCenter.idle",
    fetching: "emailCenter.fetching",
    connecting: "emailCenter.connecting",
    reconnecting: "emailCenter.reconnecting",
    disconnected: "emailCenter.disconnected",
    auth_failed: "emailCenter.authFailed"
  };

  return status ? translate(locale, labels[status]) : translate(locale, "emailCenter.disconnected");
}

function formatSyncTime(value: string | null | undefined, locale: Parameters<typeof translate>[0]) {
  return value ? `${translate(locale, "emailCenter.lastSync")} ${new Date(value).toLocaleString()}` : translate(locale, "emailCenter.neverSynced");
}
