import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api/http";
import { getCurrentUser, hasAnyPermission, hasPermission } from "../../auth/permissions";
import { AppSelect } from "../../components/AppSelect";
import { Field } from "../../components/ui/Field";
import { showClientToast } from "../../components/Toast";
import { Switch } from "../../components/Switch";
import { useSse } from "../../hooks/useSse";
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
    queryFn: () => apiGet<EmailAccount[]>("/email-accounts")
  });
  const { data: syncStatus } = useQuery({
    queryKey: ["email-sync-status"],
    queryFn: () => apiGet<EmailSyncStatus>("/email-sync/status")
  });
  const { data: drafts = [] } = useQuery({
    queryKey: ["email-drafts", "pending"],
    queryFn: () => apiGet<EmailDraft[]>("/email-drafts")
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["email-threads"],
    queryFn: () => apiGet<EmailThread[]>("/email-threads")
  });

  useSse("inbound-mail.received", () => {
    queryClient.invalidateQueries({ queryKey: ["email-threads"] });
  });

  const createAccount = useMutation({
    mutationFn: () => apiPost("/email-accounts", normalizeAccount(accountForm)),
    onSuccess: () => {
      setMessage("邮箱账号已保存。");
      setAccountForm(defaultAccountForm());
      setEditingId("");
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "保存失败")
  });

  const updateAccount = useMutation({
    mutationFn: () => apiPatch(`/email-accounts/${editingId}`, normalizeAccount(accountForm)),
    onSuccess: () => {
      setMessage("邮箱账号已更新。");
      setAccountForm(defaultAccountForm());
      setEditingId("");
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "保存失败")
  });

  const sync = useMutation({
    mutationFn: () => apiPost<EmailSyncResult>("/email-sync/run", undefined, { toast: false }),
    onSuccess: (result) => {
      showClientToast({
        type: "success",
        title: "邮箱同步完成",
        message: `尝试 ${result.attemptedAccounts} 个账号，成功 ${result.syncedAccounts} 个，入队 ${result.enqueuedMessages} 封，失败 ${result.failedAccounts} 个，跳过 ${result.skippedAccounts} 个。`
      });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-sync-status"] });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "邮箱同步失败",
        message: error instanceof Error ? error.message : "同步失败"
      });
    }
  });

  const testAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiPost<{
        overallOk: boolean;
        smtp: { ok: boolean; message: string };
        imap: { ok: boolean; message: string };
        message: string;
      }>(`/email-accounts/${accountId}/test`),
    onSuccess: (result) => setMessage(result.message || "邮箱连接测试成功。"),
    onError: (error) => setMessage(error instanceof Error ? error.message : "测试失败")
  });

  const toggleAccount = useMutation({
    mutationFn: (account: EmailAccount) =>
      apiPatch(`/email-accounts/${account.id}`, { isActive: !account.isActive }),
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
          <h1>邮件中心</h1>
        </div>
        {canSync && (
          <button className="secondary-button" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <ShieldCheck size={16} />
            {sync.isPending ? "同步中..." : "同步邮箱"}
          </button>
        )}
      </header>

      {message ? <section className="panel loading-state">{message}</section> : null}

      <div className="metric-grid compact">
        <MiniMetric icon={<Inbox size={17} />} label="邮箱账号" value={`${accounts.length}`} />
        <MiniMetric icon={<Send size={17} />} label="邮件线程" value={`${threads.length}`} />
        <MiniMetric icon={<CheckCircle2 size={17} />} label="草稿/审核" value={`${drafts.length}`} />
      </div>

      <nav className="tab-bar">
        <Link className={`tab-link ${folder === "accounts" ? "active" : ""}`} to="/email-center/accounts">
          邮箱配置
        </Link>
        <Link className={`tab-link ${folder === "drafts" ? "active" : ""}`} to="/email-center/drafts">
          邮件草稿
        </Link>
        <Link className={`tab-link ${folder === "threads" || folder === "inbox" ? "active" : ""}`} to="/email-center/threads">
          邮件往来
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
            <h2>{editingId ? "修改邮箱账号" : "绑定邮箱账号"}</h2>
            <span>支持业务员个人邮箱和管理员共享邮箱</span>
          </div>

          <div className="form-grid">
            {accountFields.map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={accountForm[key]}
                onChange={(value) => setAccountForm({ ...accountForm, [key]: value })}
              />
            ))}
            <label>
              <span>账号范围</span>
              <AppSelect
                value={accountForm.scope}
                onChange={(scope) => setAccountForm({ ...accountForm, scope })}
                options={[
                  { value: "PERSONAL", label: "个人邮箱" },
                  ...(canManageShared ? [{ value: "SHARED" as const, label: "共享企业邮箱" }] : [])
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
            {editingId ? <div className="wide-field empty-state">密码/授权码留空表示不修改。</div> : null}
            <div className="wide-field toolbar">
              <button
                className="primary-button"
                disabled={createAccount.isPending || updateAccount.isPending}
                onClick={submitAccount}
              >
                {createAccount.isPending || updateAccount.isPending
                  ? "保存中..."
                  : editingId
                    ? "保存修改"
                    : "保存邮箱"}
              </button>
              {editingId ? (
                <button className="secondary-button" onClick={cancelEdit}>
                  取消编辑
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel-title">
            <h2>已绑定邮箱</h2>
            <span>接口不会返回密码/授权码</span>
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

const accountFields = [
  ["name", "账号名称"],
  ["email", "邮箱地址"],
  ["smtpHost", "SMTP服务器"],
  ["smtpPort", "SMTP端口"],
  ["smtpUsername", "SMTP用户名"],
  ["smtpPassword", "SMTP密码/授权码"],
  ["imapHost", "IMAP服务器"],
  ["imapPort", "IMAP端口"],
  ["imapUsername", "IMAP用户名"],
  ["imapPassword", "IMAP密码/授权码"],
  ["hourlySendLimit", "每小时上限"],
  ["dailySendLimit", "每日上限"]
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
