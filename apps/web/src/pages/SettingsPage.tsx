import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ListChecks, LogOut, Mail, Shield, SlidersHorizontal, Users } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost, clearSessionAndRedirect } from "../api/http";

const settings = [
  { key: "users", label: "用户管理", icon: Users },
  { key: "roles", label: "角色权限", icon: Shield },
  { key: "customer-dictionaries", label: "客户字典", icon: ListChecks },
  { key: "email-accounts", label: "邮箱参数", icon: Mail },
  { key: "ai", label: "AI配置", icon: KeyRound },
  { key: "scoring", label: "评分权重", icon: SlidersHorizontal },
  { key: "blacklist", label: "黑名单", icon: ListChecks },
  { key: "audit-logs", label: "操作日志", icon: ListChecks },
  { key: "logout", label: "登出", icon: LogOut }
];

type UserRow = { id: string; email: string; name: string; title?: string; isActive: boolean; team?: { name: string }; userRoles: Array<{ role: { code: string; name: string } }> };
type RoleRow = { id: string; code: string; name: string; dataScope: string; rolePermissions: Array<{ permission: { code: string; name: string } }> };
type DictionaryRow = { id: string; name: string; description?: string; isActive: boolean };
type BlacklistRule = { id: string; type: string; value: string; reason?: string; isActive: boolean; createdAt: string };
type AuditLog = { id: string; action: string; entityType: string; entityId?: string; actor?: { name: string; email: string }; createdAt: string };

