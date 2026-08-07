import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, ChevronDown, CopyPlus, Download, History, MoreHorizontal, Send, XCircle } from "lucide-react";
import "./analysis-edit.css";
import { quoteFlowStatusLabel } from "@oem-crm/shared";
import { showClientToast } from "../../../../components/Toast";
import {
  createSample,
  createSampleResampleDraft,
  exportSamples,
  deleteSample,
  deleteSampleFee,
  getQuoteHistory,
  getSampleHistory,
  getQuotes,
  getSamples,
  recordSampleFee,
  submitSampleApproval,
  approveSampleRound,
  rejectSampleRound,
  retainSampleRound,
  shipSampleRound,
  deliverSampleRound,
  recordSampleFeedback,
  recordSampleDisposition,
  updateSampleFee,
  updateSample
} from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { FileUpload } from "../../../../components/FileUpload";
import { AppSelect } from "../../../../components/AppSelect";
import { LocalizedDateInput } from "../../../../components/LocalizedDateInput";
import { Field } from "../../../../components/ui/Field";
import { useI18n } from "../../../../i18n";
import type { TranslationKey } from "../../../../i18n/resources";
import { formatDateInput } from "../../../../shared/utils/format";
import type { Quote, QuoteHistoryItem, Sample, SampleFee, SampleHistoryItem } from "../shared/types";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const COST_NATURES = [
  { value: "ACTUAL_COST", label: "实际成本", labelKey: "sampleFields.actualCost" },
  { value: "CUSTOMER_CHARGE", label: "客户收费", labelKey: "sampleFields.customerCharge" }
] as const;

const FEE_RESPONSIBILITIES = [
  { value: "FACTORY", label: "企业承担", labelKey: "sampleFields.factoryResponsibility" },
  { value: "CUSTOMER", label: "客户承担", labelKey: "sampleFields.customerResponsibility" },
  { value: "SUPPLIER", label: "供应商承担", labelKey: "sampleFields.supplierResponsibility" },
  { value: "NEGOTIATED", label: "协商承担", labelKey: "sampleFields.negotiatedResponsibility" }
] as const;

const PAYMENT_STATUSES = [
  { value: "NOT_APPLICABLE", label: "不适用", labelKey: "sampleFields.notApplicable" },
  { value: "PENDING", label: "待收款", labelKey: "sampleFields.paymentPending" },
  { value: "RECEIVED", label: "已收款", labelKey: "sampleFields.paymentReceived" },
  { value: "WAIVED", label: "已免收", labelKey: "sampleFields.paymentWaived" },
  { value: "REFUNDED", label: "已退款", labelKey: "sampleFields.paymentRefunded" }
] as const;

const FEE_TYPES = [
  { value: "SAMPLE_MAKING", label: "打样费", labelKey: "sampleFields.sampleMakingFee" },
  { value: "MOLD", label: "模具费", labelKey: "sampleFields.moldFee" },
  { value: "COURIER", label: "快递费", labelKey: "sampleFields.courierFee" },
  { value: "PACKAGING", label: "包装费", labelKey: "sampleFields.packagingFee" },
  { value: "RETURN", label: "返还费", labelKey: "sampleFields.returnFee" },
  { value: "OTHER", label: "其他费用", labelKey: "sampleFields.otherFee" }
] as const;

const SAMPLE_PURPOSES = [
  { value: "CUSTOMER_TEST", label: "客户测试" },
  { value: "EXHIBITION", label: "参展" },
  { value: "APPEARANCE_CONFIRMATION", label: "确认外观" }
] as const;

const SAMPLE_STATUS_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  DRAFT: "sampleStatus.requested",
  PENDING_APPROVAL: "sampleStatus.approving",
  APPROVAL_REJECTED: "sampleStatus.rejected",
  PREPARING: "sampleStatus.preparing",
  RETAINED: "sampleStatus.stored",
  SHIPPED: "sampleStatus.shipped",
  DELIVERED: "sampleStatus.delivered",
  FEEDBACK_RECEIVED: "sampleStatus.feedbackReceived",
  VOIDED: "sampleStatus.voided"
};

function localizedSampleStatusLabel(status: string, t: (key: TranslationKey) => string) {
  const key = SAMPLE_STATUS_TRANSLATION_KEYS[status];
  return key ? t(key) : statusLabel(status);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "待申请",
    PENDING_APPROVAL: "待审核",
    APPROVAL_REJECTED: "审批驳回",
    RETAINED: "已留样",
    COMPLETED: "已关闭",
    PREPARING: "打样中",
    SHIPPED: "已寄出",
    DELIVERED: "已签收",
    FEEDBACK_RECEIVED: "已反馈",
    VOIDED: "已作废",
    PASSED: "已通过",
    TERMINATED: "已终止"
  };
  return labels[status] ?? status;
}

function feedbackResultLabel(result?: string | null) {
  return ({ ACCEPTED: "客户确认通过", RESAMPLE_REQUIRED: "客户要求重打", CUSTOMER_REJECTED: "客户终止" } as Record<string, string>)[result ?? ""] ?? result ?? "-";
}

function dispositionLabel(status?: string | null) {
  return ({ PENDING: "待处置", RETURNED: "已归还", CUSTOMER_KEPT: "客户保留", DISPOSED: "已报废" } as Record<string, string>)[status ?? ""] ?? status ?? "-";
}

function sampleTaskOutcome(sample?: Pick<Sample, "currentRoundId" | "terminationReason" | "rounds" | "currentRound"> | null) {
  const currentRound = sample?.currentRound ?? sample?.rounds?.find((item) => item.id === sample.currentRoundId) ?? sample?.rounds?.[sample.rounds.length - 1] ?? null;
  if (sample?.terminationReason) return "TERMINATED";
  if (currentRound?.status === "VOIDED") return "VOIDED";
  if (currentRound?.feedbackResult === "CUSTOMER_REJECTED") return "TERMINATED";
  if (currentRound?.feedbackResult === "ACCEPTED") return "PASSED";
  return "IN_PROGRESS";
}

function sampleTaskStatus(sample?: Sample | null) {
  const currentRound = sample?.currentRound ?? sample?.rounds?.find((item) => item.id === sample.currentRoundId) ?? sample?.rounds?.[sample.rounds.length - 1] ?? null;
  const outcome = sampleTaskOutcome(sample);
  return outcome === "IN_PROGRESS" ? currentRound?.status ?? "DRAFT" : outcome;
}

function historyActionLabel(item: SampleHistoryItem) {
  if (item.action === "STATUS_CHANGED") {
    const beforeStatus = typeof item.before?.status === "string" ? item.before.status : "";
    const afterStatus = typeof item.after?.status === "string" ? item.after.status : "";
    const statusLabels: Record<string, string> = {
      DRAFT: "轮次草稿",
      PENDING_APPROVAL: "提交审批",
      APPROVAL_REJECTED: "审批驳回",
      PREPARING: beforeStatus === "PENDING_APPROVAL" ? "审核通过" : "进入打样",
      RETAINED: "完成我方留样",
      SHIPPED: "已寄出",
      DELIVERED: "已签收",
      FEEDBACK_RECEIVED: "记录客户反馈",
      COMPLETED: "完成本轮",
      VOIDED: "作废本轮"
    };
    return statusLabels[afterStatus] ?? "状态变更";
  }

  const labels: Record<string, string> = {
    CREATED: "创建",
    UPDATED: "更新",
    FEE_ADDED: "费用记录",
    FEE_UPDATED: "费用更新",
    FEE_DELETED: "费用删除",
    QUOTE_LINKED: "关联报价",
    RETAINED: "我方留样",
    SHIPPED: "样品寄出",
    DELIVERED: "客户签收",
    FEEDBACK_RECORDED: "客户反馈",
    RESAMPLE_CREATED: "创建重打轮次",
    CUSTOMER_KEPT: "客户保留",
    RETURNED: "归还",
    VOIDED: "作废",
  };
  return labels[item.action] ?? item.action;
}

function feeTypeLabel(type: string, t?: (key: TranslationKey) => string) {
  const item = FEE_TYPES.find((candidate) => candidate.value === type);
  return item ? (t ? t(item.labelKey) : item.label) : type;
}

function costNatureLabel(value?: string | null, t?: (key: TranslationKey) => string) {
  const item = COST_NATURES.find((candidate) => candidate.value === value);
  return item ? (t ? t(item.labelKey) : item.label) : value ?? "-";
}

function responsibilityLabel(value?: string | null, t?: (key: TranslationKey) => string) {
  const item = FEE_RESPONSIBILITIES.find((candidate) => candidate.value === value);
  return item ? (t ? t(item.labelKey) : item.label) : value ?? "-";
}

function paymentStatusLabel(value?: string | null, t?: (key: TranslationKey) => string) {
  const item = PAYMENT_STATUSES.find((candidate) => candidate.value === value);
  return item ? (t ? t(item.labelKey) : item.label) : value ?? "-";
}

function sampleRoundLabel(sample: Sample | null | undefined, roundId?: string | null) {
  if (!roundId) return "公共费用";
  const round = sample?.rounds?.find((item) => item.id === roundId);
  return round ? `R${round.roundNo}` : "未知轮次";
}

function samplePurposeLabel(purpose?: string | null) {
  return SAMPLE_PURPOSES.find((item) => item.value === purpose)?.label ?? purpose;
}

function dispositionTypeLabel(type: string) { return dispositionLabel(type); }

function statusCodeLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    PENDING_APPROVAL: "待审批",
    APPROVAL_REJECTED: "审批驳回",
    PREPARING: "打样中",
    RETAINED: "已完成我方留样",
    SHIPPED: "已寄出",
    DELIVERED: "已签收",
    FEEDBACK_RECEIVED: "已记录反馈",
    COMPLETED: "本轮已完成",
    VOIDED: "已作废"
  };
  return labels[status] ?? status;
}

function quoteStatusLabel(status: string, locale: Parameters<typeof quoteFlowStatusLabel>[1] = "zh-CN") {
  return quoteFlowStatusLabel(status, locale);
}

function quoteDisplayStatus(quote: Pick<Quote, "status" | "approvalStatus"> | null | undefined) {
  if (!quote) return "";
  if (quote.status === "VOIDED" || quote.status === "SENT" || quote.status === "ACCEPTED" || quote.status === "EXPIRED" || quote.status === "CUSTOMER_REJECTED") {
    return quote.status;
  }
  if (quote.status === "REJECTED") {
    return quote.approvalStatus === "APPROVED" ? "CUSTOMER_REJECTED" : "REJECTED";
  }
  if (quote.approvalStatus === "PENDING_APPROVAL") {
    return "PENDING_APPROVAL";
  }
  if (quote.approvalStatus === "APPROVED") {
    return "APPROVED";
  }
  if (quote.approvalStatus === "REJECTED") {
    return "REJECTED";
  }
  return "DRAFT";
}

const QUOTE_CORE_STATUS_ORDER = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"] as const;
const QUOTE_AFTER_SENT_STATUSES = ["ACCEPTED", "CUSTOMER_REJECTED", "EXPIRED"];
const QUOTE_TERMINAL_STATUSES = ["ACCEPTED", "CUSTOMER_REJECTED", "EXPIRED", "REJECTED", "VOIDED"];

function quoteCoreStatusReached(currentStatus: string, targetStatus: (typeof QUOTE_CORE_STATUS_ORDER)[number]) {
  if (currentStatus === "VOIDED") {
    return targetStatus === "DRAFT";
  }
  if (currentStatus === "REJECTED") {
    return targetStatus === "DRAFT" || targetStatus === "PENDING_APPROVAL";
  }
  if (QUOTE_AFTER_SENT_STATUSES.includes(currentStatus)) {
    return true;
  }
  const currentIndex = QUOTE_CORE_STATUS_ORDER.indexOf(currentStatus as (typeof QUOTE_CORE_STATUS_ORDER)[number]);
  const targetIndex = QUOTE_CORE_STATUS_ORDER.indexOf(targetStatus);
  return currentIndex >= targetIndex && targetIndex >= 0;
}

function quoteStatusPillClass(status: string) {
  const toneByStatus: Record<string, string> = {
    DRAFT: "status-pill--neutral",
    PENDING_APPROVAL: "status-pill--warning",
    APPROVED: "status-pill--success",
    SENT: "status-pill--info",
    ACCEPTED: "status-pill--success",
    CUSTOMER_REJECTED: "status-pill--danger",
    EXPIRED: "status-pill--muted",
    REJECTED: "status-pill--danger",
    VOIDED: "status-pill--muted"
  };
  return ["status-pill", "status-pill--detail", toneByStatus[status] ?? "status-pill--neutral"].join(" ");
}

