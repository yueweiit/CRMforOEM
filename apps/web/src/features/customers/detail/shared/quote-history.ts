import type { QuoteHistoryItem } from "./types";

export type QuoteApprovalHistoryAction = "SUBMITTED" | "APPROVED" | "REJECTED";

const DEFAULT_APPROVAL_COMMENTS: Record<QuoteApprovalHistoryAction, string> = {
  SUBMITTED: "已提交报价审批",
  APPROVED: "已通过报价审批",
  REJECTED: "已驳回报价审批"
};

const LEGACY_HISTORY_COMMENTS: Record<string, string> = {
  "Quote created": "已创建报价",
  "Quote updated": "已更新报价",
  "Quote voided": "已作废报价",
  "Submitted for approval": DEFAULT_APPROVAL_COMMENTS.SUBMITTED,
  "Quote approved": DEFAULT_APPROVAL_COMMENTS.APPROVED,
  "Quote rejected": DEFAULT_APPROVAL_COMMENTS.REJECTED
};

export function normalizeQuoteHistoryComment(comment: string) {
  return LEGACY_HISTORY_COMMENTS[comment] ?? comment;
}

export function quoteApprovalHistoryNote(
  history: QuoteHistoryItem[],
  action: QuoteApprovalHistoryAction,
  label: "提交备注" | "审批备注"
) {
  const item = history.find((candidate) => candidate.action === action);
  const comment = normalizeQuoteHistoryComment(item?.comment?.trim() ?? "");
  return comment && comment !== DEFAULT_APPROVAL_COMMENTS[action] ? `${label}：${comment}` : "";
}
