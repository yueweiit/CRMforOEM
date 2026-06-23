import { apiGet, apiPatch, apiPost } from "./http";

export function getUsers<T = unknown>() {
  return apiGet<T>("/settings/users");
}

export function createUser<T = unknown>(payload: unknown) {
  return apiPost<T>("/settings/users", payload);
}

export function toggleUser<T = unknown>(userId: string, isActive: boolean) {
  return apiPatch<T>(`/settings/users/${userId}`, { isActive });
}

export function getRoles<T = unknown>() {
  return apiGet<T>("/settings/roles");
}

export function getPermissions<T = unknown>() {
  return apiGet<T>("/settings/permissions");
}

export function updateRolePermissions<T = unknown>(roleId: string, permissionCodes: string[]) {
  return apiPatch<T>(`/settings/roles/${roleId}/permissions`, { permissionCodes });
}

export function getCustomerSources<T = unknown>() {
  return apiGet<T>("/settings/customer-sources");
}

export function createCustomerSource<T = unknown>(payload: unknown) {
  return apiPost<T>("/settings/customer-sources", payload);
}

export function updateCustomerSource<T = unknown>(id: string, payload: unknown) {
  return apiPatch<T>(`/settings/customer-sources/${id}`, payload);
}

export function getCustomerTypes<T = unknown>() {
  return apiGet<T>("/settings/customer-types");
}

export function createCustomerType<T = unknown>(payload: unknown) {
  return apiPost<T>("/settings/customer-types", payload);
}

export function updateCustomerType<T = unknown>(id: string, payload: unknown) {
  return apiPatch<T>(`/settings/customer-types/${id}`, payload);
}

export function getEmailPromptConfigs<T = unknown>() {
  return apiGet<T>("/settings/email-prompt-configs");
}

export function updateEmailPromptConfig<T = unknown>(purpose: string, payload: unknown) {
  return apiPatch<T>(`/settings/email-prompt-configs/${purpose}`, payload);
}

export function resetEmailPromptConfig<T = unknown>(purpose: string) {
  return apiPost<T>(`/settings/email-prompt-configs/${purpose}/reset`);
}

export function previewEmailPromptConfig<T = unknown>(purpose: string, payload: unknown) {
  return apiPost<T>(`/settings/email-prompt-configs/${purpose}/preview`, payload);
}

export function getOemScoringWeights<T = unknown>() {
  return apiGet<T>("/settings/oem-scoring-weights");
}

export function updateOemScoringWeights<T = unknown>(payload: unknown) {
  return apiPatch<T>("/settings/oem-scoring-weights", payload);
}

export function getBlacklistRules<T = unknown>() {
  return apiGet<T>("/blacklist-rules");
}

export function createBlacklistRule<T = unknown>(payload: unknown) {
  return apiPost<T>("/blacklist-rules", payload);
}

export function toggleBlacklistRule<T = unknown>(ruleId: string, isActive: boolean) {
  return apiPatch<T>(`/blacklist-rules/${ruleId}`, { isActive });
}

export function getAuditLogs<T = unknown>() {
  return apiGet<T>("/settings/audit-logs");
}

export function login<T = unknown>(email: string, password: string) {
  return apiPost<T>("/auth/login", { email, password });
}

export function logout<T = unknown>() {
  return apiPost<T>("/auth/logout");
}