function normalizeQuoteHistoryComment(comment: string) {
  const legacyLabels: Record<string, string> = {
    "Quote created": "已创建报价",
    "Quote updated": "已更新报价",
    "Quote voided": "已作废报价",
    "Submitted for approval": "已提交报价审批",
    "Quote approved": "已通过报价审批",
    "Quote rejected": "已驳回报价审批"
  };
  return legacyLabels[comment] ?? comment;
}

function quoteHistoryField(item: QuoteHistoryItem, source: "before" | "after", field: string) {
  const value = item[source]?.[field];
  return typeof value === "string" ? value : "";
}

function quoteHistoryStatusTime(history: QuoteHistoryItem[], status: string) {
  const matched = history.find((item) => {
    const beforeStatus = quoteHistoryField(item, "before", "status");
    const afterStatus = quoteHistoryField(item, "after", "status");
    const afterApprovalStatus = quoteHistoryField(item, "after", "approvalStatus");
    const comment = normalizeQuoteHistoryComment(item.comment ?? "");

    if (status === "SENT") {
      return afterStatus === "SENT" || comment.includes("发送报价");
    }
    if (status === "ACCEPTED") {
      return afterStatus === "ACCEPTED" || comment.includes("客户已接受报价");
    }
    if (status === "CUSTOMER_REJECTED") {
      return (afterStatus === "REJECTED" && afterApprovalStatus === "APPROVED") || comment.includes("客户已拒绝报价");
    }
    if (status === "EXPIRED") {
      return afterStatus === "EXPIRED" || comment.includes("报价已到期失效");
    }
    if (status === "REJECTED") {
      return afterApprovalStatus === "REJECTED" || comment.includes("驳回报价审批");
    }
    if (status === "VOIDED") {
      return afterStatus === "VOIDED" || item.action === "VOIDED" || comment.includes("作废报价");
    }

    return beforeStatus !== afterStatus && afterStatus === status;
  });
  return matched?.createdAt ?? "";
}

function quoteTimelineDateValue(date: string | null | undefined) {
  return date ? new Date(date).toLocaleString() : "";
}

function historyActorLabel(item: SampleHistoryItem) {
  return item.actorName ?? item.actorId ?? "系统";
}

function normalizeHistoryComment(comment: string) {
  const legacyLabels: Record<string, string> = {
    "Sample request created": "已创建样品申请",
    "Sample updated": "已更新样品信息",
    "Sample returned": "已记录样品归还",
    "Sample stored": "已记录样品留样",
    "Sample voided": "已作废样品",
    "Unlinked from quote": "已取消关联报价"
  };
  if (legacyLabels[comment]) {
    return legacyLabels[comment];
  }
  if (comment.startsWith("Linked to quote ")) {
    return `已关联报价 ${comment.slice("Linked to quote ".length)}`;
  }
  if (comment.startsWith("Recorded sample fee ")) {
    const feeType = comment.slice("Recorded sample fee ".length).trim();
    return `已记录样品费用 ${feeTypeLabel(feeType)}`;
  }
  if (comment === "已更新样品费用") {
    return "已更新样品费用";
  }
  if (comment.startsWith("Sample status changed to ")) {
    const status = comment.slice("Sample status changed to ".length).trim();
    return `样品状态变更为 ${statusCodeLabel(status)}`;
  }
  return comment;
}

function historyDetailText(item: SampleHistoryItem) {
  if (item.action !== "FEE_ADDED" && item.action !== "FEE_UPDATED" && item.action !== "FEE_DELETED") {
    return "";
  }
  const source = item.action === "FEE_DELETED" ? item.before : item.after;
  const feeType = typeof source?.feeType === "string" ? source.feeType : "";
  const amount = Number(source?.amount ?? NaN);
  const currency = typeof source?.currency === "string" ? source.currency : "";
  const incurredAt = typeof source?.incurredAt === "string" ? source.incurredAt : "";
  const note = typeof source?.note === "string" ? source.note : "";
  const segments = [
    feeType ? `费用类型 ${feeTypeLabel(feeType)}` : "",
    Number.isFinite(amount) ? `金额 ${formatMoney(amount, currency)}` : "",
    incurredAt ? `发生于 ${new Date(incurredAt).toLocaleDateString()}` : "",
    note ? `备注 ${note}` : ""
  ].filter(Boolean);
  return segments.join(" · ");
}

function sampleHistoryField(item: SampleHistoryItem, source: "before" | "after", field: string) {
  const value = item[source]?.[field];
  return typeof value === "string" ? value : "";
}

function sampleHistoryStatusTime(history: SampleHistoryItem[], status: string) {
  const matched = history.find((item) => {
    const beforeStatus = sampleHistoryField(item, "before", "status");
    const afterStatus = sampleHistoryField(item, "after", "status");
    return beforeStatus !== afterStatus && afterStatus === status;
  });
  return matched?.createdAt ?? "";
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount: number, currency?: string) {
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return `${currency ?? ""} ${amount.toFixed(2)}`.trim();
}

function sampleCostLabel(sample: Sample) {
  const summary = sample.costSummary?.byCurrency ?? [];
  if (summary.length) return summary.map((item) => `${item.currency} ${item.totalActualCost.toFixed(2)}`).join(" / ");
  const byCurrency = new Map<string, number>();
  for (const fee of sample.fees ?? []) byCurrency.set(fee.currency, (byCurrency.get(fee.currency) ?? 0) + Number(fee.amount || 0));
  return [...byCurrency.entries()].map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(" / ") || "-";
}

function sampleAttachmentCount(sample: Sample) {
  return sample.fileAssetIds?.length ?? 0;
}

const SAMPLE_CORE_STATUS_ORDER = ["DRAFT", "PENDING_APPROVAL", "PREPARING", "RETAINED", "SHIPPED", "DELIVERED"] as const;
const SAMPLE_AFTER_FEEDBACK_STATUSES = ["FEEDBACK_RECEIVED", "COMPLETED"];

function sampleCoreStatusReached(currentStatus: string, targetStatus: (typeof SAMPLE_CORE_STATUS_ORDER)[number]) {
  if (currentStatus === "VOIDED") {
    return targetStatus === "DRAFT";
  }
  if (currentStatus === "APPROVAL_REJECTED") {
    return targetStatus === "DRAFT" || targetStatus === "PENDING_APPROVAL";
  }
  if (SAMPLE_AFTER_FEEDBACK_STATUSES.includes(currentStatus)) {
    return true;
  }
  const currentIndex = SAMPLE_CORE_STATUS_ORDER.indexOf(currentStatus as (typeof SAMPLE_CORE_STATUS_ORDER)[number]);
  const targetIndex = SAMPLE_CORE_STATUS_ORDER.indexOf(targetStatus);
  return currentIndex >= targetIndex && targetIndex >= 0;
}

function sampleStatusPillClass(status: string) {
  const toneByStatus: Record<string, string> = {
    DRAFT: "status-pill--neutral",
    PENDING_APPROVAL: "status-pill--warning",
    APPROVAL_REJECTED: "status-pill--danger",
    PREPARING: "status-pill--info",
    RETAINED: "status-pill--success",
    SHIPPED: "status-pill--info",
    DELIVERED: "status-pill--success",
    FEEDBACK_RECEIVED: "status-pill--success",
    COMPLETED: "status-pill--success",
    VOIDED: "status-pill--danger",
    PASSED: "status-pill--success",
    TERMINATED: "status-pill--danger"
  };
  return ["status-pill", "status-pill--detail", toneByStatus[status] ?? "status-pill--neutral"].join(" ");
}

function allowedTransitions(status: string) {
  const transitions: Record<string, string[]> = {
    DRAFT: ["PENDING_APPROVAL"],
    APPROVAL_REJECTED: ["PENDING_APPROVAL"],
    PENDING_APPROVAL: ["PREPARING", "APPROVAL_REJECTED"],
    PREPARING: ["RETAINED"],
    RETAINED: ["SHIPPED"],
    SHIPPED: ["DELIVERED", "VOIDED"],
    DELIVERED: ["FEEDBACK_RECEIVED"],
    FEEDBACK_RECEIVED: ["RETURNED", "CUSTOMER_KEPT", "DISPOSED"],
    VOIDED: [],
    COMPLETED: []
  };
  return transitions[status] ?? [];
}

function statusDialogTransitions(status: string) {
  return allowedTransitions(status).filter((nextStatus) => nextStatus !== "VOIDED");
}

type SampleStatusAction = {
  nextStatus: string;
  label: string;
};

function sampleStatusActions(status: string): SampleStatusAction[] {
  if (status === "PENDING_APPROVAL") {
    return [];
  }
  const nextStatuses = statusDialogTransitions(status);
  return nextStatuses.map((nextStatus) => {
    const labels: Record<string, string> = {
      PENDING_APPROVAL: "提交审批",
      RETAINED: "完成留样",
      SHIPPED: "标记已寄出",
      DELIVERED: "确认签收",
      FEEDBACK_RECEIVED: "记录客户反馈",
      RETURNED: "记录归还",
      CUSTOMER_KEPT: "记录客户保留",
      DISPOSED: "记录报废"
    };
    return { nextStatus, label: labels[nextStatus] ?? statusLabel(nextStatus) };
  });
}

function sampleStatusActionLabel(currentStatus: string, nextStatus: string) {
  return sampleStatusActions(currentStatus).find((action) => action.nextStatus === nextStatus)?.label ?? statusLabel(nextStatus);
}

function buildCreatePayload(customerId: string, form: {
  productSummary: string;
  specification: string;
  material: string;
  process: string;
  sampleQuantity: string;
  samplePurpose: string;
  deliveryDeadline: string;
  quoteId: string;
  fileAssetIds: string[];
}, feeForms: Array<{
  feeType: string;
  amount: string;
  currency: string;
  note: string;
  incurredAt: string;
  costNature: "ACTUAL_COST" | "CUSTOMER_CHARGE";
  responsibility: "FACTORY" | "CUSTOMER" | "SUPPLIER" | "NEGOTIATED";
  paymentStatus: "NOT_APPLICABLE" | "PENDING" | "RECEIVED" | "WAIVED" | "REFUNDED";
}>) {
  return {
    customerId,
    productSummary: form.productSummary,
    specification: form.specification,
    material: form.material,
    process: form.process,
    sampleQuantity: Number(form.sampleQuantity),
    samplePurpose: form.samplePurpose,
    deliveryDeadline: form.deliveryDeadline || undefined,
    quoteId: form.quoteId || undefined,
    fileAssetIds: form.fileAssetIds,
    initialFees: feeForms.map((feeForm) => ({
      feeType: feeForm.feeType,
      amount: Number(feeForm.amount),
      currency: feeForm.currency,
      note: feeForm.note || undefined,
      incurredAt: feeForm.incurredAt || undefined,
      costNature: feeForm.costNature,
      responsibility: feeForm.responsibility,
      paymentStatus: feeForm.paymentStatus
    }))
  };
}

function buildUpdatePayload(form: {
  productSummary: string;
  specification: string;
  material: string;
  process: string;
  sampleQuantity: string;
  samplePurpose: string;
  deliveryDeadline: string;
  quoteId: string;
  fileAssetIds: string[];
}) {
  return {
    productSummary: form.productSummary,
    specification: form.specification,
    material: form.material,
    process: form.process,
    requestedQuantity: Number(form.sampleQuantity),
    samplePurpose: form.samplePurpose,
    deliveryDeadline: form.deliveryDeadline || undefined,
    quoteId: form.quoteId || undefined,
    fileAssetIds: form.fileAssetIds
  };
}

function createSampleValidationKey(form: {
  productSummary: string;
  specification: string;
  material: string;
  process: string;
  sampleQuantity: string;
  samplePurpose: string;
  deliveryDeadline: string;
}) {
  const quantity = Number(form.sampleQuantity);
  if (!form.productSummary.trim()) return "sampleFields.validationSampleProductRequired";
  if (!form.specification.trim()) return "sampleFields.validationSpecificationRequired";
  if (!form.sampleQuantity.trim() || !Number.isInteger(quantity) || quantity < 1) return "sampleFields.validationSampleQuantityRequired";
  if (!form.samplePurpose.trim()) return "sampleFields.validationSamplePurposeRequired";
  return null;
}

function createFeeValidationKey(forms: Array<{
  feeType: string;
  amount: string;
  currency: string;
  costNature: string;
  responsibility: string;
  paymentStatus: string;
}>) {
  if (!forms.length) return null;
  if (forms.some((form) => {
    const amount = Number(form.amount);
    return !form.feeType.trim() || !form.amount.trim() || !Number.isFinite(amount) || amount < 0 || !form.currency.trim() || !form.costNature || !form.responsibility || !form.paymentStatus;
  })) {
    return "sampleFields.validationFeeRecordsComplete";
  }
  return null;
}

function detailValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function quoteDetailMoney(quote: Quote | Sample["quote"] | null | undefined, value: string | number | null | undefined) {
  if (!quote || value === null || value === undefined || value === "") {
    return "-";
  }
  return `${quote.currency ?? ""} ${value}`.trim();
}

type SampleFeeForm = {
  feeType: string;
  amount: string;
  currency: string;
  note: string;
  incurredAt: string;
  sampleRoundId: string;
  costNature: "ACTUAL_COST" | "CUSTOMER_CHARGE";
  responsibility: "FACTORY" | "CUSTOMER" | "SUPPLIER" | "NEGOTIATED";
  paymentStatus: "NOT_APPLICABLE" | "PENDING" | "RECEIVED" | "WAIVED" | "REFUNDED";
};

type SampleStatusForm = {
  carrier: string;
  trackingNo: string;
  shippedAt: string;
  deliveredAt: string;
  producedQuantity: string;
  retainedQuantity: string;
  retainedLocation: string;
  feedback: string;
  feedbackResult: "ACCEPTED" | "RESAMPLE_REQUIRED" | "CUSTOMER_REJECTED";
  dispositionStatus: "PENDING" | "RETURNED" | "CUSTOMER_KEPT" | "DISPOSED";
};

function createEmptySampleFee(sampleRoundId = ""): SampleFeeForm {
  return {
    feeType: "SAMPLE_MAKING",
    amount: "",
    currency: "USD",
    note: "",
    incurredAt: formatDateInput(new Date()),
    sampleRoundId,
    costNature: "ACTUAL_COST",
    responsibility: "FACTORY",
    paymentStatus: "NOT_APPLICABLE"
  };
}

function feeDisplayAmount(fee: SampleFee) {
  return `${fee.currency} ${fee.amount}`;
}

