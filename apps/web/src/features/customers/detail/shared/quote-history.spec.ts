import * as assert from "node:assert/strict";
import { quoteApprovalHistoryNote } from "./quote-history";
import type { QuoteHistoryItem } from "./types";

function historyItem(action: string, comment: string, createdAt: string): QuoteHistoryItem {
  return { id: `${action}-${createdAt}`, action, comment, createdAt };
}

const approvedHistory = [
  historyItem("APPROVED", "价格符合要求", "2026-08-12T02:00:00.000Z"),
  historyItem("SUBMITTED", "请优先审核交期", "2026-08-12T01:00:00.000Z")
];

assert.equal(quoteApprovalHistoryNote(approvedHistory, "SUBMITTED", "提交备注"), "提交备注：请优先审核交期");
assert.equal(quoteApprovalHistoryNote(approvedHistory, "APPROVED", "审批备注"), "审批备注：价格符合要求");

const inheritedSubmissionNoteHistory = [
  historyItem("APPROVED", "已通过报价审批", "2026-08-12T02:00:00.000Z"),
  historyItem("SUBMITTED", "客户要求本周确认", "2026-08-12T01:00:00.000Z")
];

assert.equal(quoteApprovalHistoryNote(inheritedSubmissionNoteHistory, "SUBMITTED", "提交备注"), "提交备注：客户要求本周确认");
assert.equal(quoteApprovalHistoryNote(inheritedSubmissionNoteHistory, "APPROVED", "审批备注"), "");

assert.equal(
  quoteApprovalHistoryNote([historyItem("SUBMITTED", "Submitted for approval", "2026-08-12T01:00:00.000Z")], "SUBMITTED", "提交备注"),
  ""
);

console.log("quote-history.spec.ts OK");
