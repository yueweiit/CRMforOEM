import { KeyRound, ListChecks, LogOut, Mail, Shield, SlidersHorizontal, Users } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { canViewSettingsSection, defaultSettingsPath, getCurrentUser } from "../../auth/permissions";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/resources";
import { UserManagement } from "./sections/UserManagement";
import { RoleManagement } from "./sections/RoleManagement";
import { CustomerDictionaries } from "./sections/CustomerDictionaries";
import { EmailPrompts } from "./sections/EmailPrompts";
import { AiConfig } from "./sections/AiConfig";
import { ScoringWeights } from "./sections/ScoringWeights";
import { Blacklist } from "./sections/Blacklist";
import { AuditLogs } from "./sections/AuditLogs";
import { LogoutSection } from "./sections/LogoutSection";

const settings: Array<{ key: string; labelKey: TranslationKey; icon: typeof Users; permission?: string }> = [
  { key: "users", labelKey: "settings.users", icon: Users, permission: "settings.users.manage" },
  { key: "roles", labelKey: "settings.roles", icon: Shield, permission: "settings.roles.manage" },
  { key: "customer-dictionaries", labelKey: "settings.dictionaries", icon: ListChecks, permission: "settings.customer_dictionaries.manage" },
  { key: "email-prompts", labelKey: "settings.emailPrompts", icon: Mail, permission: "settings.email_prompt.manage" },
  { key: "ai", labelKey: "settings.ai", icon: KeyRound, permission: "settings.ai_config.manage" },
  { key: "scoring", labelKey: "settings.scoring", icon: SlidersHorizontal, permission: "settings.scoring_weights.manage" },
  { key: "blacklist", labelKey: "settings.blacklist", icon: ListChecks, permission: "settings.blacklist.manage" },
  { key: "audit-logs", labelKey: "settings.auditLogs", icon: ListChecks, permission: "settings.audit_logs.read" },
  { key: "logout", labelKey: "settings.logout", icon: LogOut }
];

export function SettingsPage() {
  const { section = "users" } = useParams();
  const { t } = useI18n();
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
          <h1>{t("settings.title")}</h1>
        </div>
      </header>
      <nav className="tab-bar">
        {visibleSettings.map((item) => <NavLink key={item.key} to={`/settings/${item.key}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}><item.icon size={15} />{t(item.labelKey)}</NavLink>)}
      </nav>
      <section className="panel">
        <div className="panel-title">
          <h2><Icon size={18} />{t(current.labelKey)}</h2>
          <span>{t("settings.deployConfig")}</span>
        </div>
        {section === "roles" ? <RoleManagement /> : section === "customer-dictionaries" ? <CustomerDictionaries /> : section === "blacklist" ? <Blacklist /> : section === "audit-logs" ? <AuditLogs /> : section === "email-prompts" ? <EmailPrompts /> : section === "ai" ? <AiConfig /> : section === "scoring" ? <ScoringWeights /> : section === "logout" ? <LogoutSection /> : <UserManagement />}
      </section>
    </section>
  );
}
