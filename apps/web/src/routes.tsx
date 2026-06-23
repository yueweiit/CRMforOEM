import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { canViewReports, canViewSettingsSection, defaultReportPath, defaultSettingsPath, getCurrentUser } from "./auth/permissions";
import { appBasePath } from "./config/runtime";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmailCenterPage } from "./pages/EmailCenterPage";
import { FollowUpsPage } from "./pages/FollowUpsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { LoginPage } from "./pages/LoginPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

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

