import { apiDelete, apiGet, apiPatch, apiPost } from "./http";

type MutationOptions = { toast?: boolean };

export function getCustomers<T = unknown>(queryString = "") {
  return apiGet<T>(`/customers${queryString}`);
}

export function getCustomerFilterOptions<T = unknown>() {
  return apiGet<T>("/customers/filter-options");
}

export function createCustomer<T = unknown>(payload: Record<string, unknown>) {
  return apiPost<T>("/customers", payload);
}

export function getCustomerDetail<T = unknown>(id: string) {
  return apiGet<T>(`/customers/${id}`);
}

export function updateCustomer<T = unknown>(id: string, payload: unknown) {
  return apiPatch<T>(`/customers/${id}`, payload);
}

export function updateCustomerStage<T = unknown>(id: string, payload: { stage: string; reason?: string }) {
  return apiPost<T>(`/customers/${id}/stage`, payload);
}

export function createCustomerContact<T = unknown>(customerId: string, payload: unknown) {
  return apiPost<T>(`/customers/${customerId}/contacts`, payload);
}

export function updateCustomerContact<T = unknown>(customerId: string, contactId: string, payload: unknown) {
  return apiPatch<T>(`/customers/${customerId}/contacts/${contactId}`, payload);
}

export function deleteCustomerContact<T = unknown>(customerId: string, contactId: string) {
  return apiDelete<T>(`/customers/${customerId}/contacts/${contactId}`);
}

export function getCustomerBackgroundTasks<T = unknown>(id: string) {
  return apiGet<T>(`/customers/${id}/background-tasks`);
}

export function createWebsiteAnalysis<T = unknown>(customerId: string) {
  return apiPost<T>(`/customers/${customerId}/website-analyses`);
}

export function createResearchReport<T = unknown>(customerId: string) {
  return apiPost<T>(`/customers/${customerId}/research-reports`, {});
}

export function createOemFitScore<T = unknown>(customerId: string) {
  return apiPost<T>(`/customers/${customerId}/oem-fit-scores`);
}

export function getCustomerEmailDrafts<T = unknown>(customerId: string) {
  return apiGet<T>(`/customers/${customerId}/email-drafts`);
}

export function getCustomerEmailThreads<T = unknown>(customerId: string) {
  return apiGet<T>(`/customers/${customerId}/email-threads`);
}

export function generateEmailDraft<T = unknown>(customerId: string, payload: Record<string, string | undefined>) {
  return apiPost<T>(`/customers/${customerId}/email-drafts/generate`, payload);
}

export function getQuotes<T = unknown>(customerId: string) {
  return apiGet<T>(`/quotes?customerId=${customerId}`);
}

export function createQuote<T = unknown>(payload: unknown) {
  return apiPost<T>("/quotes", payload);
}

export function getSamples<T = unknown>(customerId: string) {
  return apiGet<T>(`/samples?customerId=${customerId}`);
}

export function createSample<T = unknown>(payload: unknown) {
  return apiPost<T>("/samples", payload);
}
