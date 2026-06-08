import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ListChecks, LogOut, Mail, Shield, SlidersHorizontal, Users } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { EMAIL_DRAFT_PURPOSE_LABELS, EMAIL_DRAFT_PURPOSES } from "@oem-crm/shared";
import { apiGet, apiPatch, apiPost, clearSessionAndRedirect } from "../api/http";
import { canViewSettingsSection, defaultSettingsPath, getCurrentUser, hasPermission } from "../auth/permissions";
import { AppSelect } from "../components/AppSelect";
import { Switch } from "../components/Switch";
import { notifyMutationStep } from "../components/Toast";

type OemScoringWeights = {
  productLineFit: number;
  marketFit: number;
  priceBandFit: number;
  brandMaturity: number;
  websiteCompleteness: number;
  contactQuality: number;
  cooperationOpportunity: number;
  riskPenaltyMax: number;
};

const DEFAULT_WEIGHTS: OemScoringWeights = {
  productLineFit: 20,
  marketFit: 15,
  priceBandFit: 15,
  brandMaturity: 15,
  websiteCompleteness: 10,
  contactQuality: 10,
  cooperationOpportunity: 15,
  riskPenaltyMax: 10
};

const SCORING_FIELDS = [
  { key: "productLineFit" as const, label: "产品线匹配度", description: "客户产品线与我方 OEM/ODM 能力匹配程度" },
  { key: "marketFit" as const, label: "市场匹配度", description: "国家、区域、渠道、目标市场匹配程度" },
  { key: "priceBandFit" as const, label: "价格带匹配度", description: "客户定位与我方价格能力匹配程度" },
  { key: "brandMaturity" as const, label: "品牌成熟度", description: "品牌可信度、公司规模、业务稳定性" },
  { key: "websiteCompleteness" as const, label: "官网完整度", description: "官网分析、背调数据完整度和可信度" },
  { key: "contactQuality" as const, label: "联系人质量", description: "联系人有效性、职位、决策人程度" },
  { key: "cooperationOpportunity" as const, label: "合作机会", description: "OEM/ODM、定制、补货、扩品机会" }
] as const;

const BONUS_KEYS = SCORING_FIELDS.map((f) => f.key);

type EmailPromptConfigData = {
  goal: string;
  tone: string;
  mustInclude: string[];
  mustAvoid: string[];
  structure: string;
  customInstruction: string;
  isActive: boolean;
};

type EmailPromptPreviewResult = {
  purpose: string;
  prompt: string;
  isActive: boolean;
  source: "override" | "saved";
};

const settings = [
  { key: "users", label: "用户管理", icon: Users, permission: "settings.users.manage" },
  { key: "roles", label: "角色权限", icon: Shield, permission: "settings.roles.manage" },
  { key: "customer-dictionaries", label: "客户字典", icon: ListChecks, permission: "settings.customer_dictionaries.manage" },
  { key: "email-accounts", label: "邮箱参数", icon: Mail, permission: "emails.accounts.manage_personal" },
  { key: "ai", label: "AI配置", icon: KeyRound, permission: "settings.ai_config.manage" },
  { key: "scoring", label: "评分权重", icon: SlidersHorizontal, permission: "settings.scoring_weights.manage" },
  { key: "blacklist", label: "黑名单", icon: ListChecks, permission: "settings.blacklist.manage" },
  { key: "audit-logs", label: "操作日志", icon: ListChecks, permission: "settings.audit_logs.read" },
  { key: "logout", label: "登出", icon: LogOut }
];

type UserRow = { id: string; email: string; name: string; title?: string; isActive: boolean; team?: { name: string }; userRoles: Array<{ role: { code: string; name: string } }> };
type RoleRow = { id: string; code: string; name: string; dataScope: string; level: number; rolePermissions: Array<{ permission: { code: string; name: string } }> };
type PermissionRow = { id: string; code: string; name: string; module: string; group: string; dependsOn: string[] };
type DictionaryRow = { id: string; name: string; description?: string; isActive: boolean };
type BlacklistRule = { id: string; type: string; value: string; reason?: string; isActive: boolean; createdAt: string };
type AuditLog = { id: string; action: string; entityType: string; entityId?: string; actor?: { name: string; email: string }; createdAt: string };

