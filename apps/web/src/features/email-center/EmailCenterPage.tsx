import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { createEmailAccount, getEmailAccounts, getEmailDrafts, getEmailSyncStatus, getEmailThreads, runEmailSync, testEmailAccount, toggleEmailAccount, updateEmailAccount } from "../../api/email";
import { getCurrentUser, hasAnyPermission, hasPermission } from "../../auth/permissions";
import { AppSelect } from "../../components/AppSelect";
import { Field } from "../../components/ui/Field";
import { showClientToast } from "../../components/Toast";
import { Switch } from "../../components/Switch";
import { useSse } from "../../hooks/useSse";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/resources";
import { AccountTable, type EmailAccount, type EmailSyncAccountStatus } from "./AccountTable";
import { DraftList, type EmailDraft } from "./DraftList";
import { ThreadList, type EmailThread } from "./ThreadList";

type EmailSyncStatus = { accounts: EmailSyncAccountStatus[] };

type EmailSyncResult = {
  attemptedAccounts: number;
  syncedAccounts: number;
  failedAccounts: number;
  skippedAccounts: number;
  scannedMessages: number;
  enqueuedMessages: number;
};

export function EmailCenterPage() {
  const { folder = "accounts" } = useParams();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const currentUser = getCurrentUser();
  const canManageShared = hasPermission(currentUser, "emails.accounts.manage_shared");
  const canSync = hasAnyPermission(currentUser, [
    "emails.accounts.manage_personal",
    "emails.accounts.manage_shared",
    "settings.manage"
  ]);
  const [accountForm, setAccountForm] = useState(defaultAccountForm());
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: () => getEmailAccounts<EmailAccount[]>()
  });
  const { data: syncStatus } = useQuery({
    queryKey: ["email-sync-status"],
    queryFn: () => getEmailSyncStatus<EmailSyncStatus>()
  });
  const { data: drafts = [] } = useQuery({
    queryKey: ["email-drafts", "pending"],
    queryFn: () => getEmailDrafts<EmailDraft[]>()
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["email-threads"],
    queryFn: () => getEmailThreads<EmailThread[]>()
  });

  useSse("inbound-mail.received", () => {
    queryClient.invalidateQueries({ queryKey: ["email-threads"] });
  });

  const createAccount = useMutation({
    mutationFn: () => createEmailAccount(normalizeAccount(accountForm)),
    onSuccess: () => {
      setMessage(t("emailCenter.accountSaved"));
      setAccountForm(defaultAccountForm());
      setEditingId("");
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : t("emailCenter.saveFailed"))
  });

  const updateAccount = useMutation({
    mutationFn: () => updateEmailAccount(editingId, normalizeAccount(accountForm)),
    onSuccess: () => {
      setMessage(t("emailCenter.accountUpdated"));
      setAccountForm(defaultAccountForm());
      setEditingId("");
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : t("emailCenter.saveFailed"))
  });

  const sync = useMutation({
    mutationFn: () => runEmailSync<EmailSyncResult>({ toast: false }),
    onSuccess: (result) => {
      showClientToast({
        type: "success",
        title: t("emailCenter.syncDone"),
        message: t("emailCenter.syncDoneMessage")
          .replace("{attempted}", String(result.attemptedAccounts))
          .replace("{synced}", String(result.syncedAccounts))
          .replace("{enqueued}", String(result.enqueuedMessages))
          .replace("{failed}", String(result.failedAccounts))
          .replace("{skipped}", String(result.skippedAccounts))
      });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: t("emailCenter.syncFailed"),
        message: error instanceof Error ? error.message : t("emailCenter.syncFailedShort")
      });
    }
  });

  const testAccount = useMutation({
    mutationFn: (accountId: string) =>
      testEmailAccount<{
        overallOk: boolean;
        smtp: { ok: boolean; message: string };
        imap: { ok: boolean; message: string };
        message: string;
      }>(accountId),
    onSuccess: (result) => setMessage(result.message || t("emailCenter.testSuccess")),
    onError: (error) => setMessage(error instanceof Error ? error.message : t("emailCenter.testFailed"))
  });

  const toggleAccount = useMutation({
    mutationFn: (account: EmailAccount) =>
      toggleEmailAccount(account.id, !account.isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    }
  });

  function startEdit(account: EmailAccount) {
    setEditingId(account.id);
    setAccountForm(accountToForm(account));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId("");
    setAccountForm(defaultAccountForm());
    setMessage("");
  }

  function submitAccount() {
    if (editingId) {
      updateAccount.mutate();
      return;
    }
    createAccount.mutate();
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Email Center</p>
          <h1>{t("emailCenter.title")}</h1>
        </div>
        {canSync && (
          <button className="secondary-button" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <ShieldCheck size={16} />
            {sync.isPending ? t("emailCenter.syncing") : t("emailCenter.syncMailbox")}
          </button>
        )}
      </header>

      {message ? <section className="panel loading-state">{message}</section> : null}

      <div className="metric-grid compact">
        <MiniMetric icon={<Inbox size={17} />} label={t("emailCenter.accountMetric")} value={`${accounts.length}`} />
        <MiniMetric icon={<Send size={17} />} label={t("emailCenter.threadMetric")} value={`${threads.length}`} />
        <MiniMetric icon={<CheckCircle2 size={17} />} label={t("emailCenter.draftReviewMetric")} value={`${drafts.length}`} />
      </div>

      <nav className="tab-bar">
        <Link className={`tab-link ${folder === "accounts" ? "active" : ""}`} to="/email-center/accounts">
          {t("emailCenter.accountConfig")}
        </Link>
        <Link className={`tab-link ${folder === "drafts" ? "active" : ""}`} to="/email-center/drafts">
          {t("emailCenter.draftsTab")}
        </Link>
        <Link className={`tab-link ${folder === "threads" || folder === "inbox" ? "active" : ""}`} to="/email-center/threads">
          {t("emailCenter.threadsTab")}
        </Link>
      </nav>

      {folder === "drafts" ? (
        <DraftList
          drafts={drafts}
          purposeFilter={purposeFilter}
          onPurposeFilterChange={setPurposeFilter}
        />
      ) : folder === "threads" || folder === "inbox" ? (
        <ThreadList threads={threads} />
      ) : (
        <section className="panel">
          <div className="panel-title">
            <h2>{editingId ? t("emailCenter.editAccount") : t("emailCenter.bindAccount")}</h2>
            <span>{t("emailCenter.accountFormHint")}</span>
          </div>

          <div className="form-grid">
            {accountFields.map(([key, labelKey]) => (
              <Field
                key={key}
                label={t(labelKey)}
                value={accountForm[key]}
                onChange={(value) => setAccountForm({ ...accountForm, [key]: value })}
              />
            ))}
            <label>
              <span>{t("emailCenter.accountScope")}</span>
              <AppSelect
                value={accountForm.scope}
                onChange={(scope) => setAccountForm({ ...accountForm, scope })}
                options={[
                  { value: "PERSONAL", label: t("emailCenter.personalMailbox") },
                  ...(canManageShared ? [{ value: "SHARED" as const, label: t("emailCenter.sharedMailbox") }] : [])
                ]}
              />
            </label>
            <label>
              <span>SMTP SSL</span>
              <Switch
                checked={accountForm.smtpSecure === "true"}
                onChange={(checked) => setAccountForm({ ...accountForm, smtpSecure: String(checked) })}
              />
            </label>
            <label>
              <span>IMAP SSL</span>
              <Switch
                checked={accountForm.imapSecure === "true"}
                onChange={(checked) => setAccountForm({ ...accountForm, imapSecure: String(checked) })}
              />
            </label>
            {editingId ? <div className="wide-field empty-state">{t("emailCenter.passwordUnchangedHint")}</div> : null}
            <div className="wide-field toolbar">
              <button
                className="primary-button"
                disabled={createAccount.isPending || updateAccount.isPending}
                onClick={submitAccount}
              >
                {createAccount.isPending || updateAccount.isPending
                  ? t("common.saving")
                  : editingId
                    ? t("common.saveChanges")
                    : t("emailCenter.saveEmail")}
              </button>
              {editingId ? (
                <button className="secondary-button" onClick={cancelEdit}>
                  {t("emailCenter.cancelEdit")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel-title">
            <h2>{t("emailCenter.boundAccounts")}</h2>
            <span>{t("emailCenter.passwordHiddenHint")}</span>
          </div>
          <AccountTable
            rows={accounts}
            statuses={syncStatus?.accounts ?? []}
            onEdit={startEdit}
            onTest={(id) => testAccount.mutate(id)}
            onToggle={(account) => toggleAccount.mutate(account)}
          />
        </section>
      )}
    </section>
  );
}

function MiniMetric(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <section className="metric neutral">
      <span>{props.icon}</span>
      <div>
        <p>{props.label}</p>
        <strong>{props.value}</strong>
      </div>
    </section>
  );
}

const accountFields: ReadonlyArray<readonly [string, TranslationKey]> = [
  ["name", "emailCenter.accountNameField"],
  ["email", "emailCenter.emailAddress"],
  ["smtpHost", "emailCenter.smtpServer"],
  ["smtpPort", "emailCenter.smtpPort"],
  ["smtpUsername", "emailCenter.smtpUsername"],
  ["smtpPassword", "emailCenter.smtpPassword"],
  ["imapHost", "emailCenter.imapServer"],
  ["imapPort", "emailCenter.imapPort"],
  ["imapUsername", "emailCenter.imapUsername"],
  ["imapPassword", "emailCenter.imapPassword"],
  ["hourlySendLimit", "emailCenter.hourlyLimit"],
  ["dailySendLimit", "emailCenter.dailyLimit"]
] as const;

function accountToForm(account: EmailAccount): Record<string, string> {
  return {
    name: account.name,
    email: account.email,
    scope: account.scope,
    smtpHost: account.smtpHost,
    smtpPort: String(account.smtpPort),
    smtpSecure: String(account.smtpSecure),
    smtpUsername: account.smtpUsername,
    smtpPassword: "",
    imapHost: account.imapHost,
    imapPort: String(account.imapPort),
    imapSecure: String(account.imapSecure),
    imapUsername: account.imapUsername,
    imapPassword: "",
    hourlySendLimit: String(account.hourlySendLimit),
    dailySendLimit: String(account.dailySendLimit)
  };
}

function defaultAccountForm(): Record<string, string> {
  return {
    name: "",
    email: "",
    scope: "PERSONAL",
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: "true",
    smtpUsername: "",
    smtpPassword: "",
    imapHost: "",
    imapPort: "993",
    imapSecure: "true",
    imapUsername: "",
    imapPassword: "",
    hourlySendLimit: "20",
    dailySendLimit: "80"
  };
}

function normalizeAccount(form: Record<string, string>) {
  return {
    ...form,
    smtpPort: Number(form.smtpPort),
    imapPort: Number(form.imapPort),
    smtpSecure: form.smtpSecure === "true",
    imapSecure: form.imapSecure === "true",
    hourlySendLimit: Number(form.hourlySendLimit),
    dailySendLimit: Number(form.dailySendLimit)
  };
}
