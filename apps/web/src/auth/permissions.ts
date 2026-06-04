export type CurrentUser = {
  id: string;
  name?: string;
  email?: string;
  roleCodes: string[];
  permissions?: string[];
  dataScope?: string;
};

export const ADMIN_ROLE = "ADMIN";
export const REPORT_VIEW_ROLE_CODES = ["ADMIN", "SALES_MANAGER", "EXECUTIVE"] as const;

export const SETTINGS_SECTION_ACCESS = {
  users: "admin",
  roles: "admin",
  "customer-dictionaries": "common",
  "email-accounts": "common",
  ai: "common",
  scoring: "common",
  blacklist: "common",
  "audit-logs": "admin",
  logout: "common"
} as const;

export type SettingsSectionKey = keyof typeof SETTINGS_SECTION_ACCESS;

export function getCurrentUser(): CurrentUser | null {
  const stored = readStoredUser();
  if (stored) return stored;

  return readUserFromToken();
}

export function hasAnyRole(user: CurrentUser | null, roles: readonly string[]) {
  if (!user) return false;
  return roles.some((role) => user.roleCodes.includes(role));
}

export function isAdmin(user: CurrentUser | null) {
  return hasAnyRole(user, [ADMIN_ROLE]);
}

export function canViewReports(user: CurrentUser | null) {
  return hasAnyRole(user, REPORT_VIEW_ROLE_CODES);
}

export function defaultReportPath(user: CurrentUser | null) {
  if (canViewReports(user)) return "/reports/management";
  return defaultAuthorizedPath(user);
}

export function canViewSettingsSection(user: CurrentUser | null, section?: string) {
  if (!user) return false;
  const access = toSettingsSectionAccess(section);
  if (!access) return false;
  return access === "common" || isAdmin(user);
}

export function defaultSettingsPath(user: CurrentUser | null) {
  if (!user) return "/login";
  return isAdmin(user) ? "/settings/users" : "/settings/customer-dictionaries";
}

export function defaultAuthorizedPath(user: CurrentUser | null) {
  if (!user) return "/login";
  return "/dashboard";
}

function toSettingsSectionAccess(section?: string) {
  if (!section) return undefined;
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_SECTION_ACCESS, section)) return undefined;
  return SETTINGS_SECTION_ACCESS[section as SettingsSectionKey];
}

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