export function SettingsPage() {
  const { section = "users" } = useParams();
  const currentUser = getCurrentUser();
  const visibleSettings = settings.filter((item) => canViewSettingsSection(currentUser, item.key));
  const current = visibleSettings.find((item) => item.key === section) ?? visibleSettings[0];

  if (!current || !canViewSettingsSection(currentUser, section)) {
    return <Navigate to={defaultSettingsPath(currentUser)} replace />;
  }

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
        {visibleSettings.map((item) => <NavLink key={item.key} to={`/settings/${item.key}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}><item.icon size={15} />{item.label}</NavLink>)}
      </nav>
      <section className="panel">
        <div className="panel-title">
          <h2><Icon size={18} />{current.label}</h2>
          <span>私有化部署配置</span>
        </div>
        {section === "roles" ? <RolesPanel /> : section === "customer-dictionaries" ? <CustomerDictionariesPanel /> : section === "blacklist" ? <BlacklistPanel /> : section === "audit-logs" ? <AuditPanel /> : section === "email-accounts" ? <EmailPromptPanel /> : section === "ai" ? <AiPanel /> : section === "scoring" ? <ScoringPanel /> : section === "logout" ? <LogoutPanel /> : <UsersPanel />}
      </section>
    </section>
  );
}

function UsersPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", name: "", password: "ChangeMe123!", title: "", roleCodes: "SALES_REP" });
  const { data = [] } = useQuery({ queryKey: ["settings-users"], queryFn: () => apiGet<UserRow[]>("/settings/users") });
  const { data: roles = [] } = useQuery({ queryKey: ["settings-roles"], queryFn: () => apiGet<RoleRow[]>("/settings/roles") });
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
        <label>
          <span>角色</span>
          <AppSelect
            value={form.roleCodes}
            onChange={(roleCodes) => setForm({ ...form, roleCodes })}
            options={roles.map((role) => ({ value: role.code, label: role.name }))}
          />
        </label>
        <div className="wide-field"><button className="primary-button" onClick={() => create.mutate()} disabled={!form.email || !form.name || create.isPending}>新增用户</button></div>
      </div>
      <Table headers={["姓名", "邮箱", "角色", "团队", "状态"]} rows={data.map((user) => [user.name, user.email, user.userRoles.map((item) => item.role.name).join(", "), user.team?.name ?? "-", <Switch checked={user.isActive} onChange={() => toggle.mutate(user)} loading={toggle.isPending} />])} />
    </div>
  );
}

// Role inheritance: direct parent → child (parent includes all descendant permissions recursively)
const ROLE_CHILDREN: Record<string, string[]> = {
  ADMIN: ["EXECUTIVE", "OPERATOR"],
  EXECUTIVE: ["SALES_MANAGER"],
  SALES_MANAGER: ["SALES_REP"],
  SALES_REP: [],
  OPERATOR: []
};

function collectDescendantCodes(rootCode: string): string[] {
  const result = new Set<string>();
  const queue = [...(ROLE_CHILDREN[rootCode] ?? [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.add(current);

    for (const child of ROLE_CHILDREN[current] ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return [...result];
}

function computeInheritedPermissionCodes(selectedRoleCode: string, allRoles: RoleRow[]): Set<string> {
  const descendantCodes = collectDescendantCodes(selectedRoleCode);
  const codes = new Set<string>();
  for (const descendantCode of descendantCodes) {
    const descendantRole = allRoles.find((r) => r.code === descendantCode);
    if (descendantRole) {
      for (const rp of descendantRole.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }
  }
  return codes;
}

function RolesPanel() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.roles.manage");

  const { data: roles = [] } = useQuery({
    queryKey: ["settings-roles"],
    queryFn: () => apiGet<RoleRow[]>("/settings/roles")
  });
  const { data: allPermissions = [] } = useQuery({
    queryKey: ["settings-permissions"],
    queryFn: () => apiGet<PermissionRow[]>("/settings/permissions")
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [editedCodes, setEditedCodes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const directCodes = new Set(selectedRole?.rolePermissions.map((rp) => rp.permission.code) ?? []);
  const inheritedCodes = selectedRole ? computeInheritedPermissionCodes(selectedRole.code, roles) : new Set<string>();
  const effectiveCodes = new Set([...directCodes, ...inheritedCodes]);

  // Group permissions by module
  const moduleGroups = useMemo(() => {
    const map = new Map<string, { group: string; permissions: PermissionRow[] }>();
    for (const perm of allPermissions) {
      const mod = perm.module || "other";
      if (!map.has(mod)) map.set(mod, { group: perm.group || mod, permissions: [] });
      map.get(mod)!.permissions.push(perm);
    }
    return [...map.entries()].sort((a, b) => {
      // System settings last, others alphabetical
      if (a[0] === "settings") return 1;
      if (b[0] === "settings") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [allPermissions]);

  // Sync editedCodes when selected role changes
  useEffect(() => {
    if (selectedRole) {
      setEditedCodes(new Set(selectedRole.rolePermissions.map((rp) => rp.permission.code)));
      setHasChanges(false);
      setSelectedRoleId(selectedRole.id);
    }
  }, [selectedRoleId]);

  function togglePermission(code: string) {
    if (!canEdit) return;
    // Inherited-only permissions cannot be toggled
    if (inheritedCodes.has(code) && !directCodes.has(code)) return;

    const next = new Set(editedCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
      // Recursively add all transitive dependencies
      const queue = [code];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const perm = allPermissions.find((p) => p.code === cur);
        if (perm?.dependsOn) {
          for (const dep of perm.dependsOn) {
            if (!next.has(dep)) {
              next.add(dep);
              queue.push(dep);
            }
          }
        }
      }
    }
    setEditedCodes(next);
    setHasChanges(true);
  }

  const saveRole = useMutation({
    mutationFn: () => apiPatch<{ permissionCodes: string[]; expandedFrom: string[] }>(`/settings/roles/${selectedRoleId}/permissions`, { permissionCodes: [...editedCodes] }),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存角色权限配置。", dedupeKey: "role-permissions-save" }),
    onSuccess: (result: { permissionCodes: string[]; expandedFrom: string[] }) => {
      notifyMutationStep({
        phase: "success",
        title: "保存成功",
        message: `角色权限已更新（${result.expandedFrom.length} 项直接授权，展开为 ${result.permissionCodes.length} 项含依赖）。相关用户需重新登录后生效。`
      });
      queryClient.invalidateQueries({ queryKey: ["settings-roles"] });
      setHasChanges(false);
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "保存失败", message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  // Select first role on load
  useEffect(() => {
    if (roles.length && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  if (!roles.length) return <div className="empty-state">暂无角色数据。</div>;

  const sortedRoles = [...roles].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  return (
    <div className="content-grid settings-role-grid">
      {/* Left: role list */}
      <nav className="settings-role-sidebar">
        <div className="settings-role-sidebar-title">
          角色列表
        </div>
        {sortedRoles.map((role) => {
          const childCodes = ROLE_CHILDREN[role.code] ?? [];
          const isActive = role.id === selectedRoleId;
          return (
            <button
              key={role.id}
              className={`settings-role-card${isActive ? " active" : ""}`}
              onClick={() => { setSelectedRoleId(role.id); }}
              type="button"
            >
              <div className="settings-role-card-name">{role.name}</div>
              <div className="settings-role-card-meta">
                {role.dataScope === "ALL" ? "全部数据" : role.dataScope === "TEAM" ? "团队数据" : "个人数据"}
                {childCodes.length > 0 ? <span style={{ marginLeft: 6 }}>▸ {childCodes.join(", ")}</span> : null}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Right: permission grid */}
      <div className="page-stack">
        {!canEdit ? (
          <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, fontSize: 13 }}>
            当前账号仅可查看角色权限，只有拥有"角色权限管理"权限的用户可以修改。
          </div>
        ) : null}

        <div className="empty-state" style={{ fontSize: 13 }}>
          上级角色自动拥有下级角色的全部权限。灰色虚线勾选表示来自下级角色包含，不可在当前角色中单独取消。
        </div>

        {selectedRole ? (
          <>
            {moduleGroups.map(([module, { group, permissions }]) => (
              <section className="panel" key={module}>
                <div className="panel-title">
                  <h2>{group}</h2>
                  <span>{permissions.filter((p) => effectiveCodes.has(p.code)).length}/{permissions.length} 项</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                  {permissions.map((perm) => {
                    const wasDirect = directCodes.has(perm.code);
                    const isChecked = editedCodes.has(perm.code);
                    const isInheritedOnly = inheritedCodes.has(perm.code) && !wasDirect;
                    const isNowDirect = editedCodes.has(perm.code) && !isInheritedOnly;
                    const hasDep = perm.dependsOn?.length > 0;

                    return (
                      <label
                        key={perm.code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          cursor: isInheritedOnly ? "default" : canEdit ? "pointer" : "default",
                          opacity: isInheritedOnly ? 0.6 : 1,
                          fontSize: 13
                        }}
                        title={
                          [
                            isInheritedOnly ? "来自下级角色继承，不可在当前角色单独取消" : "",
                            isNowDirect ? "当前角色直接授权" : "",
                            wasDirect && !isChecked ? "已从当前角色移除，保存后生效" : "",
                            hasDep ? `依赖：${perm.dependsOn.join("、")}` : ""
                          ].filter(Boolean).join("\n") || perm.name
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canEdit || isInheritedOnly}
                          onChange={() => togglePermission(perm.code)}
                          style={isInheritedOnly ? { accentColor: "var(--color-muted)", opacity: 0.5 } : undefined}
                        />
                        <span style={{ flex: 1 }}>
                          {perm.name}
                          <span style={{ color: "var(--color-muted)", fontSize: 11, marginLeft: 4 }}>{perm.code}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            {canEdit && hasChanges ? (
              <div className="toolbar" style={{ gap: 8 }}>
                <button
                  className="primary-button"
                  disabled={saveRole.isPending}
                  onClick={() => {
                    if (window.confirm("修改角色权限会影响该角色下所有用户。保存后相关用户可能需要重新登录。确认保存？")) {
                      saveRole.mutate();
                    }
                  }}
                >
                  {saveRole.isPending ? "保存中..." : "保存角色权限"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditedCodes(new Set(selectedRole.rolePermissions.map((rp) => rp.permission.code)));
                    setHasChanges(false);
                  }}
                >
                  取消修改
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
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
            <Switch checked={row.isActive} onChange={() => toggle.mutate(row)} loading={toggle.isPending} />,
            <div className="toolbar">
              <button className="secondary-button" disabled={!draft.name || save.isPending} onClick={() => save.mutate(row)}>保存</button>
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
        <label>
          <span>类型</span>
          <AppSelect
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
            options={[
              { value: "EMAIL", label: "邮箱" },
              { value: "DOMAIN", label: "域名" },
              { value: "COMPANY_NAME", label: "公司名" },
              { value: "COUNTRY", label: "国家" },
              { value: "KEYWORD", label: "关键词" }
            ]}
          />
        </label>
        <Field label="值" value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <Field label="原因" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <div><button className="primary-button" disabled={!form.value} onClick={() => create.mutate()}>加入黑名单</button></div>
      </div>
      <Table headers={["类型", "值", "原因", "状态"]} rows={data.map((rule) => [rule.type, rule.value, rule.reason ?? "-", <Switch checked={rule.isActive} onChange={() => toggle.mutate(rule)} loading={toggle.isPending} />])} />
    </div>
  );
}

function AuditPanel() {
  const { data = [] } = useQuery({ queryKey: ["audit-logs"], queryFn: () => apiGet<AuditLog[]>("/settings/audit-logs") });
  return <Table headers={["操作", "对象", "操作者", "时间"]} rows={data.map((log) => [log.action, `${log.entityType}:${log.entityId ?? "-"}`, log.actor?.name ?? "-", new Date(log.createdAt).toLocaleString()])} />;
}

function EmailPromptPanel() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.email_prompt.manage");

  const [selectedPurpose, setSelectedPurpose] = useState<string>(EMAIL_DRAFT_PURPOSES[0]);
  const [form, setForm] = useState<EmailPromptConfigData>({ goal: "", tone: "", mustInclude: [], mustAvoid: [], structure: "", customInstruction: "", isActive: true });
  const [tagInput, setTagInput] = useState<{ mustInclude: string; mustAvoid: string }>({ mustInclude: "", mustAvoid: "" });
  const [preview, setPreview] = useState<EmailPromptPreviewResult | null>(null);
  const purposes = EMAIL_DRAFT_PURPOSES as readonly string[];

  const { data: configs, isLoading } = useQuery({
    queryKey: ["email-prompt-configs"],
    queryFn: () => apiGet<Record<string, EmailPromptConfigData>>("/settings/email-prompt-configs")
  });

  useEffect(() => {
    if (configs && configs[selectedPurpose]) {
      const c = configs[selectedPurpose];
      setForm({ goal: c.goal, tone: c.tone, mustInclude: [...c.mustInclude], mustAvoid: [...c.mustAvoid], structure: c.structure, customInstruction: c.customInstruction, isActive: c.isActive });
      setPreview(null);
      setTagInput({ mustInclude: "", mustAvoid: "" });
    }
  }, [configs, selectedPurpose]);

  const save = useMutation({
    mutationFn: () => apiPatch<EmailPromptConfigData>(`/settings/email-prompt-configs/${selectedPurpose}`, form),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存邮件 Prompt 配置。", dedupeKey: "email-prompt-save" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-prompt-configs"] });
      notifyMutationStep({ phase: "success", title: "保存成功", message: "邮件 Prompt 配置已保存，后续生成的该类型邮件将使用新配置。" });
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "保存失败", message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  const reset = useMutation({
    mutationFn: () => apiPost<EmailPromptConfigData>(`/settings/email-prompt-configs/${selectedPurpose}/reset`),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "恢复中", message: "正在恢复默认配置。", dedupeKey: "email-prompt-reset" }),
    onSuccess: (result) => {
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["email-prompt-configs"] });
      notifyMutationStep({ phase: "success", title: "已恢复", message: "已恢复为默认 Prompt 配置。" });
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "恢复失败", message: error instanceof Error ? error.message : "恢复失败" });
    }
  });

  const previewMutation = useMutation({
    mutationFn: () => apiPost<EmailPromptPreviewResult>(`/settings/email-prompt-configs/${selectedPurpose}/preview`, form),
    onSuccess: (result) => setPreview(result),
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "预览失败", message: error instanceof Error ? error.message : "预览失败" });
    }
  });

  function updateField<K extends keyof EmailPromptConfigData>(key: K, value: EmailPromptConfigData[K]) {
    setForm({ ...form, [key]: value });
  }

  function addTag(field: "mustInclude" | "mustAvoid") {
    const value = tagInput[field].trim();
    if (!value) return;
    if (form[field].includes(value)) return;
    updateField(field, [...form[field], value]);
    setTagInput({ ...tagInput, [field]: "" });
  }

  function removeTag(field: "mustInclude" | "mustAvoid", index: number) {
    updateField(field, form[field].filter((_, i) => i !== index));
  }

  function handleTagKeyDown(field: "mustInclude" | "mustAvoid", event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(field);
    }
  }

  if (isLoading) return <div className="empty-state">正在加载邮件 Prompt 配置...</div>;

  return (
    <div className="content-grid" style={{ gridTemplateColumns: "220px 1fr", gap: 16 }}>
      {/* Left: purpose list */}
      <nav style={{ borderRight: "1px solid var(--color-border, #e5e7eb)", paddingRight: 12 }}>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 8, textTransform: "uppercase" }}>邮件类型</div>
        {purposes.map((purpose) => {
          const label = (EMAIL_DRAFT_PURPOSE_LABELS as Record<string, string>)[purpose] ?? purpose;
          const cfg = configs?.[purpose];
          const isModified = cfg && (cfg.goal !== "" || cfg.tone !== "" || cfg.mustInclude.length > 0 || cfg.mustAvoid.length > 0 || cfg.structure !== "" || cfg.customInstruction !== "");
          return (
            <button
              key={purpose}
              className={`secondary-button${selectedPurpose === purpose ? " active" : ""}`}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4, fontSize: 13 }}
              onClick={() => { setSelectedPurpose(purpose); setPreview(null); }}
            >
              {label}
              {isModified ? <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>●</span> : null}
            </button>
          );
        })}
      </nav>

      {/* Right: config form */}
      <div className="page-stack">
        {!canEdit ? (
          <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, fontSize: 13 }}>
            当前账号仅可查看邮件 Prompt 配置，只有管理员可以修改。
          </div>
        ) : null}

        <section className="panel">
          <div className="panel-title">
            <h2>{(EMAIL_DRAFT_PURPOSE_LABELS as Record<string, string>)[selectedPurpose] ?? selectedPurpose}</h2>
            <span>邮件 Prompt 配置</span>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            {/* Goal */}
            <label>
              <span>邮件目标</span>
              <textarea
                rows={2}
                value={form.goal}
                disabled={!canEdit}
                onChange={(e) => updateField("goal", e.target.value)}
                placeholder="说明这封邮件要达成什么目的"
              />
            </label>

            {/* Tone */}
            <label>
              <span>语气风格</span>
              <textarea
                rows={2}
                value={form.tone}
                disabled={!canEdit}
                onChange={(e) => updateField("tone", e.target.value)}
                placeholder="例如：专业、简洁、温和、不强推"
              />
            </label>

            {/* Must Include */}
            <label>
              <span>必须包含</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {form.mustInclude.map((item, i) => (
                  <span key={i} style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 12, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {item}
                    {canEdit ? <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} onClick={() => removeTag("mustInclude", i)}>×</button> : null}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={tagInput.mustInclude}
                    onChange={(e) => setTagInput({ ...tagInput, mustInclude: e.target.value })}
                    onKeyDown={(e) => handleTagKeyDown("mustInclude", e)}
                    placeholder="输入后按回车添加"
                    style={{ flex: 1 }}
                  />
                  <button className="secondary-button" onClick={() => addTag("mustInclude")}>添加</button>
                </div>
              ) : null}
            </label>

            {/* Must Avoid */}
            <label>
              <span>禁止出现</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {form.mustAvoid.map((item, i) => (
                  <span key={i} style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {item}
                    {canEdit ? <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} onClick={() => removeTag("mustAvoid", i)}>×</button> : null}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={tagInput.mustAvoid}
                    onChange={(e) => setTagInput({ ...tagInput, mustAvoid: e.target.value })}
                    onKeyDown={(e) => handleTagKeyDown("mustAvoid", e)}
                    placeholder="输入后按回车添加"
                    style={{ flex: 1 }}
                  />
                  <button className="secondary-button" onClick={() => addTag("mustAvoid")}>添加</button>
                </div>
              ) : null}
            </label>

            {/* Structure */}
            <label>
              <span>邮件结构</span>
              <textarea
                rows={2}
                value={form.structure}
                disabled={!canEdit}
                onChange={(e) => updateField("structure", e.target.value)}
                placeholder="例如：开场 → 匹配理由 → 合作建议 → 轻量CTA"
              />
            </label>

            {/* Custom Instruction */}
            <label>
              <span>自定义补充指令</span>
              <textarea
                rows={2}
                value={form.customInstruction}
                disabled={!canEdit}
                onChange={(e) => updateField("customInstruction", e.target.value)}
                placeholder="业务团队临时补充的生成规则"
              />
            </label>

            {/* Active toggle */}
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>启用自定义配置</span>
              <Switch checked={form.isActive} onChange={() => updateField("isActive", !form.isActive)} loading={false} />
            </label>
          </div>
        </section>

        {/* Actions */}
        {canEdit ? (
          <div className="toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="primary-button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "保存中..." : "保存配置"}
            </button>
            <button className="secondary-button" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "生成中..." : "预览最终 Prompt"}
            </button>
            <button className="secondary-button" disabled={reset.isPending} onClick={() => {
              if (window.confirm("确认恢复为默认配置？此操作不可撤销。")) reset.mutate();
            }}>
              {reset.isPending ? "恢复中..." : "恢复默认"}
            </button>
          </div>
        ) : null}

        {/* Preview */}
        {preview !== null ? (
          <section className="panel">
            <div className="panel-title"><h2>最终 Prompt 预览</h2></div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--color-surface, #f9fafb)", padding: 12, borderRadius: 6, maxHeight: 400, overflow: "auto", lineHeight: 1.5 }}>{preview.prompt}</pre>
          </section>
        ) : null}

        <div className="empty-state" style={{ fontSize: 12, color: "var(--color-muted)" }}>
          修改只会影响该邮件类型后续的 AI 生成结果，不会改变已生成的草稿邮件。
        </div>
      </div>
    </div>
  );
}

function AiPanel() {
  return <div className="detail-grid"><div className="detail-block"><strong>OPENAI_API_KEY</strong><span>已在服务端 .env 中配置，不在前端展示。</span></div><div className="detail-block"><strong>AI_BASE_URL</strong><span>当前使用 OpenAI 兼容网关地址。</span></div><div className="detail-block"><strong>AI_MODEL</strong><span>当前模型：astron-code-latest。</span></div></div>;
}

function ScoringPanel() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.scoring_weights.manage");

  const { data: serverWeights, isLoading } = useQuery({
    queryKey: ["oem-scoring-weights"],
    queryFn: () => apiGet<OemScoringWeights>("/settings/oem-scoring-weights")
  });

  const [form, setForm] = useState<OemScoringWeights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    if (serverWeights) {
      setForm({
        productLineFit: serverWeights.productLineFit,
        marketFit: serverWeights.marketFit,
        priceBandFit: serverWeights.priceBandFit,
        brandMaturity: serverWeights.brandMaturity,
        websiteCompleteness: serverWeights.websiteCompleteness,
        contactQuality: serverWeights.contactQuality,
        cooperationOpportunity: serverWeights.cooperationOpportunity,
        riskPenaltyMax: serverWeights.riskPenaltyMax
      });
    }
  }, [serverWeights]);

  const bonusSum = BONUS_KEYS.reduce((sum, key) => sum + form[key], 0);
  const riskValid = form.riskPenaltyMax >= 0 && form.riskPenaltyMax <= 10;
  const canSave = canEdit && bonusSum === 100 && riskValid && BONUS_KEYS.every((key) => Number.isInteger(form[key]) && form[key] >= 0) && Number.isInteger(form.riskPenaltyMax);

  const save = useMutation({
    mutationFn: () => apiPatch<OemScoringWeights>("/settings/oem-scoring-weights", form),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存评分权重配置。", dedupeKey: "oem-scoring-weights-save" }),
    onSuccess: (result) => {
      notifyMutationStep({ phase: "success", title: "保存成功", message: "评分权重已保存，后续新生成的 OEM 评分将使用该配置。" });
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["oem-scoring-weights"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
      notifyMutationStep({ phase: "error", title: "保存失败", message, dedupeKey: "oem-scoring-weights-save:error" });
    }
  });

  function updateField(key: keyof OemScoringWeights, raw: string) {
    const intValue = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(intValue)) return;
    setForm({ ...form, [key]: intValue });
  }

  function resetToDefaults() {
    setForm({ ...DEFAULT_WEIGHTS });
  }

  if (isLoading) return <div className="empty-state">正在加载评分权重配置...</div>;

  return (
    <div className="page-stack">
      {!canEdit ? (
        <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
          当前账号仅可查看评分权重，只有管理员可以修改全局评分标准。
        </div>
      ) : null}

      <div className="empty-state" style={{ marginBottom: 16, fontSize: 13 }}>
        用于调整客户 OEM 适配评分中各维度的占比。修改后只影响后续新生成的评分，历史评分不会自动重算。
      </div>

      <section className="panel">
        <div className="panel-title"><h2>加分项权重</h2><span>总和必须等于 100</span></div>
        <table>
          <thead>
            <tr>
              <th>评分项</th>
              <th>说明</th>
              <th style={{ width: 100 }}>权重</th>
            </tr>
          </thead>
          <tbody>
            {SCORING_FIELDS.map((field) => (
              <tr key={field.key}>
                <td><strong>{field.label}</strong></td>
                <td><small>{field.description}</small></td>
                <td>
                  <input
                    type="number"
                    className="table-input"
                    style={{ width: 72, textAlign: "center" }}
                    value={form[field.key]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!canEdit}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="empty-state" style={{ marginTop: 12, fontSize: 13, color: bonusSum === 100 ? "#166534" : "#991b1b", background: bonusSum === 100 ? "#dcfce7" : "#fee2e2", padding: 8, borderRadius: 6 }}>
          {bonusSum === 100 ? "当前总权重：100 / 100 ✓" : bonusSum < 100 ? `当前总权重：${bonusSum} / 100，请调整加分项权重，总和必须等于 100。` : `当前总权重：${bonusSum} / 100，请降低部分加分项权重。`}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>风险扣分</h2><span>范围 0-10</span></div>
        <table>
          <thead>
            <tr>
              <th>配置项</th>
              <th>说明</th>
              <th style={{ width: 100 }}>数值</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>风险最大扣分</strong></td>
              <td><small>黑名单、信息异常、低可信度等风险最多可扣分数</small></td>
              <td>
                <input
                  type="number"
                  className="table-input"
                  style={{ width: 72, textAlign: "center" }}
                  value={form.riskPenaltyMax}
                  min={0}
                  max={10}
                  step={1}
                  disabled={!canEdit}
                  onChange={(event) => updateField("riskPenaltyMax", event.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        {!riskValid ? (
          <div className="empty-state" style={{ marginTop: 12, fontSize: 13, color: "#991b1b", background: "#fee2e2", padding: 8, borderRadius: 6 }}>
            风险最大扣分必须在 0-10 之间。
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <div className="toolbar" style={{ gap: 8 }}>
          <button className="primary-button" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "保存中..." : "保存配置"}
          </button>
          <button className="secondary-button" disabled={save.isPending} onClick={resetToDefaults}>
            恢复默认
          </button>
        </div>
      ) : null}
    </div>
  );
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
