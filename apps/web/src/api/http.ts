import { showClientToast, showLoadingToast } from "../components/Toast";
import { apiBasePath, appBasePath } from "../config/runtime";
import { readCurrentLocale } from "../i18n/locale";
import { translate } from "../i18n";

const API_BASE = apiBasePath;

type MutationToastOptions = {
  toast?: boolean;
};

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { headers: authHeaders() });
}

export async function apiPost<T>(path: string, body?: unknown, options?: MutationToastOptions): Promise<T> {
  return apiMutationRequest<T>(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: body ? JSON.stringify(body) : undefined
    },
    "create",
    options
  );
}

export async function apiPatch<T>(path: string, body?: unknown, options?: MutationToastOptions): Promise<T> {
  return apiMutationRequest<T>(
    path,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: body ? JSON.stringify(body) : undefined
    },
    "update",
    options
  );
}

export async function apiDelete<T>(path: string, options?: MutationToastOptions): Promise<T> {
  return apiMutationRequest<T>(
    path,
    {
      method: "DELETE",
      headers: authHeaders()
    },
    "delete",
    options
  );
}

export async function apiUpload<T>(path: string, formData: FormData, options?: MutationToastOptions): Promise<T> {
  return apiMutationRequest<T>(
    path,
    {
      method: "POST",
      headers: authHeaders(),
      body: formData
    },
    "upload",
    options
  );
}

export async function apiGetBlob(path: string): Promise<{ blob: Blob; fileName?: string; contentType?: string }> {
  return apiBlobRequest(path, { headers: authHeaders() });
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiMutationRequest<T>(
  path: string,
  init: RequestInit,
  kind: "create" | "update" | "delete" | "upload",
  options?: MutationToastOptions
): Promise<T> {
  const shouldToast = options?.toast !== false && shouldAutoToast(path);
  const loadingHandle = shouldToast
    ? showLoadingToast({
        title: mutationToastTitle(kind),
        message: mutationLoadingMessage(kind),
        dedupeKey: `loading:${init.method}:${path}`
      })
    : null;

  try {
    const result = await apiRequest<T>(path, init);
    loadingHandle?.close();
    if (shouldToast) {
      showClientToast({
        type: "success",
        title: mutationSuccessTitle(kind),
        message: mutationSuccessMessage(kind),
        dedupeKey: `success:${init.method}:${path}`
      });
    }
    return result;
  } catch (error) {
    loadingHandle?.close();
    if (shouldToast) {
      showClientToast({
        type: "error",
        title: mutationToastTitle(kind),
        message: error instanceof Error ? error.message : mutationErrorMessage(kind),
        dedupeKey: `error:${init.method}:${path}`
      });
    }
    throw error;
  }
}

async function apiRequest<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 401 && allowRefresh && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(
        path,
        { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() } },
        false
      );
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

async function apiBlobRequest(
  path: string,
  init: RequestInit,
  allowRefresh = true
): Promise<{ blob: Blob; fileName?: string; contentType?: string }> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 401 && allowRefresh && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiBlobRequest(
        path,
        { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() } },
        false
      );
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

  const blob = await response.blob();
  return {
    blob,
    fileName: parseFileName(response.headers.get("Content-Disposition")),
    contentType: response.headers.get("Content-Type") ?? undefined
  };
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
  const loginPath = `${appBasePath === "/" ? "" : appBasePath}/login`;
  if (window.location.pathname !== loginPath) {
    window.location.replace(loginPath);
  }
}

function parseFileName(contentDisposition: string | null) {
  if (!contentDisposition) return undefined;

  const encoded = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/^"(.*)"$/, "$1"));
    } catch {
      return encoded.replace(/^"(.*)"$/, "$1");
    }
  }

  const plain = contentDisposition.match(/filename="?([^"]+)"?/i)?.[1];
  return plain ?? undefined;
}

function shouldAutoToast(path: string) {
  return path !== "/auth/login" && path !== "/auth/refresh";
}

function mutationToastTitle(kind: "create" | "update" | "delete" | "upload") {
  const locale = readCurrentLocale();
  if (kind === "create") return translate(locale, "toast.processing");
  if (kind === "update") return translate(locale, "toast.processing");
  if (kind === "delete") return translate(locale, "toast.processing");
  return translate(locale, "toast.uploading");
}

function mutationLoadingMessage(kind: "create" | "update" | "delete" | "upload") {
  const locale = readCurrentLocale();
  if (kind === "create") return translate(locale, "toast.loadingCreate");
  if (kind === "update") return translate(locale, "toast.loadingUpdate");
  if (kind === "delete") return translate(locale, "toast.loadingDelete");
  return translate(locale, "toast.loadingUpload");
}

function mutationSuccessMessage(kind: "create" | "update" | "delete" | "upload") {
  const locale = readCurrentLocale();
  if (kind === "create") return translate(locale, "toast.successCreate");
  if (kind === "update") return translate(locale, "toast.successUpdate");
  if (kind === "delete") return translate(locale, "toast.successDelete");
  return translate(locale, "toast.successUpload");
}

function mutationSuccessTitle(kind: "create" | "update" | "delete" | "upload") {
  const locale = readCurrentLocale();
  if (kind === "create") return translate(locale, "toast.successCreateTitle");
  if (kind === "update") return translate(locale, "toast.successUpdateTitle");
  if (kind === "delete") return translate(locale, "toast.successDeleteTitle");
  return translate(locale, "toast.successUploadTitle");
}

function mutationErrorMessage(kind: "create" | "update" | "delete" | "upload") {
  const locale = readCurrentLocale();
  if (kind === "create") return translate(locale, "toast.errorCreate");
  if (kind === "update") return translate(locale, "toast.errorUpdate");
  if (kind === "delete") return translate(locale, "toast.errorDelete");
  return translate(locale, "toast.errorUpload");
}
