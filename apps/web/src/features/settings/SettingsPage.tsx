import { KeyRound, ListChecks, LogOut, Mail, Shield, SlidersHorizontal, Users } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { canViewSettingsSection, defaultSettingsPath, getCurrentUser } from "../../auth/permissions";
import { UserManagement } from "./sections/UserManagement";
import { RoleManagement } from "./sections/RoleManagement";
import { CustomerDictionaries } from "./sections/CustomerDictionaries";
import { EmailPrompts } from "./sections/EmailPrompts";
import { AiConfig } from "./sections/AiConfig";
import { ScoringWeights } from "./sections/ScoringWeights";
import { Blacklist } from "./sections/Blacklist";
import { AuditLogs } from "./sections/AuditLogs";
import { LogoutSection } from "./sections/LogoutSection";

const settings = [
  { key: "users", label: "用户管理", icon: Users, permission: "settings.users.manage" },
  { key: "roles", label: "角色权限", icon: Shield, permission: "settings.roles.manage" },
  { key: "customer-dictionaries", label: "客户字典", icon: ListChecks, permission: "settings.customer_dictionaries.manage" },
  { key: "email-prompts", label: "邮件提示词", icon: Mail, permission: "settings.email_prompt.manage" },
  { key: "ai", label: "AI配置", icon: KeyRound, permission: "settings.ai_config.manage" },
  { key: "scoring", label: "评分权重", icon: SlidersHorizontal, permission: "settings.scoring_weights.manage" },
  { key: "blacklist", label: "黑名单", icon: ListChecks, permission: "settings.blacklist.manage" },
  { key: "audit-logs", label: "操作日志", icon: ListChecks, permission: "settings.audit_logs.read" },
  { key: "logout", label: "登出", icon: LogOut }
];

export function SettingsPage() {
  const { section = "users" } = useParams();
  const currentUser = getCurrentUser();

  if (section === "email-accounts") {
    return <Navigate to="/settings/email-prompts" replace />;
  }

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
        {section === "roles" ? <RoleManagement /> : section === "customer-dictionaries" ? <CustomerDictionaries /> : section === "blacklist" ? <Blacklist /> : section === "audit-logs" ? <AuditLogs /> : section === "email-prompts" ? <EmailPrompts /> : section === "ai" ? <AiConfig /> : section === "scoring" ? <ScoringWeights /> : section === "logout" ? <LogoutSection /> : <UserManagement />}
      </section>
    </section>
  );
}
