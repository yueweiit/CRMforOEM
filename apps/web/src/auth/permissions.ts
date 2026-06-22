export type CurrentUser = {
  id: string;
  name?: string;
  email?: string;
  roleCodes: string[];
  permissions?: string[];
  dataScope?: string;
};

export const ADMIN_ROLE = "ADMIN";

// ── Role helpers (retained for system-protection scenarios only) ──

export function getCurrentUser(): CurrentUser | null {
  const stored = readStoredUser();
  if (stored) return stored;
  return readUserFromToken();
}

export function hasAnyRole(user: CurrentUser | null, roles: readonly string[]) {
  if (!user) return false;
  return roles.some((role) => user.roleCodes.includes(role));
}

/** @deprecated Use hasPermission(user, code) for business logic. Retained only for system-protection scenarios. */
export function isAdmin(user: CurrentUser | null) {
  return hasAnyRole(user, [ADMIN_ROLE]);
}

// ── Permission helpers (primary API for all business logic) ──

export function hasPermission(user: CurrentUser | null, permissionCode: string) {
  return user?.permissions?.includes(permissionCode) ?? false;
}

export function hasAnyPermission(user: CurrentUser | null, permissionCodes: string[]) {
  return permissionCodes.some((code) => hasPermission(user, code));
}

// ── Data scope ──

export function hasDataScope(user: CurrentUser | null, scope: "SELF" | "TEAM" | "ALL") {
  return user?.dataScope === scope;
}

// ── Route / navigation guards (permission-based) ──

export function canViewReports(user: CurrentUser | null) {
  return hasAnyPermission(user, ["dashboards.view", "dashboards.team", "dashboards.management"]);
}

export function canViewSettingsSection(user: CurrentUser | null, section?: string) {
  if (!user) return false;
  const code = SETTINGS_PERMISSION_MAP[section as SettingsSectionKey];
  if (!code) return section === "logout";
  return hasAnyPermission(user, [code, "settings.manage"]);
}

const SETTINGS_PERMISSION_MAP: Record<string, string> = {
  users: "settings.users.manage",
  roles: "settings.roles.manage",
  "customer-dictionaries": "settings.customer_dictionaries.manage",
  "email-accounts": "settings.email_prompt.manage",
  ai: "settings.ai_config.manage",
  scoring: "settings.scoring_weights.manage",
  blacklist: "settings.blacklist.manage",
  "audit-logs": "settings.audit_logs.read"
} as const;

export type SettingsSectionKey = keyof typeof SETTINGS_PERMISSION_MAP | "logout";

export function defaultReportPath(user: CurrentUser | null) {
  if (canViewReports(user)) return "/reports/management";
  return defaultAuthorizedPath(user);
}

const SETTINGS_SECTION_ORDER = [
  "users",
  "roles",
  "customer-dictionaries",
  "email-accounts",
  "ai",
  "scoring",
  "blacklist",
  "audit-logs",
  "logout"
] as const;

export function defaultSettingsPath(user: CurrentUser | null) {
  if (!user) return "/login";

  for (const section of SETTINGS_SECTION_ORDER) {
    if (canViewSettingsSection(user, section)) {
      return `/settings/${section}`;
    }
  }

  return "/dashboard";
}

export function defaultAuthorizedPath(user: CurrentUser | null) {
  if (!user) return "/login";
  return "/dashboard";
}

// ── Token decoding ──

function readStoredUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CurrentUser>;
    if (!parsed.id || !Array.isArray(parsed.roleCodes)) return null;
    const tokenUser = readUserFromToken();
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      roleCodes: parsed.roleCodes,
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : tokenUser?.permissions,
      dataScope: parsed.dataScope
    };
  } catch {
    return null;
  }
}

function readUserFromToken(): CurrentUser | null {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(normalized)) as {
      sub?: unknown;
      roleCodes?: unknown;
      permissions?: unknown;
      dataScope?: unknown;
    };

    if (typeof decoded.sub !== "string" || !Array.isArray(decoded.roleCodes)) return null;

    return {
      id: decoded.sub,
      roleCodes: decoded.roleCodes.filter((role): role is string => typeof role === "string"),
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions.filter((permission): permission is string => typeof permission === "string")
        : undefined,
      dataScope: typeof decoded.dataScope === "string" ? decoded.dataScope : undefined
    };
  } catch {
    return null;
  }
}
