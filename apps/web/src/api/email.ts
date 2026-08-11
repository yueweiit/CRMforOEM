import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./http";

export function getEmailAccounts<T = unknown>() {
  return apiGet<T>("/email-accounts");
}

export function createEmailAccount<T = unknown>(payload: unknown, options?: { toast?: boolean }) {
  return apiPost<T>("/email-accounts", payload, options);
}

export function updateEmailAccount<T = unknown>(id: string, payload: unknown, options?: { toast?: boolean }) {
  return apiPatch<T>(`/email-accounts/${id}`, payload, options);
}

export function testEmailAccount<T = unknown>(accountId: string) {
  return apiPost<T>(`/email-accounts/${accountId}/test`);
}

export function toggleEmailAccount<T = unknown>(id: string, isActive: boolean) {
  return apiPatch<T>(`/email-accounts/${id}`, { isActive });
}

export function getEmailSyncStatus<T = unknown>() {
  return apiGet<T>("/email-sync/status");
}

export function runEmailSync<T = unknown>(options?: { toast?: boolean }) {
  return apiPost<T>("/email-sync/run", undefined, options);
}

export function getEmailDrafts<T = unknown>() {
  return apiGet<T>("/email-drafts");
}

export function getEmailDraft<T = unknown>(draftId: string) {
  return apiGet<T>(`/email-drafts/${draftId}`);
}

export function updateEmailDraft<T = unknown>(draftId: string, payload: unknown, options?: { toast?: boolean }) {
  return apiPatch<T>(`/email-drafts/${draftId}`, payload, options);
}

export function approveEmailDraft<T = unknown>(draftId: string) {
  return apiPost<T>(`/email-drafts/${draftId}/approve`, { reviewComment: "Approved in customer detail" });
}

export function sendEmailDraft<T = unknown>(draftId: string, options?: { toast?: boolean }) {
  return apiPost<T>(`/email-drafts/${draftId}/send`, undefined, options);
}

export function uploadEmailDraftAttachment<T = unknown>(draftId: string, file: File, options?: { toast?: boolean }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", file.name);
  return apiUpload<T>(`/email-drafts/${draftId}/attachments`, formData, options);
}

export function deleteEmailDraftAttachment<T = unknown>(draftId: string, attachmentId: string, options?: { toast?: boolean }) {
  return apiDelete<T>(`/email-drafts/${draftId}/attachments/${attachmentId}`, options);
}

export function getEmailAttachmentUrl(fileAssetId: string) {
  return apiGet<{ id: string; url: string; originalName: string; mimeType?: string | null }>(`/upload/${fileAssetId}/url`);
}

export function getEmailThreads<T = unknown>() {
  return apiGet<T>("/email-threads");
}

export function getQuoteReplyAssessments<T = unknown>(customerId: string, status = "PENDING") {
  return apiGet<T>(`/quote-reply-assessments?customerId=${encodeURIComponent(customerId)}&status=${encodeURIComponent(status)}`);
}

export function confirmQuoteReplyAssessment<T = unknown>(assessmentId: string, outcome: "ACCEPTED" | "CUSTOMER_REJECTED") {
  return apiPost<T>(`/quote-reply-assessments/${assessmentId}/confirm`, { outcome });
}

export function dismissQuoteReplyAssessment<T = unknown>(assessmentId: string) {
  return apiPost<T>(`/quote-reply-assessments/${assessmentId}/dismiss`);
}
