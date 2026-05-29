import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, NavLink, Outlet } from "react-router-dom";
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
import { showServerToast, ToastContainer } from "../components/Toast";
import { EMAIL_EVENT_TOAST_CONFIG } from "../config/email-event-toasts";
import { TASK_TOAST_CONFIG } from "../config/follow-up-task-toasts";
import { useSse } from "../hooks/useSse";

const navItems = [
  { to: "/dashboard", label: "工作台", icon: BarChart3 },
  { to: "/customers", label: "客户开发", icon: Building2 },
  { to: "/email-center/inbox", label: "邮件中心", icon: Mail },
  { to: "/follow-ups", label: "跟进任务", icon: ClipboardCheck },
  { to: "/knowledge/company", label: "企业资料库", icon: BookOpen },
  { to: "/reports/management", label: "数据看板", icon: UsersRound },
  { to: "/settings/users", label: "系统设置", icon: Settings }
];

type NavFollowUpSummary = { count: number };

function badgeCount(value: number) {
  return value > 99 ? "99+" : String(value);
}

function currentUserId() {
  const token = localStorage.getItem("accessToken");
  if (!token) return "";

  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(normalized)) as { sub?: unknown };
    return typeof decoded.sub === "string" ? decoded.sub : "";
  } catch {
    return "";
  }
}

export function AppShell() {
  if (!localStorage.getItem("accessToken")) {
    return <Navigate to="/login" replace />;
  }

  const queryClient = useQueryClient();
  const userId = currentUserId();

  useSse("follow-up.task.created", (data: { overdueCount: number; customerId: string; type: string; targetUserIds: string[] }) => {
    queryClient.setQueryData(["nav-follow-up-overdue-count"], { count: data.overdueCount });
    if (!data.targetUserIds?.includes(userId)) return;

    const config = TASK_TOAST_CONFIG[data.type as keyof typeof TASK_TOAST_CONFIG];
    if (!config) return;

    showServerToast({
      type: config.type,
      title: config.title,
      message: config.message,
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

    const config = EMAIL_EVENT_TOAST_CONFIG["inbound-mail.received"];

    showServerToast({
      type: config.type,
      title: typeof config.title === "function" ? config.title(data) : config.title,
      message: typeof config.message === "function" ? config.message(data) : config.message,
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
            <strong>客户开发CRM</strong>
            <span>外贸开发闭环</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.to === "/follow-ups" && openFollowUpCount > 0 ? <span className="nav-alert-badge">{badgeCount(openFollowUpCount)}</span> : null}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}