export function SettingsPage() {
  const { section = "users" } = useParams();
  const current = settings.find((item) => item.key === section) ?? settings[0];
  const Icon = current.icon;
  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">System Settings</p>
          <h1>系统设置</h1>
        </div>
      </header>
      <nav className="tab-bar">
        {settings.map((item) => <NavLink key={item.key} to={`/settings/${item.key}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}><item.icon size={15} />{item.label}</NavLink>)}
      </nav>
      <section className="panel">
        <div className="panel-title">
          <h2><Icon size={18} />{current.label}</h2>
          <span>私有化部署配置</span>
        </div>
        {section === "roles" ? <RolesPanel /> : section === "customer-dictionaries" ? <CustomerDictionariesPanel /> : section === "blacklist" ? <BlacklistPanel /> : section === "audit-logs" ? <AuditPanel /> : section === "email-accounts" ? <EmailSettingsHint /> : section === "ai" ? <AiPanel /> : section === "scoring" ? <ScoringPanel /> : section === "logout" ? <LogoutPanel /> : <UsersPanel />}
      </section>
    </section>
  );
}

function UsersPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", name: "", password: "ChangeMe123!", title: "", roleCodes: "SALES_REP" });
  const { data = [] } = useQuery({ queryKey: ["settings-users"], queryFn: () => apiGet<UserRow[]>("/settings/users") });
  const create = useMutation({
    mutationFn: () => apiPost("/settings/users", { ...form, roleCodes: splitList(form.roleCodes) }),
    onSuccess: () => {
      setForm({ email: "", name: "", password: "ChangeMe123!", title: "", roleCodes: "SALES_REP" });
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    }
  });
  const toggle = useMutation({ mutationFn: (user: UserRow) => apiPatch(`/settings/users/${user.id}`, { isActive: !user.isActive }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings-users"] }) });
  return (
    <div className="page-stack">
      <div className="form-grid">
        <Field label="邮箱" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Field label="姓名" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="初始密码" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        <Field label="角色Code" value={form.roleCodes} onChange={(roleCodes) => setForm({ ...form, roleCodes })} />
        <div className="wide-field"><button className="primary-button" onClick={() => create.mutate()} disabled={!form.email || !form.name || create.isPending}>新增用户</button></div>
      </div>
      <Table headers={["姓名", "邮箱", "角色", "团队", "状态", "操作"]} rows={data.map((user) => [user.name, user.email, user.userRoles.map((item) => item.role.name).join(", "), user.team?.name ?? "-", user.isActive ? "启用" : "停用", <button className="secondary-button" onClick={() => toggle.mutate(user)}>{user.isActive ? "停用" : "启用"}</button>])} />
    </div>
  );
}

function RolesPanel() {
  const { data = [] } = useQuery({ queryKey: ["settings-roles"], queryFn: () => apiGet<RoleRow[]>("/settings/roles") });
  return <Table headers={["角色", "数据范围", "权限"]} rows={data.map((role) => [role.name, role.dataScope, role.rolePermissions.map((item) => item.permission.code).join(", ")])} />;
}

function CustomerDictionariesPanel() {
  return (
    <div className="content-grid">
      <DictionaryPanel title="客户来源" queryKey="customer-sources" path="/settings/customer-sources" placeholder="如 Google搜索、展会、LinkedIn" />
      <DictionaryPanel title="客户类型" queryKey="customer-types" path="/settings/customer-types" placeholder="如 品牌商、批发商、分销商" />
    </div>
  );
}

function DictionaryPanel(props: { title: string; queryKey: string; path: string; placeholder: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const { data = [] } = useQuery({ queryKey: [props.queryKey], queryFn: () => apiGet<DictionaryRow[]>(props.path) });
  const create = useMutation({
    mutationFn: () => apiPost(props.path, form),
    onSuccess: () => {
      setForm({ name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const toggle = useMutation({
    mutationFn: (row: DictionaryRow) => apiPatch(`${props.path}/${row.id}`, { isActive: !row.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const save = useMutation({
    mutationFn: (row: DictionaryRow) => {
      const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
      return apiPatch(`${props.path}/${row.id}`, draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  return (
    <section className="panel">
      <div className="panel-title"><h2>{props.title}</h2><span>{data.length} 项</span></div>
      <div className="form-grid compact-form">
        <Field label="名称" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="说明" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <div className="wide-field"><button className="primary-button" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>新增{props.title}</button></div>
      </div>
      <div className="empty-state">{props.placeholder}</div>
      <Table
        headers={["名称", "说明", "状态", "操作"]}
        rows={data.map((row) => {
          const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
          return [
            <input className="table-input" value={draft.name} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, name: event.target.value } })} />,
            <input className="table-input" value={draft.description} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, description: event.target.value } })} />,
            row.isActive ? "启用" : "停用",
            <div className="toolbar">
              <button className="secondary-button" disabled={!draft.name || save.isPending} onClick={() => save.mutate(row)}>保存</button>
              <button className="secondary-button" onClick={() => toggle.mutate(row)}>{row.isActive ? "停用" : "启用"}</button>
            </div>
          ];
        })}
      />
    </section>
  );
}

function BlacklistPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: "EMAIL", value: "", reason: "" });
  const { data = [] } = useQuery({ queryKey: ["blacklist-rules"], queryFn: () => apiGet<BlacklistRule[]>("/blacklist-rules") });
  const create = useMutation({ mutationFn: () => apiPost("/blacklist-rules", form), onSuccess: () => { setForm({ type: "EMAIL", value: "", reason: "" }); queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }); } });
  const toggle = useMutation({ mutationFn: (rule: BlacklistRule) => apiPatch(`/blacklist-rules/${rule.id}`, { isActive: !rule.isActive }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }) });
  return (
    <div className="page-stack">
      <div className="form-grid">
        <label><span>类型</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="EMAIL">邮箱</option><option value="DOMAIN">域名</option><option value="COMPANY_NAME">公司名</option><option value="COUNTRY">国家</option><option value="KEYWORD">关键词</option></select></label>
        <Field label="值" value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <Field label="原因" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <div><button className="primary-button" disabled={!form.value} onClick={() => create.mutate()}>加入黑名单</button></div>
      </div>
      <Table headers={["类型", "值", "原因", "状态", "操作"]} rows={data.map((rule) => [rule.type, rule.value, rule.reason ?? "-", rule.isActive ? "启用" : "停用", <button className="secondary-button" onClick={() => toggle.mutate(rule)}>{rule.isActive ? "停用" : "启用"}</button>])} />
    </div>
  );
}

function AuditPanel() {
  const { data = [] } = useQuery({ queryKey: ["audit-logs"], queryFn: () => apiGet<AuditLog[]>("/settings/audit-logs") });
  return <Table headers={["操作", "对象", "操作者", "时间"]} rows={data.map((log) => [log.action, `${log.entityType}:${log.entityId ?? "-"}`, log.actor?.name ?? "-", new Date(log.createdAt).toLocaleString()])} />;
}

function EmailSettingsHint() {
  return <div className="empty-state">邮箱账号配置已在“邮件中心 → 邮箱配置”中实现。管理员可以创建共享企业邮箱，业务员可以绑定个人邮箱。</div>;
}

function AiPanel() {
  return <div className="detail-grid"><div className="detail-block"><strong>OPENAI_API_KEY</strong><span>已在服务端 .env 中配置，不在前端展示。</span></div><div className="detail-block"><strong>AI_BASE_URL</strong><span>当前使用 OpenAI 兼容网关地址。</span></div><div className="detail-block"><strong>AI_MODEL</strong><span>当前模型：astron-code-latest。</span></div></div>;
}

function ScoringPanel() {
  return <div className="empty-state">当前评分权重以内置规则运行：产品、市场、价格、品牌、官网、联系人、机会和风险。后续可扩展为数据库配置。</div>;
}

function LogoutPanel() {
  const logout = useMutation({
    mutationFn: () => apiPost("/auth/logout"),
    onSettled: () => clearSessionAndRedirect()
  });
  const currentUser = (() => {
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) as { name?: string; email?: string } : null;
    } catch {
      return null;
    }
  })();
  return (
    <div className="page-stack" style={{ alignItems: "center", paddingBlock: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {currentUser ? (
          <>
            <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{currentUser.name}</p>
            <p style={{ color: "var(--color-muted)", marginBlock: 4 }}>{currentUser.email}</p>
          </>
        ) : null}
        <p style={{ color: "var(--color-muted)", marginBlock: 16 }}>确认要登出当前账号吗？</p>
        <button
          className="primary-button"
          style={{ background: "var(--color-danger, #dc2626)", borderColor: "var(--color-danger, #dc2626)" }}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? "登出中..." : "确认登出"}
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{props.label}</span><input value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function Table(props: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!props.rows.length) return <div className="empty-state">暂无数据。</div>;
  return <table><thead><tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{props.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
