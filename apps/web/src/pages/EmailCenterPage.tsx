import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api/http";
import { showClientToast } from "../components/Toast";
import { useSse } from "../hooks/useSse";

type EmailAccount = {
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

type EmailDraft = { id: string; subject: string; toEmail: string; status: string; customer?: { id: string; name: string }; updatedAt: string };
type EmailThread = { id: string; subject: string; customer?: { id: string; name: string }; lastMessageAt?: string; messages?: Array<{ direction: string; status: string; subject: string; createdAt: string }> };

export function EmailCenterPage() {
  const { folder = "accounts" } = useParams();
  const queryClient = useQueryClient();
  const [accountForm, setAccountForm] = useState(defaultAccountForm());
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");

  const { data: accounts = [] } = useQuery({ queryKey: ["email-accounts"], queryFn: () => apiGet<EmailAccount[]>("/email-accounts") });
  const { data: drafts = [] } = useQuery({ queryKey: ["email-drafts", "pending"], queryFn: () => apiGet<EmailDraft[]>("/email-drafts") });
  const { data: threads = [] } = useQuery({ queryKey: ["email-threads"], queryFn: () => apiGet<EmailThread[]>("/email-threads") });

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
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "保存失败")
  });

  const sync = useMutation({
    mutationFn: () => apiPost<{ syncedAccounts?: number }>("/email-sync/run"),
    onSuccess: (result) => {
      showClientToast({
        type: "success",
        title: "邮箱同步完成",
        message: `已处理 ${result?.syncedAccounts ?? 0} 个邮箱账号`
      });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
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
    mutationFn: (accountId: string) => apiPost<{ overallOk: boolean; smtp: { ok: boolean; message: string }; imap: { ok: boolean; message: string }; message: string }>(`/email-accounts/${accountId}/test`),
    onSuccess: (result) => setMessage(result.message || "邮箱连接测试成功。"),
    onError: (error) => setMessage(error instanceof Error ? error.message : "测试失败")
  });

  const toggleAccount = useMutation({
    mutationFn: (account: EmailAccount) => apiPatch(`/email-accounts/${account.id}`, { isActive: !account.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-accounts"] })
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
        <button className="secondary-button" disabled={sync.isPending} onClick={() => sync.mutate()}>
          <ShieldCheck size={16} />
          {sync.isPending ? "同步中..." : "同步邮箱"}
        </button>
      </header>

      {message ? <section className="panel loading-state">{message}</section> : null}

      <div className="metric-grid compact">
        <MiniMetric icon={<Inbox size={17} />} label="邮箱账号" value={`${accounts.length}`} />
        <MiniMetric icon={<Send size={17} />} label="邮件线程" value={`${threads.length}`} />
        <MiniMetric icon={<CheckCircle2 size={17} />} label="草稿/审核" value={`${drafts.length}`} />
      </div>

      <nav className="tab-bar">
        <Link className={`tab-link ${folder === "accounts" ? "active" : ""}`} to="/email-center/accounts">邮箱配置</Link>
        <Link className={`tab-link ${folder === "drafts" ? "active" : ""}`} to="/email-center/drafts">邮件草稿</Link>
        <Link className={`tab-link ${folder === "threads" || folder === "inbox" ? "active" : ""}`} to="/email-center/threads">邮件往来</Link>
      </nav>

      {folder === "drafts" ? <DraftList drafts={drafts} /> : folder === "threads" || folder === "inbox" ? <ThreadList threads={threads} /> : (
        <section className="panel">
          <div className="panel-title"><h2>{editingId ? "修改邮箱账号" : "绑定邮箱账号"}</h2><span>支持业务员个人邮箱和管理员共享邮箱</span></div>
          <div className="form-grid">
            {accountFields.map(([key, label]) => <Field key={key} label={label} value={accountForm[key]} onChange={(value) => setAccountForm({ ...accountForm, [key]: value })} />)}
            <label><span>账号范围</span><select value={accountForm.scope} onChange={(event) => setAccountForm({ ...accountForm, scope: event.target.value })}><option value="PERSONAL">个人邮箱</option><option value="SHARED">共享企业邮箱</option></select></label>
            <label><span>SMTP SSL</span><select value={accountForm.smtpSecure} onChange={(event) => setAccountForm({ ...accountForm, smtpSecure: event.target.value })}><option value="true">启用</option><option value="false">关闭</option></select></label>
            <label><span>IMAP SSL</span><select value={accountForm.imapSecure} onChange={(event) => setAccountForm({ ...accountForm, imapSecure: event.target.value })}><option value="true">启用</option><option value="false">关闭</option></select></label>
            {editingId ? <div className="wide-field empty-state">密码/授权码留空表示不修改。</div> : null}
            <div className="wide-field toolbar"><button className="primary-button" disabled={createAccount.isPending || updateAccount.isPending} onClick={submitAccount}>{createAccount.isPending || updateAccount.isPending ? "保存中..." : editingId ? "保存修改" : "保存邮箱"}</button>{editingId ? <button className="secondary-button" onClick={cancelEdit}>取消编辑</button> : null}</div>
          </div>
          <div className="panel-title"><h2>已绑定邮箱</h2><span>接口不会返回密码/授权码</span></div>
          <AccountTable rows={accounts} onEdit={startEdit} onTest={(id) => testAccount.mutate(id)} onToggle={(account) => toggleAccount.mutate(account)} />
        </section>
      )}
    </section>
  );
}

function DraftList({ drafts }: { drafts: EmailDraft[] }) {
  return <section className="table-panel"><div className="panel-title"><h2>邮件草稿</h2><span>{drafts.length} 封</span></div>{drafts.length ? <table><thead><tr><th>主题</th><th>客户</th><th>收件人</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id}><td>{draft.subject}</td><td>{draft.customer ? <Link className="table-link" to={`/customers/${draft.customer.id}/email`}>{draft.customer.name}</Link> : "-"}</td><td>{draft.toEmail}</td><td><span className="status-pill">{draft.status}</span></td><td>{new Date(draft.updatedAt).toLocaleString()}</td></tr>)}</tbody></table> : <div className="empty-state">暂无邮件草稿。</div>}</section>;
}

