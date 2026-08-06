import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost } from "./http";
import type { OemScore, OemScoreHistoryItem, QuoteHistoryItem, ResearchReport, ResearchReportHistoryItem, ResearchReportJson, WebsiteAiInsights, WebsiteAnalysis, WebsiteAnalysisHistoryItem } from "../features/customers/detail/shared/types";

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

export function getWebsiteAnalysisHistory(customerId: string) {
  return apiGet<WebsiteAnalysisHistoryItem[]>(`/customers/${customerId}/website-analyses`);
}

export function getWebsiteAnalysis(analysisId: string) {
  return apiGet<WebsiteAnalysis>(`/website-analyses/${analysisId}`);
}

export function createResearchReport<T = unknown>(customerId: string) {
  return apiPost<T>(`/customers/${customerId}/research-reports`, {});
}

export function getResearchReportHistory(customerId: string) {
  return apiGet<ResearchReportHistoryItem[]>(`/customers/${customerId}/research-reports`);
}

export function getResearchReport(customerId: string, reportId: string) {
  return apiGet<ResearchReport>(`/customers/${customerId}/research-reports/${reportId}`);
}

export function createOemFitScore<T = unknown>(customerId: string) {
  return apiPost<T>(`/customers/${customerId}/oem-fit-scores`);
}

export function getOemFitScoreHistory(customerId: string) {
  return apiGet<OemScoreHistoryItem[]>(`/customers/${customerId}/oem-fit-scores`);
}

export function getOemFitScore(customerId: string, scoreId: string) {
  return apiGet<OemScore>(`/customers/${customerId}/oem-fit-scores/${scoreId}`);
}

export function deleteWebsiteAnalysis(analysisId: string) {
  return apiDelete<{ deleted: boolean }>(`/website-analyses/${analysisId}`);
}

export function updateWebsiteAnalysis(analysisId: string, payload: { opportunities?: string[]; risks?: string[]; aiInsights?: Partial<WebsiteAiInsights> }) {
  return apiPatch<unknown>(`/website-analyses/${analysisId}`, payload);
}

export function deleteResearchReport(customerId: string, reportId: string) {
  return apiDelete<{ deleted: boolean }>(`/customers/${customerId}/research-reports/${reportId}`);
}

export function updateResearchReport(customerId: string, reportId: string, payload: { title?: string; reportJson?: Partial<ResearchReportJson> }) {
  return apiPatch<unknown>(`/customers/${customerId}/research-reports/${reportId}`, payload);
}

export function deleteOemFitScore(customerId: string, scoreId: string) {
  return apiDelete<{ deleted: boolean }>(`/customers/${customerId}/oem-fit-scores/${scoreId}`);
}

export function updateOemFitScore(customerId: string, scoreId: string, payload: { manualScore?: number; manualGrade?: string; manualBreakdown?: Record<string, number>; manualNotes?: string }) {
  return apiPatch<unknown>(`/customers/${customerId}/oem-fit-scores/${scoreId}`, payload);
}

export function getCustomerEmailDrafts<T = unknown>(customerId: string, queryString = "") {
  return apiGet<T>(`/customers/${customerId}/email-drafts${queryString ? `?${queryString}` : ""}`);
}

export function getCustomerEmailThreads<T = unknown>(customerId: string) {
  return apiGet<T>(`/customers/${customerId}/email-threads`);
}

export function generateEmailDraft<T = unknown>(customerId: string, payload: Record<string, string | boolean | undefined>) {
  return apiPost<T>(`/customers/${customerId}/email-drafts/generate`, payload);
}

export function getQuotes<T = unknown>(customerId: string) {
  return apiGet<T>(`/quotes?customerId=${customerId}`);
}

export function createQuote<T = unknown>(payload: unknown) {
  return apiPost<T>("/quotes", payload);
}

export function submitQuoteReview<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/submit-review`, payload, options);
}

export function approveQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/approve`, payload, options);
}

export function rejectQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/reject`, payload, options);
}

export function sendQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/send`, payload, options);
}

export function acceptQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/accept`, payload, options);
}

export function rejectCustomerQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/reject-customer`, payload, options);
}

export function expireQuote<T = unknown>(quoteId: string, payload: { comment?: string } = {}, options?: MutationOptions) {
  return apiPost<T>(`/quotes/${quoteId}/expire`, payload, options);
}

export function updateQuote<T = unknown>(quoteId: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/quotes/${quoteId}`, payload, options);
}


export function deleteQuote<T = unknown>(quoteId: string, options?: MutationOptions) {
  return apiDelete<T>(`/quotes/${quoteId}`, options);
}

export function getQuoteHistory<T = QuoteHistoryItem[]>(quoteId: string) {
  return apiGet<T>(`/quotes/${quoteId}/history`);
}

export function exportQuote(quoteId: string) {
  return apiGetBlob(`/quotes/${quoteId}/export`);
}

export function exportQuotes(customerId: string) {
  return apiGetBlob(`/quotes/export?customerId=${customerId}`);
}

export function getSamples<T = unknown>(customerId: string) {
  return apiGet<T>(`/samples?customerId=${customerId}`);
}

export function exportSamples(customerId: string) {
  return apiGetBlob(`/samples/export?customerId=${customerId}`);
}

export function createSample<T = unknown>(payload: unknown) {
  return apiPost<T>("/samples", payload);
}

export function updateSample<T = unknown>(sampleId: string, payload: unknown) {
  return apiPatch<T>(`/samples/${sampleId}`, payload);
}

export function getSampleHistory<T = unknown>(sampleId: string) {
  return apiGet<T>(`/samples/${sampleId}/history`);
}

export function recordSampleFee<T = unknown>(sampleId: string, payload: unknown) {
  return apiPost<T>(`/samples/${sampleId}/fees`, payload);
}

export function updateSampleFee<T = unknown>(sampleId: string, feeId: string, payload: unknown) {
  return apiPatch<T>(`/samples/${sampleId}/fees/${feeId}`, payload);
}

export function deleteSampleFee<T = unknown>(sampleId: string, feeId: string) {
  return apiDelete<T>(`/samples/${sampleId}/fees/${feeId}`);
}

export function recordSampleReturn<T = unknown>(sampleId: string, payload: unknown) {
  return apiPost<T>(`/samples/${sampleId}/returns`, payload);
}

export function deleteSample<T = unknown>(sampleId: string) {
  return apiDelete<T>(`/samples/${sampleId}`);
}
