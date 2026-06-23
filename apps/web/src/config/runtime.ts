export function normalizeBasePath(value: string | undefined, fallback = "/") {
  const raw = (value ?? fallback).trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function normalizeApiBasePath(value: string | undefined, fallback: string) {
  const raw = (value ?? fallback).trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/g, "");

  const normalized = normalizeBasePath(raw);
  if (appBasePath !== "/" && normalized === "/api") {
    return `${appBasePath}/api`;
  }
  return normalized;
}

function inferKnownBasePath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname === "/oemcrm" || window.location.pathname.startsWith("/oemcrm/")
    ? "/oemcrm"
    : "/";
}

export const appBasePath = normalizeBasePath(import.meta.env.VITE_BASE_PATH, inferKnownBasePath());
export const apiBasePath = normalizeApiBasePath(
  import.meta.env.VITE_API_BASE,
  `${appBasePath === "/" ? "" : appBasePath}/api`
);