function ThreadList({ threads }: { threads: EmailThread[] }) {
  return <section className="table-panel"><div className="panel-title"><h2>邮件往来记录</h2><span>{threads.length} 条线程</span></div>{threads.length ? <table><thead><tr><th>主题</th><th>客户</th><th>最近邮件</th><th>状态</th><th>时间</th></tr></thead><tbody>{threads.map((thread) => <tr key={thread.id}><td>{thread.subject}</td><td>{thread.customer ? <Link className="table-link" to={`/customers/${thread.customer.id}/email`}>{thread.customer.name}</Link> : "-"}</td><td>{thread.messages?.[0]?.direction ?? "-"}</td><td>{thread.messages?.[0]?.status ?? "-"}</td><td>{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"}</td></tr>)}</tbody></table> : <div className="empty-state">暂无邮件往来。</div>}</section>;
}

function AccountTable({ rows, onEdit, onTest, onToggle }: { rows: EmailAccount[]; onEdit: (account: EmailAccount) => void; onTest: (id: string) => void; onToggle: (account: EmailAccount) => void }) {
  if (!rows.length) return <div className="empty-state">暂无邮箱账号。</div>;
  return <table><thead><tr><th>名称</th><th>邮箱</th><th>范围</th><th>SMTP/IMAP</th><th>上限</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.email}</td><td>{account.scope === "SHARED" ? "共享" : "个人"}</td><td>{account.smtpHost}:{account.smtpPort} / {account.imapHost}:{account.imapPort}</td><td>{account.hourlySendLimit}/小时 · {account.dailySendLimit}/天</td><td><span className="status-pill">{account.isActive ? "启用" : "停用"}</span></td><td><div className="toolbar"><button className="secondary-button" onClick={() => onEdit(account)}>编辑</button><button className="secondary-button" onClick={() => onTest(account.id)}>测试</button><button className="secondary-button" onClick={() => onToggle(account)}>{account.isActive ? "停用" : "启用"}</button></div></td></tr>)}</tbody></table>;
}

function MiniMetric(props: { icon: ReactNode; label: string; value: string }) {
  return <section className="metric neutral"><span>{props.icon}</span><div><p>{props.label}</p><strong>{props.value}</strong></div></section>;
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{props.label}</span><input value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
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
];

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
