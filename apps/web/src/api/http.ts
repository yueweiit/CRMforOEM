const API_BASE = "/api";

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { headers: authHeaders() });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 401 && allowRefresh && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() } }, false);
    }
    clearSessionAndRedirect();
  }
  if (!response.ok) {
    const raw = await response.text();
    let message = "";
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      message = Array.isArray(parsed.message) ? parsed.message.join("\n") : (parsed.message ?? "");
    } catch {
      message = "";
    }
    throw new Error(message || raw || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { accessToken?: string };
    if (!data.accessToken) return false;
    localStorage.setItem("accessToken", data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export function clearSessionAndRedirect() {
  import("../hooks/useSse").then(({ closeSse }) => closeSse());
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}