export function SamplePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [createForm, setCreateForm] = useState({
    productSummary: "",
    specification: "",
    material: "",
    process: "",
    sampleQuantity: "",
    samplePurpose: "CUSTOMER_TEST",
    deliveryDeadline: "",
    quoteId: "",
    fileAssetIds: [] as string[]
  });
  const [createFeeOpen, setCreateFeeOpen] = useState(false);
  const [createFeeForms, setCreateFeeForms] = useState<ReturnType<typeof createEmptySampleFee>[]>([]);
  const [createValidationRequested, setCreateValidationRequested] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"sample" | "quote">("sample");
  const [detailSample, setDetailSample] = useState<Sample | null>(null);
  const [detailRoundId, setDetailRoundId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeMode, setFeeMode] = useState<"create" | "edit">("create");
  const [feeDeleteOpen, setFeeDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [statusSample, setStatusSample] = useState<Sample | null>(null);
  const [statusTarget, setStatusTarget] = useState<string | null>(null);
  const [statusRoundId, setStatusRoundId] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState<SampleStatusForm>({
    carrier: "",
    trackingNo: "",
    shippedAt: formatDateInput(new Date()),
    deliveredAt: "",
    producedQuantity: "",
    retainedQuantity: "",
    retainedLocation: "",
    feedback: "",
    feedbackResult: "ACCEPTED",
    dispositionStatus: "PENDING"
  });
  const [feeSample, setFeeSample] = useState<Sample | null>(null);
  const [feeEditing, setFeeEditing] = useState<{ sampleId: string; feeId: string } | null>(null);
  const [feeDeleting, setFeeDeleting] = useState<{ sampleId: string; feeId: string; feeType: string } | null>(null);
  const [historySample, setHistorySample] = useState<Sample | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"approve" | "reject">("approve");
  const [approvalSample, setApprovalSample] = useState<Sample | null>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [resampleDraftOpen, setResampleDraftOpen] = useState(false);
  const [resampleDraftSource, setResampleDraftSource] = useState<Sample | null>(null);
  const [resampleDraftReason, setResampleDraftReason] = useState("");
  const [resampleDraftChangeSummary, setResampleDraftChangeSummary] = useState("");
  const [moreActionsMenu, setMoreActionsMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [editForm, setEditForm] = useState({
    productSummary: "",
    specification: "",
    material: "",
    process: "",
    sampleQuantity: "",
    samplePurpose: "CUSTOMER_TEST",
    deliveryDeadline: "",
    quoteId: "",
    fileAssetIds: [] as string[]
  });
  const [feeForm, setFeeForm] = useState<SampleFeeForm>(() => createEmptySampleFee());
  const [returnForm, setReturnForm] = useState({
    receiverName: "",
    destination: "",
    note: "",
    recordedAt: formatDateInput(new Date())
  });

  const samplesQuery = useQuery({ queryKey: ["samples", customerId], queryFn: () => getSamples<Sample[]>(customerId) });
  const quotesQuery = useQuery({ queryKey: ["quotes", customerId], queryFn: () => getQuotes<Quote[]>(customerId) });
  const historyQuery = useQuery({
    queryKey: ["samples", customerId, historySample?.id, "history"],
    queryFn: () => getSampleHistory<SampleHistoryItem[]>(historySample?.id ?? ""),
    enabled: Boolean(historyOpen && historySample?.id)
  });
  const detailSampleHistoryQuery = useQuery({
    queryKey: ["samples", customerId, detailSample?.id, "history"],
    queryFn: () => getSampleHistory<SampleHistoryItem[]>(detailSample?.id ?? ""),
    enabled: Boolean(detailOpen && detailMode === "sample" && detailSample?.id)
  });
  const detailQuoteId = detailSample?.quoteId ?? detailSample?.quote?.id ?? "";
  const detailQuoteHistoryQuery = useQuery({
    queryKey: ["quotes", customerId, detailQuoteId],
    queryFn: () => getQuoteHistory<QuoteHistoryItem[]>(detailQuoteId),
    enabled: Boolean(detailOpen && detailMode === "quote" && detailQuoteId)
  });

  const data = samplesQuery.data ?? [];
  const quoteOptions = quotesQuery.data ?? [];
  const exportAllMutation = useMutation({
    mutationFn: () => exportSamples(customerId),
    onSuccess: async ({ blob, fileName }) => {
      downloadBlob(blob, fileName ?? `samples-${customerId}.csv`);
      showClientToast({
        type: "success",
        title: "批量导出成功",
        message: "当前客户的样品表格已下载。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "批量导出失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });
  const currentEditingSample = editing ? data.find((item) => item.id === editing.id) ?? editing : null;
  const currentStatusSample = statusSample ? data.find((item) => item.id === statusSample.id) ?? statusSample : null;
  const currentSampleStatus = sampleTaskStatus(currentStatusSample);
  const selectedStatusAction = sampleStatusActions(currentSampleStatus)
    .find((action) => action.nextStatus === statusTarget) ?? (statusTarget ? { nextStatus: statusTarget, label: sampleStatusActionLabel(currentSampleStatus, statusTarget) } : null);
  const statusTransitions = selectedStatusAction ? [selectedStatusAction.nextStatus] : [];

  const refreshSamples = () => {
    queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
  };

  const create = useMutation({
    mutationFn: () => createSample(buildCreatePayload(customerId, createForm, createFeeForms)),
    onSuccess: () => {
      refreshSamples();
      setCreateForm({
        productSummary: "",
        specification: "",
        material: "",
        process: "",
        sampleQuantity: "",
        samplePurpose: "CUSTOMER_TEST",
        deliveryDeadline: "",
        quoteId: "",
        fileAssetIds: []
      });
      setCreateFeeOpen(false);
      setCreateFeeForms([]);
      setCreateValidationRequested(false);
      showClientToast({ type: "success", title: "新增样品成功", message: "样品申请已创建。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "新增样品失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const update = useMutation({
    mutationFn: () => updateSample(editing?.id ?? "", buildUpdatePayload(editForm)),
    onSuccess: () => {
      refreshSamples();
      setEditOpen(false);
      setEditing(null);
      setEditForm({
        productSummary: "",
        specification: "",
        material: "",
        process: "",
        sampleQuantity: "",
        samplePurpose: "CUSTOMER_TEST",
        deliveryDeadline: "",
        quoteId: "",
        fileAssetIds: []
      });
      showClientToast({ type: "success", title: "样品已更新", message: "样品信息已保存。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "更新样品失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { sampleId: string; roundId?: string; status: string; carrier?: string; trackingNo?: string; shippedAt?: string; deliveredAt?: string }) => {
      const roundId = payload.roundId ?? payload.sampleId;
      if (payload.status === "PENDING_APPROVAL") return submitSampleApproval(roundId);
      if (payload.status === "RETAINED") {
        const producedQuantity = Number(statusForm.producedQuantity);
        const retainedQuantity = Number(statusForm.retainedQuantity);
        if (!Number.isInteger(producedQuantity) || producedQuantity < 1 || !Number.isInteger(retainedQuantity) || retainedQuantity < 1 || retainedQuantity > producedQuantity || !statusForm.retainedLocation.trim()) throw new Error("请填写有效的完成数量、留样数量和留样位置。");
        return retainSampleRound(roundId, { producedQuantity, retainedQuantity, retainedLocation: statusForm.retainedLocation.trim() });
      }
      if (payload.status === "SHIPPED") {
        const producedQuantity = Number(currentStatusSample?.currentRound?.producedQuantity ?? currentStatusSample?.sampleQuantity ?? 0);
        const retainedQuantity = Number(currentStatusSample?.currentRound?.retentionRecord?.retainedQuantity ?? 0);
        const shippedQuantity = producedQuantity - retainedQuantity;
        if (shippedQuantity < 1) throw new Error("当前轮次没有可寄出的样品数量。");
        return shipSampleRound(roundId, { carrier: payload.carrier?.trim(), trackingNo: payload.trackingNo?.trim(), shippedQuantity, shippedAt: payload.shippedAt });
      }
      if (payload.status === "DELIVERED") return deliverSampleRound(roundId, { deliveredAt: payload.deliveredAt || undefined });
      if (payload.status === "FEEDBACK_RECEIVED") {
        if (!statusForm.feedback.trim()) throw new Error("请填写客户反馈。");
        return recordSampleFeedback(roundId, {
          feedbackResult: statusForm.feedbackResult,
          feedback: statusForm.feedback.trim(),
          dispositionStatus: statusForm.dispositionStatus
        });
      }
      if (payload.status === "RETURNED" || payload.status === "CUSTOMER_KEPT" || payload.status === "DISPOSED") {
        return recordSampleDisposition(roundId, payload.status, { ...returnForm, recordedAt: returnForm.recordedAt || undefined });
      }
      throw new Error(`不支持的样品动作 ${payload.status}`);
    },
    onSuccess: () => {
      refreshSamples();
      setStatusOpen(false);
      setStatusSample(null);
      setStatusTarget(null);
      setStatusRoundId(null);
      setStatusForm({ carrier: "", trackingNo: "", shippedAt: formatDateInput(new Date()), deliveredAt: "", producedQuantity: "", retainedQuantity: "", retainedLocation: "", feedback: "", feedbackResult: "ACCEPTED", dispositionStatus: "PENDING" });
      setReturnForm({ receiverName: "", destination: "", note: "", recordedAt: formatDateInput(new Date()) });
      showClientToast({ type: "success", title: "状态已更新", message: "样品状态已保存。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "更新状态失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const createResampleDraft = useMutation({
    mutationFn: () => createSampleResampleDraft<Sample>(resampleDraftSource?.currentRound?.id ?? "", {
      reason: resampleDraftReason.trim(),
      changeSummary: resampleDraftChangeSummary.trim() || undefined
    }),
    onSuccess: (created) => {
      refreshSamples();
      setResampleDraftOpen(false);
      setResampleDraftSource(null);
      setResampleDraftReason("");
      setResampleDraftChangeSummary("");
      showClientToast({ type: "success", title: "重打草稿已生成", message: "已复制上一轮数据，可继续编辑后提交审批。" });
      openEdit(created);
    },
    onError: (error) => {
      showClientToast({ type: "error", title: "生成重打草稿失败", message: error instanceof Error ? error.message : "操作失败" });
    }
  });

  const approve = useMutation({
    mutationFn: ({ sampleId, comment }: { sampleId: string; comment?: string }) =>
      approveSampleRound(approvalSample?.currentRound?.id ?? sampleId, { comment }),
    onSuccess: () => {
      refreshSamples();
      setApprovalOpen(false);
      setApprovalSample(null);
      setApprovalComment("");
      showClientToast({ type: "success", title: "审核成功", message: "样品已进入打样中。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "审核失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const reject = useMutation({
    mutationFn: ({ sampleId, comment }: { sampleId: string; comment?: string }) =>
      rejectSampleRound(approvalSample?.currentRound?.id ?? sampleId, { comment }),
    onSuccess: () => {
      refreshSamples();
      setApprovalOpen(false);
      setApprovalSample(null);
      setApprovalComment("");
      showClientToast({ type: "success", title: "驳回成功", message: "样品申请已标记为审批驳回。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "驳回失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const feeMutation = useMutation({
    mutationFn: () => {
      const payload = { ...feeForm, amount: toNumber(feeForm.amount), incurredAt: feeForm.incurredAt || undefined };
      if (feeMode === "edit" && feeEditing) {
        return updateSampleFee(feeEditing.sampleId, feeEditing.feeId, payload);
      }
      return recordSampleFee(feeSample?.id ?? "", payload);
    },
    onSuccess: () => {
      refreshSamples();
      setFeeOpen(false);
      setFeeMode("create");
      setFeeEditing(null);
      setFeeSample(null);
      setFeeForm(createEmptySampleFee());
      showClientToast({
        type: "success",
        title: feeMode === "edit" ? "费用已更新" : "费用已记录",
        message: feeMode === "edit" ? "样品费用已更新。" : "样品费用已写入台账。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "保存费用失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const feeDeleteMutation = useMutation({
    mutationFn: () => {
      if (!feeDeleting) {
        throw new Error("请先选择要删除的费用记录。");
      }
      return deleteSampleFee(feeDeleting.sampleId, feeDeleting.feeId);
    },
    onSuccess: () => {
      refreshSamples();
      setFeeDeleteOpen(false);
      setFeeDeleting(null);
      showClientToast({ type: "success", title: "费用已删除", message: "样品费用记录已移除。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "删除费用失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const remove = useMutation({
    mutationFn: () => deleteSample(editing?.id ?? ""),
    onSuccess: () => {
      refreshSamples();
      setDeleteOpen(false);
      setEditing(null);
      showClientToast({ type: "success", title: "样品已作废", message: "样品记录保留在历史中。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "作废样品失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const openEdit = (item: Sample) => {
    setEditing(item);
    setEditForm({
      productSummary: item.productSummary,
      specification: item.specification ?? "",
      material: item.material ?? "",
      process: item.process ?? "",
      sampleQuantity: String(item.sampleQuantity ?? ""),
      samplePurpose: item.samplePurpose || "CUSTOMER_TEST",
      deliveryDeadline: item.deliveryDeadline ? formatDateInput(new Date(item.deliveryDeadline)) : "",
      quoteId: item.quoteId ?? "",
      fileAssetIds: item.fileAssetIds ?? []
    });
    setEditOpen(true);
  };

  const openStatus = (item: Sample, nextStatus: string, roundId?: string) => {
    setStatusSample(item);
    setStatusTarget(nextStatus);
    setStatusRoundId(roundId ?? item.currentRound?.id ?? null);
     setStatusForm({
       carrier: item.currentRound?.carrier ?? "",
       trackingNo: item.currentRound?.trackingNo ?? "",
       shippedAt: item.currentRound?.shippedAt ? formatDateInput(new Date(item.currentRound.shippedAt)) : formatDateInput(new Date()),
       deliveredAt: item.currentRound?.deliveredAt ? formatDateInput(new Date(item.currentRound.deliveredAt)) : "",
       producedQuantity: String(item.currentRound?.producedQuantity ?? item.sampleQuantity ?? ""),
       retainedQuantity: String(item.currentRound?.retentionRecord?.retainedQuantity ?? ""),
       retainedLocation: item.currentRound?.retentionRecord?.retainedLocation ?? "",
       feedback: item.currentRound?.feedback ?? "",
       feedbackResult: (item.currentRound?.feedbackResult as SampleStatusForm["feedbackResult"] | undefined) ?? "ACCEPTED",
       dispositionStatus: (item.currentRound?.dispositionStatus as SampleStatusForm["dispositionStatus"] | undefined) ?? "PENDING"
     });
    setStatusOpen(true);
  };

  const openSampleDetail = (item: Sample) => {
    setDetailSample(item);
    setDetailRoundId(item.currentRound?.id ?? item.rounds?.at(-1)?.id ?? null);
    setDetailMode("sample");
    setDetailOpen(true);
  };

  const openQuoteDetail = (item: Sample) => {
    if (!item.quote) {
      return;
    }
    setDetailSample(item);
    setDetailMode("quote");
    setDetailOpen(true);
  };

  const openFee = (item: Sample) => {
    setFeeMode("create");
    setFeeEditing(null);
    setFeeSample(item);
    setFeeForm({
      feeType: "SAMPLE_MAKING",
      amount: "",
      currency: item.quote?.currency ?? "USD",
      note: "",
      incurredAt: formatDateInput(new Date()),
      sampleRoundId: item.currentRound?.id ?? "",
      costNature: "ACTUAL_COST",
      responsibility: "FACTORY",
      paymentStatus: "NOT_APPLICABLE"
    });
    setFeeOpen(true);
  };

  const openEditFee = (sample: Sample, fee: SampleFee) => {
    setFeeMode("edit");
    setFeeSample(sample);
    setFeeEditing({ sampleId: sample.id, feeId: fee.id });
    setFeeForm({
      feeType: fee.feeType,
      amount: String(fee.amount ?? ""),
      currency: fee.currency ?? "USD",
      note: fee.note ?? "",
      incurredAt: fee.incurredAt ? formatDateInput(new Date(fee.incurredAt)) : formatDateInput(new Date()),
      sampleRoundId: fee.sampleRoundId ?? "",
      costNature: fee.costNature === "CUSTOMER_CHARGE" ? "CUSTOMER_CHARGE" : "ACTUAL_COST",
      responsibility: (["FACTORY", "CUSTOMER", "SUPPLIER", "NEGOTIATED"].includes(fee.responsibility ?? "") ? fee.responsibility : "FACTORY") as SampleFeeForm["responsibility"],
      paymentStatus: (["NOT_APPLICABLE", "PENDING", "RECEIVED", "WAIVED", "REFUNDED"].includes(fee.paymentStatus ?? "") ? fee.paymentStatus : "NOT_APPLICABLE") as SampleFeeForm["paymentStatus"]
    });
    setFeeOpen(true);
  };

  const openDeleteFee = (sample: Sample, fee: SampleFee) => {
    setFeeDeleting({ sampleId: sample.id, feeId: fee.id, feeType: fee.feeType });
    setFeeDeleteOpen(true);
  };

  const openHistory = (item: Sample) => {
    setHistorySample(item);
    setHistoryOpen(true);
  };

  const openDelete = (item: Sample) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  const openApproval = (item: Sample, mode: "approve" | "reject") => {
    setApprovalSample(item);
    setApprovalMode(mode);
    setApprovalComment(item.currentRound?.approvalComment ?? "");
    setApprovalOpen(true);
  };

  const openResampleDraft = (item: Sample) => {
    setResampleDraftSource(item);
    setResampleDraftReason(item.currentRound?.feedback ?? "");
    setResampleDraftChangeSummary("");
    setResampleDraftOpen(true);
  };

  const closeApproval = () => {
    setApprovalOpen(false);
    setApprovalSample(null);
    setApprovalComment("");
  };

  const canEdit = (item: Sample) => Boolean(item.currentRoundId) && ["DRAFT", "APPROVAL_REJECTED"].includes(sampleTaskStatus(item));
  const canDelete = (item: Sample) => Boolean(item.currentRoundId) && !["SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED", "COMPLETED", "VOIDED", "PASSED", "TERMINATED"].includes(sampleTaskStatus(item));
  const currentHistory = historyQuery.data ?? [];
  const createMessage = createSampleValidationKey(createForm);
  const createFeeMessage = createFeeValidationKey(createFeeForms);
  const createReady = !createMessage && !createFeeMessage;
  const visibleCreateMessage = createValidationRequested ? createMessage || createFeeMessage : null;
  const approvalDialogTitle = approvalMode === "approve" ? "审核通过" : "审核驳回";
  const approvalDialogConfirmLabel = approvalMode === "approve" ? "通过" : "驳回";
  const approvalDialogDescription =
    approvalMode === "approve" ? "备注可留空；填写后保留审核依据。" : "备注可留空；填写后说明需要补充或修改的内容。";
  const approvalPending = approvalMode === "approve" ? approve.isPending : reject.isPending;
  const currentStatus = sampleTaskStatus(currentStatusSample);
  const detailQuote = detailSample?.quoteId ? quoteOptions.find((quote) => quote.id === detailSample.quoteId) ?? null : null;
  const detailQuoteSource = detailQuote ?? detailSample?.quote ?? null;
  const detailQuoteStatus = quoteDisplayStatus(detailQuoteSource);
  const detailQuoteTerminalStatus = QUOTE_TERMINAL_STATUSES.includes(detailQuoteStatus) ? detailQuoteStatus : "";
  const detailQuoteHistory = detailQuoteHistoryQuery.data ?? [];
  const detailQuoteSentAt = quoteHistoryStatusTime(detailQuoteHistory, "SENT");
  const detailQuoteTerminalAt = detailQuoteTerminalStatus ? quoteHistoryStatusTime(detailQuoteHistory, detailQuoteTerminalStatus) : "";
  const detailQuoteHistoryLoadingValue = detailQuoteHistoryQuery.isLoading ? "加载中..." : "";
  const detailQuoteApprovalNote = detailQuote?.approvalComment?.trim() ? `审批备注：${detailQuote.approvalComment.trim()}` : "";
  const detailQuoteTimelineItems = [
    {
      label: quoteStatusLabel("DRAFT", locale),
      value: detailQuote?.createdAt ? new Date(detailQuote.createdAt).toLocaleString() : "-",
      done: Boolean(detailQuoteSource),
      current: detailQuoteStatus === "DRAFT",
      danger: false
    },
    {
      label: quoteStatusLabel("PENDING_APPROVAL", locale),
      value: detailQuote?.approvalSubmittedAt ? new Date(detailQuote.approvalSubmittedAt).toLocaleString() : detailQuoteStatus === "PENDING_APPROVAL" ? "当前状态" : "未提交",
      done: quoteCoreStatusReached(detailQuoteStatus, "PENDING_APPROVAL"),
      current: detailQuoteStatus === "PENDING_APPROVAL",
      danger: false
    },
    ...(detailQuoteStatus === "REJECTED"
      ? [
          {
            label: quoteStatusLabel("REJECTED", locale),
            value: detailQuote?.approvalReviewedAt ? new Date(detailQuote.approvalReviewedAt).toLocaleString() : quoteTimelineDateValue(quoteHistoryStatusTime(detailQuoteHistory, "REJECTED")) || detailQuoteHistoryLoadingValue || quoteStatusLabel("REJECTED", locale),
            done: true,
            current: true,
            danger: true,
            note: detailQuoteApprovalNote
          }
        ]
      : []),
    {
      label: quoteStatusLabel("APPROVED", locale),
      value: detailQuote?.approvalReviewedAt ? new Date(detailQuote.approvalReviewedAt).toLocaleString() : quoteCoreStatusReached(detailQuoteStatus, "APPROVED") ? "已审批" : "未审批",
      done: quoteCoreStatusReached(detailQuoteStatus, "APPROVED"),
      current: detailQuoteStatus === "APPROVED",
      danger: false,
      note: quoteCoreStatusReached(detailQuoteStatus, "APPROVED") ? detailQuoteApprovalNote : ""
    },
    {
      label: quoteStatusLabel("SENT", locale),
      value: quoteCoreStatusReached(detailQuoteStatus, "SENT") ? quoteTimelineDateValue(detailQuoteSentAt) || detailQuoteHistoryLoadingValue || quoteStatusLabel("SENT", locale) : "未发送",
      done: quoteCoreStatusReached(detailQuoteStatus, "SENT"),
      current: detailQuoteStatus === "SENT",
      danger: false
    },
    ...(detailQuoteTerminalStatus && detailQuoteTerminalStatus !== "REJECTED"
      ? [
          {
            label: quoteStatusLabel(detailQuoteTerminalStatus, locale),
            value: quoteTimelineDateValue(detailQuoteTerminalAt) || detailQuoteHistoryLoadingValue || quoteStatusLabel(detailQuoteTerminalStatus, locale),
            done: true,
            current: true,
            danger: ["CUSTOMER_REJECTED", "REJECTED"].includes(detailQuoteTerminalStatus)
          }
        ]
      : [])
  ];
  const detailQuoteSummary = detailQuoteSource
    ? [
        detailQuoteSource.productName ? `产品 ${detailQuoteSource.productName}` : "未命名产品",
        detailQuoteSource.amount ? `金额 ${quoteDetailMoney(detailQuoteSource, detailQuoteSource.amount)}` : "",
        detailQuote?.unitPrice ? `单价 ${quoteDetailMoney(detailQuote, detailQuote.unitPrice)}` : "",
        detailQuote?.quantity ? `数量 ${detailQuote.quantity}` : ""
      ].filter(Boolean).join(" | ")
    : "";
  const detailQuoteBaseItems = [
    { label: "产品名称", value: detailValue(detailQuoteSource?.productName || "未命名产品"), highlight: true },
    { label: "规格", value: detailValue(detailQuote?.specification) },
    { label: "MOQ", value: detailValue(detailQuote?.moq) },
    { label: "数量", value: detailValue(detailQuote?.quantity) },
    { label: "有效期", value: detailQuote?.validUntil ? new Date(detailQuote.validUntil).toLocaleDateString() : "-" },
    { label: "更新时间", value: detailQuote?.updatedAt ? new Date(detailQuote.updatedAt).toLocaleString() : "-" }
  ];
  const detailQuoteAmountItems = [
    { label: "报价金额", value: quoteDetailMoney(detailQuoteSource, detailQuoteSource?.amount), highlight: true },
    { label: "单价", value: quoteDetailMoney(detailQuote, detailQuote?.unitPrice), highlight: true },
    { label: "物料价", value: quoteDetailMoney(detailQuote, detailQuote?.materialCost) },
    { label: "加工费", value: quoteDetailMoney(detailQuote, detailQuote?.processingCost) },
    { label: "税费", value: quoteDetailMoney(detailQuote, detailQuote?.taxCost) },
    { label: "运费", value: quoteDetailMoney(detailQuote, detailQuote?.shippingCost) },
    { label: "优惠金额", value: quoteDetailMoney(detailQuote, detailQuote?.discountAmount) },
    { label: "报价模式", value: detailQuote?.calcMode === "formula" ? "公式报价" : detailQuote ? "直接报价" : "-" },
    { label: "创建时间", value: detailQuote?.createdAt ? new Date(detailQuote.createdAt).toLocaleString() : "-" }
  ];
  const detailSampleFeeTotal = detailSample ? sampleCostLabel(detailSample) : "-";
  const sampleDetailRound = detailSample?.rounds?.find((round) => round.id === detailRoundId) ?? detailSample?.currentRound ?? null;
  const sampleDetailStatus = sampleDetailRound?.status ?? "";
  const sampleDetailHistory = detailSampleHistoryQuery.data ?? [];
  const sampleDetailRejectedAt = sampleHistoryStatusTime(sampleDetailHistory, "APPROVAL_REJECTED");
  const sampleDetailHistoryLoadingValue = detailSampleHistoryQuery.isLoading ? "加载中..." : "";
  const sampleDetailApprovalNote = sampleDetailRound?.approvalComment?.trim() ? `审批备注：${sampleDetailRound.approvalComment.trim()}` : "";
  const sampleDetailSummary = detailSample
    ? [
        `费用 ${detailSampleFeeTotal}`,
        sampleDetailRound?.specification ? `规格 ${sampleDetailRound.specification}` : "",
        sampleDetailRound?.trackingNo ? `运单 ${sampleDetailRound.trackingNo}` : "未填运单",
        sampleDetailRound?.carrier ? `物流 ${sampleDetailRound.carrier}` : "未发货"
      ].filter(Boolean).join(" | ")
    : "";
  const sampleDetailBaseItems = [
    { label: "当前轮次", value: detailSample?.currentRound ? `R${detailSample.currentRound.roundNo}` : "-", highlight: true },
    { label: "当前动作", value: detailValue(detailSample?.currentAction) },
    { label: "上一轮结论", value: detailSample?.previousRound ? `${feedbackResultLabel(detailSample.previousRound.feedbackResult)} · ${dispositionLabel(detailSample.previousRound.dispositionStatus)}` : "-" },
    { label: "关联报价", value: detailValue(detailSample?.quote?.quoteNo ?? detailSample?.quoteId ?? "未关联"), highlight: true },
    { label: "规格", value: detailValue(sampleDetailRound?.specification) },
    { label: "样品用途", value: detailValue(detailSample ? samplePurposeLabel(detailSample.samplePurpose) : "") },
    { label: "材质", value: detailValue(sampleDetailRound?.material) },
    { label: "工艺", value: detailValue(sampleDetailRound?.process) },
    { label: "样品数量", value: detailValue(sampleDetailRound?.requestedQuantity) },
    { label: "交付期限", value: sampleDetailRound?.deliveryDeadline ? new Date(sampleDetailRound.deliveryDeadline).toLocaleDateString() : "-" },
    { label: "费用合计", value: detailSampleFeeTotal, highlight: true }
  ];
  const sampleDetailCostItems = (detailSample?.costSummary?.byCurrency ?? []).flatMap((item) => [
    { label: `${item.currency} 累计实际成本`, value: formatMoney(item.totalActualCost, item.currency), highlight: true },
    { label: `${item.currency} 客户收费`, value: formatMoney(item.customerCharge, item.currency) },
    { label: `${item.currency} 已收金额`, value: formatMoney(item.receivedAmount, item.currency) },
    { label: `${item.currency} 企业承担`, value: formatMoney(item.companyBorneAmount, item.currency) }
  ]);
  const sampleDetailTimelineItems = [
    {
      label: "申请",
      value: sampleDetailRound?.createdAt ? new Date(sampleDetailRound.createdAt).toLocaleString() : detailSample?.createdAt ? new Date(detailSample.createdAt).toLocaleString() : "-",
      done: sampleCoreStatusReached(sampleDetailStatus, "DRAFT"),
      current: sampleDetailStatus === "DRAFT"
    },
    {
      label: sampleCoreStatusReached(sampleDetailStatus, "PREPARING") ? "已审核" : statusLabel("PENDING_APPROVAL"),
      value: sampleDetailRound?.approvedAt ? new Date(sampleDetailRound.approvedAt).toLocaleString() : sampleDetailStatus === "PENDING_APPROVAL" ? "当前状态" : sampleDetailStatus === "APPROVAL_REJECTED" ? "已驳回" : "未审核",
      done: sampleCoreStatusReached(sampleDetailStatus, "PREPARING"),
      current: sampleDetailStatus === "PENDING_APPROVAL",
      note: sampleCoreStatusReached(sampleDetailStatus, "PREPARING") ? sampleDetailApprovalNote : ""
    },
    ...(sampleDetailStatus === "APPROVAL_REJECTED"
      ? [
          {
            label: statusLabel("APPROVAL_REJECTED"),
            value: sampleDetailRejectedAt ? new Date(sampleDetailRejectedAt).toLocaleString() : sampleDetailHistoryLoadingValue || statusLabel("APPROVAL_REJECTED"),
            done: true,
            current: true,
            danger: true,
            note: sampleDetailApprovalNote
          }
        ]
      : []),
    {
      label: statusLabel("PREPARING"),
      value: sampleCoreStatusReached(sampleDetailStatus, "PREPARING") ? "已进入打样" : "未打样",
      done: sampleCoreStatusReached(sampleDetailStatus, "PREPARING"),
      current: sampleDetailStatus === "PREPARING"
    },
    {
      label: "我方留样",
      value: sampleDetailRound?.retentionRecord ? `${sampleDetailRound.retentionRecord.retainedQuantity} 件 · ${sampleDetailRound.retentionRecord.retainedLocation}` : sampleCoreStatusReached(sampleDetailStatus, "RETAINED") ? "已完成留样" : "未留样",
      done: sampleCoreStatusReached(sampleDetailStatus, "RETAINED"),
      current: sampleDetailStatus === "RETAINED"
    },
    {
      label: statusLabel("SHIPPED"),
      value: sampleDetailRound?.shippedAt ? new Date(sampleDetailRound.shippedAt).toLocaleDateString() : sampleCoreStatusReached(sampleDetailStatus, "SHIPPED") ? "已发货" : "未发货",
      done: sampleCoreStatusReached(sampleDetailStatus, "SHIPPED"),
      current: sampleDetailStatus === "SHIPPED"
    },
    {
      label: statusLabel("DELIVERED"),
      value: sampleDetailRound?.deliveredAt ? new Date(sampleDetailRound.deliveredAt).toLocaleDateString() : sampleCoreStatusReached(sampleDetailStatus, "DELIVERED") ? "已签收" : "未签收",
      done: sampleCoreStatusReached(sampleDetailStatus, "DELIVERED"),
      current: sampleDetailStatus === "DELIVERED"
    },
    ...(["FEEDBACK_RECEIVED", "COMPLETED"].includes(sampleDetailStatus)
      ? [
          {
            label: "客户反馈结论",
            value: feedbackResultLabel(sampleDetailRound?.feedbackResult),
            done: true,
            current: true,
            danger: sampleDetailRound?.feedbackResult === "CUSTOMER_REJECTED",
            note: sampleDetailRound?.feedback ?? ""
          }
        ]
      : []),
    ...(sampleDetailStatus === "VOIDED"
      ? [{ label: statusLabel("VOIDED"), value: sampleDetailRound?.voidedAt ? new Date(sampleDetailRound.voidedAt).toLocaleString() : "已作废", done: true, current: true, danger: true }]
      : [])
  ];
  const hasDetailQuote = Boolean(detailQuote ?? detailSample?.quote);

  const handleCreateSample = () => {
    setCreateValidationRequested(true);
    if (!createReady) {
      return;
    }
    create.mutate();
  };

  return (
    <>
    <section className="panel sample-records-panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>{t("sampleFields.sampleRecordsTitle")}</h2>
          <span>{t("sampleFields.sampleCount").replace("{count}", String(data.length))}</span>
        </div>
        <button
          className="secondary-button"
          disabled={data.length === 0 || exportAllMutation.isPending}
          onClick={() => exportAllMutation.mutate()}
          type="button"
        >
          <Download size={14} />
          {exportAllMutation.isPending ? t("sampleFields.exporting") : t("sampleFields.batchExport")}
        </button>
      </div>

      {samplesQuery.isLoading ? (
        <div className="empty-state">{t("common.loading")}</div>
      ) : samplesQuery.isError ? (
        <div className="error-state">样品记录加载失败，请稍后重试。</div>
      ) : data.length === 0 ? (
        <div className="empty-state">{t("common.noData")}</div>
      ) : (
        <div className="sample-record-table-wrap">
          <table className="sample-record-table">
            <thead>
              <tr>
                <th>{t("sampleFields.sampleProduct")}</th>
                <th>{t("sampleFields.specification")}</th>
                <th>{t("sampleFields.material")}</th>
                <th>{t("sampleFields.process")}</th>
                <th>{t("sampleFields.samplePurpose")}</th>
                <th>{t("sampleFields.sampleQuantity")}</th>
                <th>{t("sampleFields.fee")}</th>
                <th>{t("sampleFields.relatedQuote")}</th>
                <th>{t("sampleFields.carrier")}</th>
                <th>{t("sampleFields.trackingNo")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.createdAt")}</th>
                <th>{t("common.operation")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const feeTotal = sampleCostLabel(item);
                const itemStatus = sampleTaskStatus(item);
                const nextActions = sampleStatusActions(itemStatus);
                const canCreateResampleDraft = Boolean(item.currentRoundId)
                  && item.currentRound?.feedbackResult === "RESAMPLE_REQUIRED"
                  && itemStatus === "FEEDBACK_RECEIVED"
                  && !(item.rounds ?? []).some((round) => round.previousRoundId === item.currentRound?.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <button className="table-link sample-record-link" onClick={() => openSampleDetail(item)} type="button">
                        {item.productSummary}
                      </button>
                    </td>
                    <td>{item.specification || "未填写"}</td>
                    <td>{item.material || "未填写"}</td>
                    <td>{item.process || "未填写"}</td>
                    <td>{item.samplePurpose ? samplePurposeLabel(item.samplePurpose) : "未填写"}</td>
                    <td>{item.sampleQuantity ?? "-"}</td>
                    <td>{feeTotal}</td>
                    <td>
                      {item.quote ? (
                        <button className="table-link sample-record-link" onClick={() => openQuoteDetail(item)} type="button">
                          {item.quote.quoteNo}
                        </button>
                      ) : "未关联"}
                    </td>
                    <td>{item.currentRound?.carrier || "未填写"}</td>
                    <td>{item.currentRound?.trackingNo || "未填写"}</td>
                    <td>
                      <span className={sampleStatusPillClass(itemStatus)}>
                        {localizedSampleStatusLabel(itemStatus, t)}
                      </span>
                    </td>
                    <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="sample-record-actions">
                        <EditIconButton disabled={!canEdit(item)} onClick={() => openEdit(item)} />
                        <div className="sample-record-more">
                          <button
                            aria-expanded={moreActionsMenu?.id === item.id}
                            className="secondary-button icon-button"
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setMoreActionsMenu((current) => current?.id === item.id ? null : {
                                id: item.id,
                                top: rect.bottom + 6,
                                right: window.innerWidth - rect.right
                              });
                            }}
                            title="更多"
                            type="button"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {moreActionsMenu?.id === item.id ? createPortal(
                            <div className="sample-record-more-layer" onMouseDown={() => setMoreActionsMenu(null)}>
                            <div
                              className="sample-record-more-menu"
                              onMouseDown={(event) => event.stopPropagation()}
                              style={{ top: moreActionsMenu.top, right: moreActionsMenu.right }}
                            >
                              <button
                                onClick={() => {
                                  setMoreActionsMenu(null);
                                  openHistory(item);
                                }}
                                type="button"
                              >
                                <History size={14} />
                                <span>历史记录</span>
                              </button>
                              {itemStatus === "PENDING_APPROVAL" ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setMoreActionsMenu(null);
                                      openApproval(item, "approve");
                                    }}
                                    type="button"
                                  >
                                    <CheckCircle2 size={14} />
                                    <span>审核通过</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setMoreActionsMenu(null);
                                      openApproval(item, "reject");
                                    }}
                                    type="button"
                                  >
                                    <XCircle size={14} />
                                    <span>审核驳回</span>
                                  </button>
                                </>
                              ) : null}
                              {canCreateResampleDraft ? (
                                <button
                                  onClick={() => {
                                    setMoreActionsMenu(null);
                                    openResampleDraft(item);
                                  }}
                                  type="button"
                                >
                                  <CopyPlus size={14} />
                                  <span>生成重打草稿</span>
                                </button>
                              ) : null}
                              {nextActions.map((action) => (
                                <button
                                  key={action.nextStatus}
                                  onClick={() => {
                                    setMoreActionsMenu(null);
                                    openStatus(item, action.nextStatus);
                                  }}
                                  type="button"
                                >
                                  {action.nextStatus === "SHIPPED" ? <Send size={14} /> : <ChevronDown size={14} />}
                                  <span>{action.label}</span>
                                </button>
                              ))}
                            </div>
                            </div>,
                            document.body
                          ) : null}
                        </div>
                        <DeleteIconButton disabled={!canDelete(item)} onClick={() => openDelete(item)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section className="panel sample-create-panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>{t("sampleFields.newSampleTitle")}</h2>
          <span>{t("sampleFields.newSampleDescription")}</span>
        </div>
      </div>
      <div className="analysis-edit-form">
        <div className="form-grid compact-form sample-create-grid">
        <Field label={t("sampleFields.sampleProduct")} value={createForm.productSummary} onChange={(value) => setCreateForm({ ...createForm, productSummary: value })} />
        <Field label={t("sampleFields.specification")} value={createForm.specification} onChange={(value) => setCreateForm({ ...createForm, specification: value })} />
        <Field label={t("sampleFields.material")} value={createForm.material} onChange={(value) => setCreateForm({ ...createForm, material: value })} />
        <Field label={t("sampleFields.process")} value={createForm.process} onChange={(value) => setCreateForm({ ...createForm, process: value })} />
        <label>
          <span>{t("sampleFields.sampleQuantity")}</span>
          <input type="number" min={1} value={createForm.sampleQuantity} onChange={(e) => setCreateForm({ ...createForm, sampleQuantity: e.target.value })} />
        </label>
        <label>
          <span>{t("sampleFields.samplePurpose")}</span>
          <AppSelect
            className="sample-light-select"
            popupClassName="sample-light-select-popup"
            value={createForm.samplePurpose}
            onChange={(v) => setCreateForm({ ...createForm, samplePurpose: v })}
            options={SAMPLE_PURPOSES.map((item) => ({ value: item.value, label: item.label }))}
          />
        </label>
        <label>
          <span>{t("sampleFields.deliveryDeadlineOptional")}</span>
          <LocalizedDateInput value={createForm.deliveryDeadline} onChange={(value) => setCreateForm({ ...createForm, deliveryDeadline: value })} />
        </label>
        <label>
          <span>{t("sampleFields.relatedQuote")}</span>
          <AppSelect
            className="sample-light-select"
            popupClassName="sample-light-select-popup"
            value={createForm.quoteId}
            onChange={(v) => setCreateForm({ ...createForm, quoteId: v })}
            options={[{ value: "", label: t("sampleFields.noRelatedQuote") }, ...quoteOptions.map((quote) => ({ value: quote.id, label: `${quote.quoteNo} · ${quote.productName}` }))]}
            placeholder={t("sampleFields.noRelatedQuote")}
          />
        </label>
        <div className="wide-field sample-upload-field">
          <span>{t("sampleFields.attachments")}</span>
          <FileUpload
            entityType="sample-request"
            fileIds={createForm.fileAssetIds}
            multiple
            accept="*/*"
            onChange={(ids) => setCreateForm({ ...createForm, fileAssetIds: ids })}
          />
        </div>
        <div className="wide-field toolbar">
          <button className="secondary-button" onClick={() => setCreateFeeOpen(true)} type="button">
            {t("sampleFields.fillFees")}
          </button>
          <div className="empty-state" style={{ flex: 1, margin: 0 }}>
            {createFeeMessage ? t("sampleFields.feeMissing") : t("sampleFields.feeFilled").replace("{count}", String(createFeeForms.length))}
          </div>
        </div>
        {visibleCreateMessage ? <div className="error-state wide-field">{t(visibleCreateMessage)}</div> : null}
        <div className="wide-field">
          <AddIconButton disabled={create.isPending} label={create.isPending ? t("quoteFields.submitting") : t("sampleFields.addSample")} onClick={handleCreateSample} />
        </div>
        </div>
      </div>
    </section>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title={t("sampleFields.fillFees")}
        visible={createFeeOpen}
        onClose={() => setCreateFeeOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setCreateFeeOpen(false)} type="button">
              {t("common.cancel")}
            </button>
            <button
              className="primary-button"
              disabled={Boolean(createFeeMessage)}
              onClick={() => setCreateFeeOpen(false)}
              type="button"
            >
              {t("common.save")}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form sample-fee-dialog">
          <div className="sample-fee-dialog__summary">
            <div>
              <strong>{t("sampleFields.feeFilled").replace("{count}", String(createFeeForms.length))}</strong>
              <span>{t("sampleFields.feeRecordInstructions")}</span>
            </div>
            <button
              className="secondary-button"
              onClick={() => setCreateFeeForms([...createFeeForms, createEmptySampleFee()])}
              type="button"
            >
              {t("sampleFields.addFee")}
            </button>
          </div>
          <div className="analysis-edit-gap-list">
            {!createFeeForms.length ? (
              <div className="empty-state">
                {t("sampleFields.noFeeRecordInstructions")}
              </div>
            ) : null}
            {createFeeForms.map((feeItem, index) => (
              <div className="analysis-edit-gap sample-fee-card" key={`${index}-${feeItem.incurredAt}`}>
                <div className="sample-fee-card__header">
                  <strong>{t("sampleFields.feeItem").replace("{index}", String(index + 1))}</strong>
                  <button
                    className="secondary-button"
                    onClick={() => setCreateFeeForms(createFeeForms.filter((_, currentIndex) => currentIndex !== index))}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
                <div className="sample-fee-card__fields">
                  <div className="form-field">
                    <label>{t("sampleFields.feeType")}</label>
                    <select value={feeItem.feeType} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, feeType: e.target.value } : item))}>
                      {FEE_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t("common.amount")}</label>
                    <input type="number" min={0} value={feeItem.amount} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, amount: e.target.value } : item))} />
                  </div>
                  <div className="form-field">
                    <label>{t("quoteFields.currency")}</label>
                    <input value={feeItem.currency} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, currency: e.target.value } : item))} />
                  </div>
                  <div className="form-field">
                    <label>{t("sampleFields.incurredAt")}</label>
                    <LocalizedDateInput value={feeItem.incurredAt} onChange={(value) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, incurredAt: value } : item))} />
                  </div>
                  <div className="form-field">
                    <label>{t("sampleFields.costNature")}</label>
                    <select value={feeItem.costNature} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, costNature: e.target.value as SampleFeeForm["costNature"], paymentStatus: e.target.value === "CUSTOMER_CHARGE" && item.paymentStatus === "NOT_APPLICABLE" ? "PENDING" : item.paymentStatus } : item))}>
                      {COST_NATURES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t("sampleFields.responsibility")}</label>
                    <select value={feeItem.responsibility} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, responsibility: e.target.value as SampleFeeForm["responsibility"] } : item))}>
                      {FEE_RESPONSIBILITIES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t("sampleFields.paymentStatus")}</label>
                    <select value={feeItem.paymentStatus} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, paymentStatus: e.target.value as SampleFeeForm["paymentStatus"] } : item))}>
                      {PAYMENT_STATUSES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-field wide-field sample-fee-card__note">
                  <label>{t("common.notes")}</label>
                  <textarea value={feeItem.note} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, note: e.target.value } : item))} rows={2} />
                </div>
              </div>
            ))}
            {createFeeMessage ? <div className="error-state">{createFeeMessage}</div> : null}
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title="生成重打草稿"
        visible={resampleDraftOpen}
        onClose={() => {
          setResampleDraftOpen(false);
          setResampleDraftSource(null);
          setResampleDraftReason("");
          setResampleDraftChangeSummary("");
        }}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setResampleDraftOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={createResampleDraft.isPending || !resampleDraftReason.trim()} onClick={() => createResampleDraft.mutate()} type="button">
              <CopyPlus size={14} />
              {createResampleDraft.isPending ? "生成中..." : "生成草稿"}
            </button>
          </div>
        )}
      >
        <div className="form-grid compact-form">
          <div className="form-field wide-field">
            <label>来源轮次</label>
            <input readOnly value={resampleDraftSource?.currentRound ? `R${resampleDraftSource.currentRound.roundNo} · ${resampleDraftSource.productSummary}` : ""} />
          </div>
          <div className="form-field wide-field">
            <label>重打原因</label>
            <textarea autoFocus rows={4} value={resampleDraftReason} onChange={(event) => setResampleDraftReason(event.target.value)} />
          </div>
          <div className="form-field wide-field">
            <label>调整说明</label>
            <textarea rows={3} value={resampleDraftChangeSummary} onChange={(event) => setResampleDraftChangeSummary(event.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className={`crm-action-dialog sample-dialog ${detailMode === "sample" ? "sample-detail-dialog" : "quote-detail-dialog"}`}
        title={detailMode === "sample" ? `样品详情 · ${detailSample?.productSummary ?? ""}` : `报价详情 · ${detailQuote?.quoteNo ?? detailSample?.quote?.quoteNo ?? ""}`}
        width="min(1040px, calc(100vw - 48px))"
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDetailOpen(false)} type="button">
              关闭
            </button>
          </div>
        }
      >
        {detailMode === "sample" ? (
          <div className="detail-window sample-detail-window">
            <section className="sample-detail-summary">
              <div>
                <p className="detail-eyebrow">样品申请</p>
                <h3>{detailValue(detailSample?.productSummary)}</h3>
                <p>{sampleDetailSummary}</p>
              </div>
              <div className="sample-detail-summary__actions">
                <span className={sampleStatusPillClass(sampleTaskStatus(detailSample))}>{detailSample ? statusLabel(sampleTaskStatus(detailSample)) : "-"}</span>
                <button className="secondary-button" disabled={!hasDetailQuote} onClick={() => setDetailMode("quote")} type="button">
                  查看报价
                </button>
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>打样轮次</h4>
                <span>{detailSample?.rounds?.length ? `共 ${detailSample.rounds.length} 轮` : "暂无轮次"}</span>
              </div>
              <div className="quote-revision-chain">
                {(detailSample?.rounds ?? []).map((round) => {
                  const cost = detailSample?.costSummary?.byRound.find((item) => item.roundId === round.id)?.currencies
                    .map((item) => `${item.currency} ${item.totalActualCost.toFixed(2)}`).join(" / ") || "暂无费用";
                  return (
                    <button className={round.id === sampleDetailRound?.id ? "quote-revision-chain__item is-current" : "quote-revision-chain__item"} key={round.id} onClick={() => setDetailRoundId(round.id)} type="button">
                      <span className="quote-revision-chain__identity">
                        <strong>R{round.roundNo}</strong>
                        <span>{round.resampleReason || (round.roundNo === 1 ? "首轮样品" : "重打草稿")}</span>
                      </span>
                      <span className="quote-revision-chain__meta">
                        <span className={sampleStatusPillClass(round.status)}>{statusLabel(round.status)}</span>
                        <strong>{cost}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>费用统计</h4>
                <span>按币种分别汇总</span>
              </div>
              {sampleDetailCostItems.length ? (
                <div className="detail-grid sample-detail-grid sample-detail-cost-grid">
                  {sampleDetailCostItems.map((item) => (
                    <div className={item.highlight ? "detail-card sample-detail-card is-highlight" : "detail-card sample-detail-card"} key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-state">暂无费用统计。</div>}
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>基础信息</h4>
                <span>样品、报价、用途和费用摘要</span>
              </div>
              <div className="detail-grid sample-detail-grid">
                {sampleDetailBaseItems.map((item) => (
                  <div className={item.highlight ? "detail-card sample-detail-card is-highlight" : "detail-card sample-detail-card"} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>样品状态</h4>
                <span>从申请到签收的关键节点</span>
              </div>
              <div className="sample-detail-timeline">
                {sampleDetailTimelineItems.map((item) => (
                  <div className={["sample-detail-timeline__item", item.done ? "is-done" : "", item.current ? "is-current" : "", item.danger ? "is-danger" : ""].filter(Boolean).join(" ")} key={item.label}>
                    <span aria-hidden="true" />
                    <strong>{item.label}</strong>
                    <small>{item.value}</small>
                    {item.note ? <em>{item.note}</em> : null}
                  </div>
                ))}
              </div>
              <div className="sample-detail-logistics">
                <div>
                  <span>物流商</span>
                  <strong>{detailValue(sampleDetailRound?.carrier)}</strong>
                </div>
                <div>
                  <span>运单号</span>
                  <strong>{detailValue(sampleDetailRound?.trackingNo)}</strong>
                </div>
                <div>
                  <span>更新时间</span>
                  <strong>{detailSample?.updatedAt ? new Date(detailSample.updatedAt).toLocaleString() : "-"}</strong>
                </div>
              </div>
            </section>

            <section className="sample-detail-split">
              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>费用明细</h4>
                  <span>{detailSample?.fees?.length ? `共 ${detailSample.fees.length} 条` : "暂无费用记录"}</span>
                </div>
                {detailSample?.fees?.length ? (
                  <div className="detail-list sample-detail-list">
                    {detailSample.fees.map((fee) => (
                      <div className="detail-list-item" key={fee.id}>
                        <strong>{feeTypeLabel(fee.feeType, t)} · {formatMoney(Number(fee.amount), fee.currency)} · {sampleRoundLabel(detailSample, fee.sampleRoundId)}</strong>
                        <span>{costNatureLabel(fee.costNature, t)} · {responsibilityLabel(fee.responsibility, t)} · {paymentStatusLabel(fee.paymentStatus, t)} · {new Date(fee.incurredAt).toLocaleDateString(locale)} {fee.note ? `· ${fee.note}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">暂无费用记录。</div>
                )}
              </div>

              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>客户样品处置记录</h4>
                  <span>{detailSample?.returnRecords?.length ? `共 ${detailSample.returnRecords.length} 条` : "暂无客户处置记录"}</span>
                </div>
                {detailSample?.returnRecords?.length ? (
                  <div className="detail-list sample-detail-list">
                    {detailSample.returnRecords.map((record) => (
                      <div className="detail-list-item" key={record.id}>
                        <strong>{dispositionLabel(record.dispositionStatus)} · {new Date(record.recordedAt).toLocaleDateString()}</strong>
                        <span>{record.receiverName ? `接收人 ${record.receiverName}` : ""}{record.destination ? ` · 去向 ${record.destination}` : ""}{record.note ? ` · ${record.note}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">暂无客户处置记录。</div>
                )}
              </div>
            </section>

            <section className="sample-detail-split">
              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>反馈说明</h4>
                  <span>客户测试反馈或内部备注</span>
                </div>
                <div className="detail-note">{detailValue(sampleDetailRound?.feedback)}</div>
              </div>

              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>附件</h4>
                  <span>{detailValue(detailSample?.fileAssetIds?.length ?? 0)} 个文件</span>
                </div>
                <FileUpload
                  entityId={detailSample?.id}
                  entityType="sample-request"
                  fileIds={detailSample?.fileAssetIds ?? []}
                  multiple
                  onChange={() => {}}
                  readOnly
                />
              </div>
            </section>
          </div>
        ) : (
          <div className="detail-window sample-detail-window quote-detail-window">
            <section className="sample-detail-summary quote-detail-summary">
              <div>
                <p className="detail-eyebrow">关联报价</p>
                <h3>{detailValue(detailQuote?.quoteNo ?? detailSample?.quote?.quoteNo)}</h3>
                <p>{detailQuoteSummary}</p>
              </div>
              <div className="sample-detail-summary__actions">
                <span className={quoteStatusPillClass(detailQuoteStatus)}>{quoteStatusLabel(detailQuoteStatus, locale)}</span>
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>基础信息</h4>
                <span>产品、状态、数量和审批时间</span>
              </div>
              <div className="detail-grid sample-detail-grid">
                {detailQuoteBaseItems.map((item) => (
                  <div className={item.highlight ? "detail-card sample-detail-card is-highlight" : "detail-card sample-detail-card"} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>金额构成</h4>
                <span>报价、成本、运费和优惠摘要</span>
              </div>
              <div className="detail-grid sample-detail-grid">
                {detailQuoteAmountItems.map((item) => (
                  <div className={item.highlight ? "detail-card sample-detail-card is-highlight" : "detail-card sample-detail-card"} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>报价状态</h4>
                <span>从新建到客户结果的关键节点</span>
              </div>
              <div className="sample-detail-timeline">
                {detailQuoteTimelineItems.map((item) => (
                  <div className={["sample-detail-timeline__item", item.done ? "is-done" : "", item.current ? "is-current" : "", item.danger ? "is-danger" : ""].filter(Boolean).join(" ")} key={item.label}>
                    <span aria-hidden="true" />
                    <strong>{item.label}</strong>
                    <small>{item.value}</small>
                    {item.note ? <em>{item.note}</em> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section sample-detail-section">
              <div className="sample-detail-section__header">
                <h4>备注</h4>
              <span>审批意见和报价备注</span>
            </div>
            <div className="detail-note">
              <strong>备注：</strong>{detailValue(detailQuote?.notes)}
            </div>
          </section>
          </div>
        )}
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog sample-edit-dialog"
        title="编辑样品"
        width="min(1040px, calc(100vw - 48px))"
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">
              取消
            </button>
            <button
              className="primary-button"
              disabled={update.isPending || !editForm.productSummary.trim()}
              onClick={() => update.mutate()}
              type="button"
            >
              {update.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>{t("sampleFields.sampleProduct")}</label>
            <input value={editForm.productSummary} onChange={(e) => setEditForm({ ...editForm, productSummary: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.specification")}</label>
            <input value={editForm.specification} onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.material")}</label>
            <input value={editForm.material} onChange={(e) => setEditForm({ ...editForm, material: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.process")}</label>
            <input value={editForm.process} onChange={(e) => setEditForm({ ...editForm, process: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.sampleQuantity")}</label>
            <input type="number" min={1} value={editForm.sampleQuantity} onChange={(e) => setEditForm({ ...editForm, sampleQuantity: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.samplePurpose")}</label>
            <AppSelect
              className="sample-light-select"
              popupClassName="sample-light-select-popup"
              value={editForm.samplePurpose}
              onChange={(v) => setEditForm({ ...editForm, samplePurpose: v })}
              options={SAMPLE_PURPOSES.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.deliveryDeadline")}</label>
            <LocalizedDateInput value={editForm.deliveryDeadline} onChange={(value) => setEditForm({ ...editForm, deliveryDeadline: value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.relatedQuote")}</label>
            <AppSelect
              className="sample-light-select"
              popupClassName="sample-light-select-popup"
              value={editForm.quoteId}
              onChange={(v) => setEditForm({ ...editForm, quoteId: v })}
              options={[{ value: "", label: t("sampleFields.noRelatedQuote") }, ...quoteOptions.map((quote) => ({ value: quote.id, label: `${quote.quoteNo} · ${quote.productName}` }))]}
              placeholder={t("sampleFields.noRelatedQuote")}
            />
          </div>
          <div className="form-field wide-field">
            <label>{t("sampleFields.attachments")}</label>
            <FileUpload
              entityId={editing?.id}
              entityType="sample-request"
              fileIds={editForm.fileAssetIds}
              multiple
              accept="*/*"
              onChange={(ids) => setEditForm({ ...editForm, fileAssetIds: ids })}
            />
          </div>
          <div className="analysis-edit-section wide-field">
            <div className="analysis-edit-section__title">
              <h4>{t("sampleFields.feeDetails")}</h4>
              <button className="secondary-button" onClick={() => currentEditingSample && openFee(currentEditingSample)} type="button">
                {t("sampleFields.addFee")}
              </button>
            </div>
            {currentEditingSample?.fees?.length ? (
              <div className="detail-list">
                {currentEditingSample.fees.map((fee) => (
                  <div className="detail-list-item sample-fee-list-item" key={fee.id}>
                    <div>
                      <strong>
                        {feeTypeLabel(fee.feeType, t)} · {feeDisplayAmount(fee)} · {sampleRoundLabel(currentEditingSample, fee.sampleRoundId)}
                      </strong>
                      <span>
                        {costNatureLabel(fee.costNature, t)} · {responsibilityLabel(fee.responsibility, t)} · {paymentStatusLabel(fee.paymentStatus, t)} · {new Date(fee.incurredAt).toLocaleDateString(locale)} {fee.note ? `· ${fee.note}` : ""}
                      </span>
                    </div>
                    <div className="sample-fee-list-item__actions">
                      <button className="secondary-button" onClick={() => currentEditingSample && openEditFee(currentEditingSample, fee)} type="button">
                        {t("common.edit")}
                      </button>
                      <DeleteIconButton
                        disabled={feeDeleteMutation.isPending}
                        label={t("sampleFields.deleteFee")}
                        onClick={() => currentEditingSample && openDeleteFee(currentEditingSample, fee)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">{t("sampleFields.noFees")}</div>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title={`${selectedStatusAction?.label ?? "样品状态"} · ${currentStatusSample?.productSummary ?? ""}`}
        visible={statusOpen}
        onClose={() => {
          setStatusOpen(false);
          setStatusSample(null);
          setStatusTarget(null);
          setStatusRoundId(null);
        }}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button
              className="secondary-button"
              onClick={() => {
                setStatusOpen(false);
                setStatusSample(null);
                setStatusTarget(null);
                setStatusRoundId(null);
              }}
              type="button"
            >
              关闭
            </button>
          </div>
        )}
      >
        <div className="detail-window">
          <section className="detail-section">
            <h4>当前状态</h4>
            <div className="detail-note">{currentStatusSample ? statusLabel(currentStatus) : "-"}</div>
          </section>
          {currentStatus === "PREPARING" && statusTarget === "RETAINED" ? (
            <section className="detail-section">
              <h4>寄出前留样</h4>
              <div className="analysis-edit-grid sample-status-shipping-grid">
                <div className="form-field sample-status-field">
                  <label>实际完成数量</label>
                  <input type="number" min={1} value={statusForm.producedQuantity} onChange={(e) => setStatusForm({ ...statusForm, producedQuantity: e.target.value })} />
                </div>
                <div className="form-field sample-status-field">
                  <label>留样数量</label>
                  <input type="number" min={1} value={statusForm.retainedQuantity} onChange={(e) => setStatusForm({ ...statusForm, retainedQuantity: e.target.value })} />
                </div>
                <div className="form-field sample-status-field">
                  <label>留样位置</label>
                  <input value={statusForm.retainedLocation} onChange={(e) => setStatusForm({ ...statusForm, retainedLocation: e.target.value })} />
                </div>
              </div>
            </section>
          ) : null}
          {(currentStatus === "RETAINED" && statusTarget === "SHIPPED") || (currentStatus === "SHIPPED" && statusTarget === "DELIVERED") ? (
            <section className="detail-section">
              {currentStatus === "RETAINED" ? <>
                <h4>物流信息</h4>
                <div className="analysis-edit-grid sample-status-shipping-grid">
                  <div className="form-field sample-status-field"><label>{t("sampleFields.carrier")}</label><input value={statusForm.carrier} onChange={(e) => setStatusForm({ ...statusForm, carrier: e.target.value })} /></div>
                  <div className="form-field sample-status-field"><label>{t("sampleFields.trackingNo")}</label><input value={statusForm.trackingNo} onChange={(e) => setStatusForm({ ...statusForm, trackingNo: e.target.value })} /></div>
                  <div className="form-field sample-status-field"><label>{t("sampleFields.shippedAt")}</label><LocalizedDateInput value={statusForm.shippedAt} onChange={(value) => setStatusForm({ ...statusForm, shippedAt: value })} /></div>
                </div>
              </> : <>
                <h4>签收信息</h4>
                <div className="form-field sample-status-field"><label>{t("sampleFields.deliveredAt")}</label><LocalizedDateInput value={statusForm.deliveredAt} onChange={(value) => setStatusForm({ ...statusForm, deliveredAt: value })} /></div>
              </>}
            </section>
          ) : null}
          {currentStatus === "DELIVERED" && statusTarget === "FEEDBACK_RECEIVED" ? (
            <section className="detail-section">
              <h4>客户反馈</h4>
              <div className="analysis-edit-form">
                <div className="form-field wide-field">
                  <label>{t("sampleFields.feedback")}</label>
                  <textarea value={statusForm.feedback} onChange={(e) => setStatusForm({ ...statusForm, feedback: e.target.value })} rows={4} />
                </div>
                <div className="form-field"><label>反馈结论</label><select value={statusForm.feedbackResult} onChange={(e) => setStatusForm({ ...statusForm, feedbackResult: e.target.value as SampleStatusForm["feedbackResult"] })}><option value="ACCEPTED">客户确认通过</option><option value="RESAMPLE_REQUIRED">客户要求重打</option><option value="CUSTOMER_REJECTED">客户终止</option></select></div>
                <div className="form-field"><label>客户样品处置</label><select value={statusForm.dispositionStatus} onChange={(e) => setStatusForm({ ...statusForm, dispositionStatus: e.target.value as SampleStatusForm["dispositionStatus"] })}><option value="PENDING">待处置</option><option value="RETURNED">已归还</option><option value="CUSTOMER_KEPT">客户保留</option><option value="DISPOSED">已报废</option></select></div>
                {statusForm.feedbackResult === "RESAMPLE_REQUIRED" ? <div className="detail-note">保存反馈后，可从更多操作中生成一条重打草稿。</div> : null}
              </div>
            </section>
          ) : null}
          {statusTarget && ["RETURNED", "CUSTOMER_KEPT", "DISPOSED"].includes(statusTarget) ? (
            <section className="detail-section">
              <h4>客户样品处置</h4>
              <div className="analysis-edit-form" style={{ marginTop: 16 }}>
                <div className="form-field">
                  <label>{t("sampleFields.receiver")}</label>
                  <input
                    value={returnForm.receiverName}
                    onChange={(e) => setReturnForm({ ...returnForm, receiverName: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>{t("sampleFields.destination")}</label>
                  <input value={returnForm.destination} onChange={(e) => setReturnForm({ ...returnForm, destination: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>{t("sampleFields.recordDate")}</label>
                  <LocalizedDateInput value={returnForm.recordedAt} onChange={(value) => setReturnForm({ ...returnForm, recordedAt: value })} />
                </div>
                <div className="form-field wide-field">
                  <label>{t("common.notes")}</label>
                  <textarea value={returnForm.note} onChange={(e) => setReturnForm({ ...returnForm, note: e.target.value })} rows={3} />
                </div>
              </div>
            </section>
          ) : null}
          <section className="detail-section">
            <h4>确认操作</h4>
            {selectedStatusAction ? <div className="detail-note">确认执行“{selectedStatusAction.label}”吗？</div> : null}
            <div className="toolbar">
              {statusTransitions.length ? (
                statusTransitions.map((nextStatus) => {
                  const requiresShipmentInfo = nextStatus === "SHIPPED";
                  const requiresDeliveryInfo = nextStatus === "DELIVERED";
                  const shipmentMissing = requiresShipmentInfo && (!statusForm.carrier.trim() || !statusForm.trackingNo.trim());
                  return (
                    <button
                      className="primary-button"
                      disabled={statusMutation.isPending || shipmentMissing || !currentStatusSample}
                      key={nextStatus}
                      onClick={() => {
                        if (!currentStatusSample) return;
                        statusMutation.mutate({
                          sampleId: currentStatusSample.id,
                          roundId: statusRoundId ?? currentStatusSample.currentRound?.id,
                          status: nextStatus,
                          ...(requiresShipmentInfo ? { carrier: statusForm.carrier, trackingNo: statusForm.trackingNo, shippedAt: statusForm.shippedAt } : {}),
                          ...(requiresDeliveryInfo ? { deliveredAt: statusForm.deliveredAt || undefined } : {}),
                          ...(currentStatus === "DELIVERED" ? { feedback: statusForm.feedback || undefined } : {})
                        });
                      }}
                      type="button"
                    >
                      {sampleStatusActionLabel(currentStatus, nextStatus)}
                    </button>
                  );
                  })
              ) : (
                <div className="empty-state">当前状态没有可执行的流转操作。</div>
              )}
            </div>
            {currentStatusSample && statusTransitions.includes("SHIPPED") && currentStatus === "RETAINED" && (!statusForm.carrier.trim() || !statusForm.trackingNo.trim() || !statusForm.shippedAt.trim()) ? (
              <div className="error-state" style={{ marginTop: 12 }}>
                切换为已寄出前，请先填写物流商、运单号和发货日期。
              </div>
            ) : null}
          </section>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title={approvalDialogTitle}
        visible={approvalOpen}
        onClose={closeApproval}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={closeApproval} type="button">
              取消
            </button>
            <button
              className="primary-button"
              disabled={approvalPending || !approvalSample}
              onClick={() => {
                if (!approvalSample) return;
                const payload = { sampleId: approvalSample.id, comment: approvalComment.trim() };
                if (approvalMode === "approve") {
                  approve.mutate(payload);
                } else {
                  reject.mutate(payload);
                }
              }}
              type="button"
            >
              {approvalPending ? "处理中..." : approvalDialogConfirmLabel}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form">
          <div className="detail-note">{approvalDialogDescription}</div>
          <div className="form-field wide-field">
            <label>{t("common.optionalNote")}</label>
            <textarea
              autoFocus
              value={approvalComment}
              onChange={(event) => setApprovalComment(event.target.value)}
              rows={4}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title="确认删除费用"
        visible={feeDeleteOpen}
        onClose={() => {
          setFeeDeleteOpen(false);
          setFeeDeleting(null);
        }}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button
              className="secondary-button"
              onClick={() => {
                setFeeDeleteOpen(false);
                setFeeDeleting(null);
              }}
              type="button"
            >
              取消
            </button>
            <button className="primary-button" disabled={feeDeleteMutation.isPending} onClick={() => feeDeleteMutation.mutate()} type="button">
              {feeDeleteMutation.isPending ? "删除中..." : "确认删除"}
            </button>
          </div>
        }
      >
        <p>删除后，这条费用记录会从样品中移除，但历史记录会保留。确定要删除费用 {feeDeleting ? feeTypeLabel(feeDeleting.feeType, t) : ""} 吗？</p>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title={feeMode === "edit" ? t("sampleFields.editFeeRecordTitle") : t("sampleFields.feeRecordTitle")}
        visible={feeOpen}
        onClose={() => setFeeOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setFeeOpen(false)} type="button">
              取消
            </button>
            <button className="primary-button" disabled={feeMutation.isPending} onClick={() => feeMutation.mutate()} type="button">
              {feeMutation.isPending ? "保存中..." : feeMode === "edit" ? "更新" : "保存"}
            </button>
          </div>
        }
        >
        <div className="analysis-edit-form sample-fee-dialog">
          <div className="sample-fee-dialog__summary">
            <div>
              <strong>{feeMode === "edit" ? t("sampleFields.editFeeRecordTitle") : t("sampleFields.feeRecordTitle")}</strong>
              <span>{feeSample?.productSummary ? t("sampleFields.feeRecordForSample").replace("{sample}", feeSample.productSummary) : t("sampleFields.feeRecordPrompt")}</span>
            </div>
            <span>{feeMode === "edit" ? t("sampleFields.feeRecordEditHint") : t("sampleFields.feeRecordCreateHint")}</span>
          </div>
          <div className="analysis-edit-gap sample-fee-card">
            <div className="sample-fee-card__header">
              <strong>{t("sampleFields.feeInfo")}</strong>
            </div>
            <div className="sample-fee-card__fields">
              <div className="form-field">
                <label>{t("sampleFields.feeType")}</label>
                <select value={feeForm.feeType} onChange={(e) => setFeeForm({ ...feeForm, feeType: e.target.value })}>
                  {FEE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(item.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>{t("common.amount")}</label>
                <input type="number" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.currency")}</label>
                <input value={feeForm.currency} onChange={(e) => setFeeForm({ ...feeForm, currency: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("sampleFields.incurredAt")}</label>
                <LocalizedDateInput value={feeForm.incurredAt} onChange={(value) => setFeeForm({ ...feeForm, incurredAt: value })} />
              </div>
              <div className="form-field">
                <label>{t("sampleFields.feeRound")}</label>
                <select value={feeForm.sampleRoundId} onChange={(e) => setFeeForm({ ...feeForm, sampleRoundId: e.target.value })}>
                  <option value="">{t("sampleFields.sharedFee")}</option>
                  {(feeSample?.rounds ?? []).map((round) => <option key={round.id} value={round.id}>R{round.roundNo}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>{t("sampleFields.costNature")}</label>
                <select value={feeForm.costNature} onChange={(e) => setFeeForm({ ...feeForm, costNature: e.target.value as SampleFeeForm["costNature"], paymentStatus: e.target.value === "CUSTOMER_CHARGE" && feeForm.paymentStatus === "NOT_APPLICABLE" ? "PENDING" : feeForm.paymentStatus })}>
                  {COST_NATURES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>{t("sampleFields.responsibility")}</label>
                <select value={feeForm.responsibility} onChange={(e) => setFeeForm({ ...feeForm, responsibility: e.target.value as SampleFeeForm["responsibility"] })}>
                  {FEE_RESPONSIBILITIES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>{t("sampleFields.paymentStatus")}</label>
                <select value={feeForm.paymentStatus} onChange={(e) => setFeeForm({ ...feeForm, paymentStatus: e.target.value as SampleFeeForm["paymentStatus"] })}>
                  {PAYMENT_STATUSES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field wide-field sample-fee-card__note">
              <label>{t("common.notes")}</label>
              <textarea value={feeForm.note} onChange={(e) => setFeeForm({ ...feeForm, note: e.target.value })} rows={2} />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title={`样品历史 · ${historySample?.productSummary ?? ""}`}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setHistoryOpen(false)} type="button">
              关闭
            </button>
          </div>
        }
      >
        {historyQuery.isLoading ? <div className="empty-state">正在加载历史记录...</div> : null}
        {historyQuery.isError ? <div className="error-state">历史记录加载失败。</div> : null}
        {!historyQuery.isLoading && !historyQuery.isError ? (
          <div className="history-timeline" aria-label="样品历史时间轴">
            {currentHistory.length ? (
              currentHistory.map((item) => (
                <div className="history-timeline__item" key={item.id}>
                  <div className="history-timeline__rail" aria-hidden="true">
                    <span className="history-timeline__dot">
                      <History size={14} />
                    </span>
                  </div>
                  <div className="history-timeline__content">
                    <div className="history-timeline__header">
                      <strong>{historyActionLabel(item)}</strong>
                      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                    </div>
                    <span className="history-timeline__meta">{historyActorLabel(item)}</span>
                    {historyDetailText(item) ? <span className="history-timeline__detail">{historyDetailText(item)}</span> : null}
                    {item.comment ? <span className="history-timeline__detail">{normalizeHistoryComment(item.comment)}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">暂无历史记录。</div>
            )}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog sample-dialog"
        title="确认作废"
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDeleteOpen(false)} type="button">
              取消
            </button>
            <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate()} type="button">
              {remove.isPending ? "作废中..." : "确认作废"}
            </button>
          </div>
        }
      >
        <p>作废后，样品仍保留在历史中，但不再参与后续流转。确定要作废样品 {editing?.productSummary} 吗？</p>
      </Dialog>
    </>
  );
}
