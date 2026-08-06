import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Suspense } from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  Mail,
  Settings,
  UsersRound
} from "lucide-react";
import { apiGet } from "../api/http";
import { canViewReports, defaultReportPath, defaultSettingsPath, getCurrentUser, type CurrentUser } from "../auth/permissions";
import { LanguageSelect } from "../components/LanguageSelect";
import { showServerToast, ToastContainer } from "../components/Toast";
import { ChunkErrorBoundary } from "../components/ChunkErrorBoundary";
import { PageLoadingSkeleton } from "../components/PageLoadingSkeleton";
import { getEmailEventToastConfig } from "../config/email-event-toasts";
import { getTaskToastConfig, type FollowUpToastTaskType } from "../config/follow-up-task-toasts";
import { useSse } from "../hooks/useSse";
import { useI18n } from "../i18n";

type NavItem = {
  to: string | ((user: CurrentUser | null) => string);
  activeRoot: string;
  labelKey: "nav.dashboard" | "nav.customers" | "nav.emailCenter" | "nav.followUps" | "nav.knowledge" | "nav.reports" | "nav.settings";
  icon: typeof BarChart3;
  canView?: (user: CurrentUser | null) => boolean;
};

const navItems: NavItem[] = [
  { to: "/dashboard", activeRoot: "/dashboard", labelKey: "nav.dashboard", icon: BarChart3 },
  { to: "/customers", activeRoot: "/customers", labelKey: "nav.customers", icon: Building2 },
  { to: "/email-center/inbox", activeRoot: "/email-center", labelKey: "nav.emailCenter", icon: Mail },
  { to: "/follow-ups", activeRoot: "/follow-ups", labelKey: "nav.followUps", icon: ClipboardCheck },
  { to: "/knowledge/company", activeRoot: "/knowledge", labelKey: "nav.knowledge", icon: BookOpen },
  { to: defaultReportPath, activeRoot: "/reports", labelKey: "nav.reports", icon: UsersRound, canView: canViewReports },
  { to: defaultSettingsPath, activeRoot: "/settings", labelKey: "nav.settings", icon: Settings }
];

type NavFollowUpSummary = { count: number };

function badgeCount(value: number) {
  return value > 99 ? "99+" : String(value);
}

export function AppShell() {
  if (!localStorage.getItem("accessToken")) {
    return <Navigate to="/login" replace />;
  }

  const queryClient = useQueryClient();
  const location = useLocation();
  const { t } = useI18n();
  const currentUser = getCurrentUser();
  const userId = currentUser?.id ?? "";
  const visibleNavItems = navItems
    .filter((item) => !item.canView || item.canView(currentUser))
    .map((item) => ({ ...item, to: typeof item.to === "function" ? item.to(currentUser) : item.to }));

  useSse("follow-up.task.created", (data: { overdueCount: number; customerId: string; type: string; targetUserIds: string[] }) => {
    queryClient.setQueryData(["nav-follow-up-overdue-count"], { count: data.overdueCount });
    if (!data.targetUserIds?.includes(userId)) return;

    const config = getTaskToastConfig(t)[data.type as FollowUpToastTaskType];
    if (!config) return;

    showServerToast({
      type: config.type,
      title: config.title,
      message: config.message,
      persistent: true,
      dedupeKey: `task:${data.customerId}:${data.type}`,
      actionHref: config.actionHref?.(data.customerId),
      actionLabel: config.actionLabel
    });
  });

  useSse("follow-up.task.completed", (data: { overdueCount: number }) => {
    queryClient.setQueryData(["nav-follow-up-overdue-count"], { count: data.overdueCount });
  });

  useSse("follow-up.task.cancelled", (data: { overdueCount: number }) => {
    queryClient.setQueryData(["nav-follow-up-overdue-count"], { count: data.overdueCount });
  });

  useSse("inbound-mail.received", (data: { customerName: string; subject: string; customerId: string; targetUserIds: string[] }) => {
    if (!data.targetUserIds?.includes(userId)) return;

    const config = getEmailEventToastConfig(t)["inbound-mail.received"];

    showServerToast({
      type: config.type,
      title: typeof config.title === "function" ? config.title(data) : config.title,
      message: typeof config.message === "function" ? config.message(data) : config.message,
      persistent: true,
      dedupeKey: config.dedupeKey?.(data),
      actionHref: config.actionHref?.(data),
      actionLabel: config.actionLabel
    });
  });

  useSse("quote-reply.assessed", (data: { assessmentId: string; quoteNo: string; intent: "ACCEPT" | "REJECT"; customerName: string; customerId: string; targetUserIds: string[] }) => {
    if (!data.targetUserIds?.includes(userId)) return;
    queryClient.invalidateQueries({ queryKey: ["quote-reply-assessments", data.customerId] });
    const config = getEmailEventToastConfig(t)["quote-reply.assessed"];
    showServerToast({
      type: config.type,
      title: typeof config.title === "function" ? config.title(data) : config.title,
      message: typeof config.message === "function" ? config.message(data) : config.message,
      persistent: true,
      dedupeKey: config.dedupeKey?.(data),
      actionHref: config.actionHref?.(data),
      actionLabel: config.actionLabel
    });
  });

  const { data: followUpSummary } = useQuery({
    queryKey: ["nav-follow-up-overdue-count"],
    queryFn: () => apiGet<NavFollowUpSummary>("/follow-up-tasks/overdue-count"),
    refetchInterval: 60_000
  });
  const openFollowUpCount = followUpSummary?.count ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">OEM</div>
          <div>
            <strong>{t("common.appName")}</strong>
            <span>{t("common.appTagline")}</span>
          </div>
        </div>
        <nav className="nav-list">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location.pathname, item.activeRoot);
            return (
              <Link key={item.to} to={item.to} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={18} />
                <span>{t(item.labelKey)}</span>
                {item.to === "/follow-ups" && openFollowUpCount > 0 ? <span className="nav-alert-badge">{badgeCount(openFollowUpCount)}</span> : null}
              </Link>
            );
          })}
        </nav>
        <LanguageSelect className="sidebar-language-select" />
      </aside>
      <main className="workspace">
        <ChunkErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Outlet />
          </Suspense>
        </ChunkErrorBoundary>
      </main>
      <ToastContainer />
    </div>
  );
}

function isActivePath(pathname: string, activeRoot: string) {
  if (pathname === activeRoot) return true;
  return pathname.startsWith(`${activeRoot}/`);
}
