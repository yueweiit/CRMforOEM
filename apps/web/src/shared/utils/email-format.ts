type DraftEmailAccount = {
  name?: string;
  email?: string;
};

type DraftEmailLike = {
  toEmail: string;
  toNameSnapshot?: string | null;
  fromEmailSnapshot?: string | null;
  fromNameSnapshot?: string | null;
  emailAccount?: DraftEmailAccount | null;
};

type FormatDraftPartyOptions = {
  fallback?: string;
  separator?: string;
};

export function normalizeEmailAddress(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function sameEmailAddress(left?: string | null, right?: string | null) {
  return normalizeEmailAddress(left) === normalizeEmailAddress(right);
}

export function formatDraftSender(draft: DraftEmailLike, options: FormatDraftPartyOptions = {}) {
  const separator = options.separator ?? " / ";
  if (draft.fromEmailSnapshot) {
    return draft.fromNameSnapshot ? `${draft.fromNameSnapshot}${separator}${draft.fromEmailSnapshot}` : draft.fromEmailSnapshot;
  }
  if (draft.emailAccount?.email) {
    return draft.emailAccount.name ? `${draft.emailAccount.name}${separator}${draft.emailAccount.email}` : draft.emailAccount.email;
  }
  return options.fallback ?? "-";
}

export function formatDraftRecipient(draft: DraftEmailLike, options: FormatDraftPartyOptions = {}) {
  const separator = options.separator ?? " / ";
  return draft.toNameSnapshot ? `${draft.toNameSnapshot}${separator}${draft.toEmail}` : draft.toEmail;
}
