import { lazy } from "react";
import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { canViewReports, canViewSettingsSection, defaultReportPath, defaultSettingsPath, getCurrentUser } from "../auth/permissions";
import { appBasePath } from "../config/runtime";

const LoginPage = lazy(() => import("../pages/LoginPage").then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import("../features/customers/list/CustomersPage").then(m => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import("../features/customers/detail/CustomerDetailPage").then(m => ({ default: m.CustomerDetailPage })));
const EmailCenterPage = lazy(() => import("../features/email-center/EmailCenterPage").then(m => ({ default: m.EmailCenterPage })));
const FollowUpsPage = lazy(() => import("../features/follow-ups/FollowUpsPage").then(m => ({ default: m.FollowUpsPage })));
const KnowledgeBasePage = lazy(() => import("../features/knowledge/KnowledgeBasePage").then(m => ({ default: m.KnowledgeBasePage })));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage").then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));

function RequireReportAccess() {
  const user = getCurrentUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canViewReports(user)) {
    return <Navigate to={defaultReportPath(user)} replace />;
  }

  return <ReportsPage />;
}

function RequireSettingsAccess() {
  const { section = "users" } = useParams();
  const user = getCurrentUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canViewSettingsSection(user, section)) {
    return <Navigate to={defaultSettingsPath(user)} replace />;
  }

  return <SettingsPage />;
}

export const router = createBrowserRouter(
  [
    { path: "/login", element: <LoginPage /> },
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: "dashboard", element: <DashboardPage /> },
        { path: "customers", element: <CustomersPage /> },
        { path: "customers/new", element: <CustomersPage mode="create" /> },
        { path: "customers/:id/:tab?", element: <CustomerDetailPage /> },
        { path: "email-center/:folder?", element: <EmailCenterPage /> },
        { path: "follow-ups", element: <FollowUpsPage /> },
        { path: "knowledge/:section?", element: <KnowledgeBasePage /> },
        {
          path: "reports/:scope?",
          element: <RequireReportAccess />
        },
        {
          path: "settings/:section?",
          element: <RequireSettingsAccess />
        }
      ]
    }
  ],
  { basename: appBasePath }
);
