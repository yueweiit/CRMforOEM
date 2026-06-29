export type EmailDraftFilters = {
  purpose: string;
  status: string;
  recipient: string;
};

export type EmailDraftHistoryPage<T> = {
  items: T[];
  nextCursor?: string | null;
};

export type EmailDraftGenerationRunLike = {
  id?: string;
  status?: string;
};

export type EmailDraftListItemLike = {
  id: string;
  body?: string;
  aiGenerationRun?: EmailDraftGenerationRunLike;
};

const DEFAULT_EMAIL_DRAFT_PAGE_LIMIT = 20;

export function buildEmailDraftFilterQuery(
  filters: EmailDraftFilters,
  cursor?: string | null,
  limit = DEFAULT_EMAIL_DRAFT_PAGE_LIMIT
) {
  const params = new URLSearchParams();
  appendTrimmed(params, "purpose", filters.purpose);
  appendTrimmed(params, "status", filters.status);
  appendTrimmed(params, "recipient", filters.recipient);
  appendTrimmed(params, "cursor", cursor ?? "");
  params.set("limit", String(limit));
  return params.toString();
}

export function flattenEmailDraftPages<T>(pages?: Array<EmailDraftHistoryPage<T>>) {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function shouldPollEmailDraftPages(pages?: Array<EmailDraftHistoryPage<EmailDraftListItemLike>>) {
  return flattenEmailDraftPages(pages).some((draft) => {
    const status = draft.aiGenerationRun?.status;
    return !draft.body && (status === "QUEUED" || status === "RUNNING");
  });
}

function appendTrimmed(params: URLSearchParams, key: string, value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
}
