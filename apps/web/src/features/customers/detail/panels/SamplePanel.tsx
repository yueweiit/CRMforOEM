import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, Download, History, NotebookTabs, XCircle } from "lucide-react";
import "./analysis-edit.css";
import { quoteFlowStatusLabel } from "@oem-crm/shared";
import { showClientToast } from "../../../../components/Toast";
import {
  createSample,
  exportSamples,
  deleteSample,
  deleteSampleFee,
  getQuoteHistory,
  getSampleHistory,
  getQuotes,
  getSamples,
  recordSampleFee,
  recordSampleReturn,
  updateSampleFee,
  updateSample
} from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { FileUpload } from "../../../../components/FileUpload";
import { AppSelect } from "../../../../components/AppSelect";
import { Field } from "../../../../components/ui/Field";
import { useI18n } from "../../../../i18n";
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

const RETURN_TYPES = [
  { value: "RETURNED", label: "已归还" },
  { value: "STORED", label: "已留样" }
] as const;

const FEE_TYPES = [
  { value: "SAMPLE_MAKING", label: "打样费" },
  { value: "MOLD", label: "模具费" },
  { value: "COURIER", label: "快递费" },
  { value: "PACKAGING", label: "包装费" },
  { value: "RETURN", label: "返还费" },
  { value: "OTHER", label: "其他费用" }
] as const;

const SAMPLE_PURPOSES = [
  { value: "CUSTOMER_TEST", label: "客户测试" },
  { value: "EXHIBITION", label: "参展" },
  { value: "APPEARANCE_CONFIRMATION", label: "确认外观" }
] as const;

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "待申请",
    APPROVING: "待审核",
    REJECTED: "审批驳回",
    PREPARING: "打样中",
    SHIPPED: "已寄出",
    DELIVERED: "已签收",
    FEEDBACK_RECEIVED: "已反馈",
    RETURNED: "已归还",
    STORED: "已留样",
    VOIDED: "已作废",
    CLOSED: "已关闭"
  };
  return labels[status] ?? status;
}

function historyActionLabel(item: SampleHistoryItem) {
  if (item.action === "STATUS_CHANGED") {
    const beforeStatus = typeof item.before?.status === "string" ? item.before.status : "";
    const afterStatus = typeof item.after?.status === "string" ? item.after.status : "";
    const statusLabels: Record<string, string> = {
      APPROVING: "发起审核",
      PREPARING: beforeStatus === "APPROVING" ? "审核通过" : "打样中",
      REJECTED: "审核驳回",
      REQUESTED: "待申请",
      SHIPPED: "已寄出",
      DELIVERED: "已签收",
      FEEDBACK_RECEIVED: "已反馈",
      RETURNED: "已归还",
      STORED: "已留样",
      VOIDED: "已作废",
      CLOSED: "已关闭"
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
    RETURNED: "归还",
    STORED: "留样",
    VOIDED: "作废",
    CLOSED: "关闭"
  };
  return labels[item.action] ?? item.action;
}

function feeTypeLabel(type: string) {
  return FEE_TYPES.find((item) => item.value === type)?.label ?? type;
}

function samplePurposeLabel(purpose?: string | null) {
  return SAMPLE_PURPOSES.find((item) => item.value === purpose)?.label ?? purpose;
}

function returnTypeLabel(type: string) {
  return RETURN_TYPES.find((item) => item.value === type)?.label ?? type;
}

function statusCodeLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "待申请",
    APPROVING: "待审核",
    REJECTED: "审批驳回",
    PREPARING: "打样中",
    SHIPPED: "已寄出",
    DELIVERED: "已签收",
    FEEDBACK_RECEIVED: "已反馈",
    RETURNED: "已归还",
    STORED: "已留样",
    VOIDED: "已作废",
    CLOSED: "已关闭"
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

function sampleFeeTotal(sample: Sample) {
  return (sample.fees ?? []).reduce((total, fee) => total + Number(fee.amount || 0), 0);
}

function sampleAttachmentCount(sample: Sample) {
  return sample.fileAssetIds?.length ?? 0;
}

function latestReturnRecord(sample: Sample) {
  return sample.returnRecords?.[0] ?? null;
}

const SAMPLE_CORE_STATUS_ORDER = ["REQUESTED", "APPROVING", "PREPARING", "SHIPPED", "DELIVERED"] as const;
const SAMPLE_AFTER_DELIVERY_STATUSES = ["FEEDBACK_RECEIVED", "RETURNED", "STORED", "CLOSED"];
const SAMPLE_TERMINAL_STATUSES = ["REJECTED", "FEEDBACK_RECEIVED", "RETURNED", "STORED", "VOIDED", "CLOSED"];

function sampleCoreStatusReached(currentStatus: string, targetStatus: (typeof SAMPLE_CORE_STATUS_ORDER)[number]) {
  if (currentStatus === "VOIDED") {
    return targetStatus === "REQUESTED";
  }
  if (currentStatus === "REJECTED") {
    return targetStatus === "REQUESTED" || targetStatus === "APPROVING";
  }
  if (SAMPLE_AFTER_DELIVERY_STATUSES.includes(currentStatus)) {
    return true;
  }
  const currentIndex = SAMPLE_CORE_STATUS_ORDER.indexOf(currentStatus as (typeof SAMPLE_CORE_STATUS_ORDER)[number]);
  const targetIndex = SAMPLE_CORE_STATUS_ORDER.indexOf(targetStatus);
  return currentIndex >= targetIndex && targetIndex >= 0;
}

function sampleStatusPillClass(status: string) {
  const toneByStatus: Record<string, string> = {
    REQUESTED: "status-pill--neutral",
    APPROVING: "status-pill--warning",
    REJECTED: "status-pill--danger",
    PREPARING: "status-pill--info",
    SHIPPED: "status-pill--info",
    DELIVERED: "status-pill--success",
    FEEDBACK_RECEIVED: "status-pill--success",
    RETURNED: "status-pill--success",
    STORED: "status-pill--muted",
    VOIDED: "status-pill--danger",
    CLOSED: "status-pill--muted"
  };
  return ["status-pill", "status-pill--detail", toneByStatus[status] ?? "status-pill--neutral"].join(" ");
}

function allowedTransitions(status: string) {
  const transitions: Record<string, string[]> = {
    REQUESTED: ["APPROVING", "VOIDED"],
    APPROVING: ["PREPARING", "VOIDED"],
    REJECTED: ["APPROVING", "VOIDED"],
    PREPARING: ["SHIPPED", "VOIDED"],
    SHIPPED: ["DELIVERED", "VOIDED"],
    DELIVERED: ["FEEDBACK_RECEIVED", "RETURNED", "STORED", "CLOSED", "VOIDED"],
    FEEDBACK_RECEIVED: ["RETURNED", "STORED", "CLOSED", "VOIDED"],
    RETURNED: ["STORED", "CLOSED", "VOIDED"],
    STORED: ["CLOSED", "VOIDED"],
    VOIDED: [],
    CLOSED: []
  };
  return transitions[status] ?? [];
}

function statusDialogTransitions(status: string) {
  return allowedTransitions(status).filter((nextStatus) => nextStatus !== "VOIDED");
}

function statusDialogActionLabel(currentStatus: string, nextStatus: string) {
  if ((currentStatus === "REQUESTED" || currentStatus === "REJECTED") && nextStatus === "APPROVING") {
    return "发起审核";
  }
  return statusLabel(nextStatus);
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
      incurredAt: feeForm.incurredAt || undefined
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
  carrier: string;
  trackingNo: string;
  shippedAt: string;
  deliveredAt: string;
  feedback: string;
}) {
  return {
    productSummary: form.productSummary,
    specification: form.specification,
    material: form.material,
    process: form.process,
    sampleQuantity: Number(form.sampleQuantity),
    samplePurpose: form.samplePurpose,
    deliveryDeadline: form.deliveryDeadline || undefined,
    quoteId: form.quoteId || undefined,
    fileAssetIds: form.fileAssetIds,
    carrier: form.carrier || undefined,
    trackingNo: form.trackingNo || undefined,
    shippedAt: form.shippedAt || undefined,
    deliveredAt: form.deliveredAt || undefined,
    feedback: form.feedback || undefined
  };
}

function shippingValidationMessage(form: {
  carrier: string;
  trackingNo: string;
  shippedAt: string;
}, sampleStatus: string) {
  if (sampleStatus !== "SHIPPED") {
    return "";
  }
  if (!form.carrier.trim() || !form.trackingNo.trim() || !form.shippedAt.trim()) {
    return "样品寄出时必须填写物流商、运单号和发货日期。";
  }
  return "";
}

function createSampleValidationMessage(form: {
  productSummary: string;
  specification: string;
  material: string;
  process: string;
  sampleQuantity: string;
  samplePurpose: string;
  deliveryDeadline: string;
}) {
  const quantity = Number(form.sampleQuantity);
  if (!form.productSummary.trim()) return "请填写样品/产品名称。";
  if (!form.specification.trim()) return "请填写规格。";
  if (!form.sampleQuantity.trim() || !Number.isInteger(quantity) || quantity < 1) return "请填写有效的样品数量。";
  if (!form.samplePurpose.trim()) return "请选择样品用途。";
  return "";
}

function createFeeValidationMessage(forms: Array<{
  feeType: string;
  amount: string;
  currency: string;
}>) {
  if (!forms.length) return "";
  if (forms.some((form) => {
    const amount = Number(form.amount);
    return !form.feeType.trim() || !form.amount.trim() || !Number.isFinite(amount) || amount < 0 || !form.currency.trim();
  })) {
    return "请把所有样品费用记录填写完整。";
  }
  return "";
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

function createEmptySampleFee() {
  return {
    feeType: "SAMPLE_MAKING",
    amount: "",
    currency: "USD",
    note: "",
    incurredAt: formatDateInput(new Date())
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
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeMode, setFeeMode] = useState<"create" | "edit">("create");
  const [feeDeleteOpen, setFeeDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [statusSample, setStatusSample] = useState<Sample | null>(null);
  const [statusForm, setStatusForm] = useState({
    carrier: "",
    trackingNo: "",
    shippedAt: formatDateInput(new Date()),
    deliveredAt: "",
    feedback: ""
  });
  const [feeSample, setFeeSample] = useState<Sample | null>(null);
  const [feeEditing, setFeeEditing] = useState<{ sampleId: string; feeId: string } | null>(null);
  const [feeDeleting, setFeeDeleting] = useState<{ sampleId: string; feeId: string; feeType: string } | null>(null);
  const [historySample, setHistorySample] = useState<Sample | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"approve" | "reject">("approve");
  const [approvalSample, setApprovalSample] = useState<Sample | null>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [editForm, setEditForm] = useState({
    productSummary: "",
    specification: "",
    material: "",
    process: "",
    sampleQuantity: "",
    samplePurpose: "CUSTOMER_TEST",
    deliveryDeadline: "",
    quoteId: "",
    fileAssetIds: [] as string[],
    carrier: "",
    trackingNo: "",
    shippedAt: "",
    deliveredAt: "",
    feedback: ""
  });
  const [feeForm, setFeeForm] = useState({
    feeType: "SAMPLE_MAKING",
    amount: "",
    currency: "USD",
    note: "",
    incurredAt: formatDateInput(new Date())
  });
  const [returnForm, setReturnForm] = useState({
    returnType: "RETURNED",
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
  const statusTransitions = statusDialogTransitions(currentStatusSample?.status ?? "");

  const refreshSamples = () => {
    queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
  };

  const create = useMutation({
    mutationFn: () => createSample(buildCreatePayload(customerId, createForm, createFeeForms) as never),
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
    mutationFn: () => {
      const message = shippingValidationMessage(editForm, editing?.status ?? "");
      if (message) {
        throw new Error(message);
      }
      return updateSample(editing?.id ?? "", buildUpdatePayload(editForm) as never);
    },
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
        fileAssetIds: [],
        carrier: "",
        trackingNo: "",
        shippedAt: "",
        deliveredAt: "",
        feedback: ""
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
    mutationFn: (payload: { sampleId: string; status: string; carrier?: string; trackingNo?: string; shippedAt?: string; deliveredAt?: string; feedback?: string }) =>
      updateSample(payload.sampleId, {
        status: payload.status,
        ...(payload.carrier !== undefined ? { carrier: payload.carrier } : {}),
        ...(payload.trackingNo !== undefined ? { trackingNo: payload.trackingNo } : {}),
        ...(payload.shippedAt !== undefined ? { shippedAt: payload.shippedAt } : {}),
        ...(payload.deliveredAt !== undefined ? { deliveredAt: payload.deliveredAt } : {}),
        ...(payload.feedback !== undefined ? { feedback: payload.feedback } : {})
      }),
    onSuccess: () => {
      refreshSamples();
      setStatusOpen(false);
      setStatusSample(null);
      setStatusForm({ carrier: "", trackingNo: "", shippedAt: formatDateInput(new Date()), deliveredAt: "", feedback: "" });
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

  const approve = useMutation({
    mutationFn: ({ sampleId, comment }: { sampleId: string; comment?: string }) =>
      updateSample(sampleId, { status: "PREPARING", ...(comment ? { comment } : {}) }),
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
      updateSample(sampleId, { status: "REJECTED", ...(comment ? { comment } : {}) }),
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
      setFeeForm({ feeType: "SAMPLE_MAKING", amount: "", currency: "USD", note: "", incurredAt: formatDateInput(new Date()) });
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

  const returnMutation = useMutation({
    mutationFn: (returnType: "RETURNED" | "STORED") =>
      recordSampleReturn(currentStatusSample?.id ?? "", {
        ...returnForm,
        returnType,
        recordedAt: returnForm.recordedAt || undefined
      }),
    onSuccess: () => {
      refreshSamples();
      setReturnForm({
        returnType: "RETURNED",
        receiverName: "",
        destination: "",
        note: "",
        recordedAt: formatDateInput(new Date())
      });
      setStatusOpen(false);
      setStatusSample(null);
      showClientToast({ type: "success", title: "归还/留样已记录", message: "样品状态已更新。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "记录归还失败",
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
      fileAssetIds: item.fileAssetIds ?? [],
      carrier: item.carrier ?? "",
      trackingNo: item.trackingNo ?? "",
      shippedAt: item.shippedAt ? formatDateInput(new Date(item.shippedAt)) : "",
      deliveredAt: item.deliveredAt ? formatDateInput(new Date(item.deliveredAt)) : "",
      feedback: item.feedback ?? ""
    });
    setEditOpen(true);
  };

  const openStatus = (item: Sample) => {
    setStatusSample(item);
    setStatusForm({
      carrier: item.carrier ?? "",
      trackingNo: item.trackingNo ?? "",
      shippedAt: item.shippedAt ? formatDateInput(new Date(item.shippedAt)) : formatDateInput(new Date()),
      deliveredAt: item.deliveredAt ? formatDateInput(new Date(item.deliveredAt)) : "",
      feedback: item.feedback ?? ""
    });
    setStatusOpen(true);
  };

  const openSampleDetail = (item: Sample) => {
    setDetailSample(item);
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
      incurredAt: formatDateInput(new Date())
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
      incurredAt: fee.incurredAt ? formatDateInput(new Date(fee.incurredAt)) : formatDateInput(new Date())
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
    setApprovalComment(item.approvalComment ?? "");
    setApprovalOpen(true);
  };

  const closeApproval = () => {
    setApprovalOpen(false);
    setApprovalSample(null);
    setApprovalComment("");
  };

  const canEdit = (item: Sample) => item.status !== "VOIDED" && item.status !== "CLOSED";
  const canApprove = (item: Sample) => item.status === "APPROVING";
  const canReject = (item: Sample) => item.status === "APPROVING";
  const canDelete = (item: Sample) => item.status !== "VOIDED" && item.status !== "CLOSED";
  const currentHistory = historyQuery.data ?? [];
  const createMessage = createSampleValidationMessage(createForm);
  const createFeeMessage = createFeeValidationMessage(createFeeForms);
  const createReady = createMessage === "" && createFeeMessage === "";
  const visibleCreateMessage = createValidationRequested ? createMessage || createFeeMessage : "";
  const shippingMessage = shippingValidationMessage(editForm, editing?.status ?? "");
  const approvalDialogTitle = approvalMode === "approve" ? "审核通过" : "审核驳回";
  const approvalDialogConfirmLabel = approvalMode === "approve" ? "通过" : "驳回";
  const approvalDialogDescription =
    approvalMode === "approve" ? "备注可留空；填写后保留审核依据。" : "备注可留空；填写后说明需要补充或修改的内容。";
  const approvalPending = approvalMode === "approve" ? approve.isPending : reject.isPending;
  const currentStatus = currentStatusSample?.status ?? "";
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
  const detailSampleFeeTotal = detailSample ? formatMoney(sampleFeeTotal(detailSample), detailSample.quote?.currency ?? detailSample.fees?.[0]?.currency) : "-";
  const sampleDetailStatus = detailSample?.status ?? "";
  const sampleDetailHistory = detailSampleHistoryQuery.data ?? [];
  const sampleDetailRejectedAt = sampleHistoryStatusTime(sampleDetailHistory, "REJECTED");
  const sampleDetailHistoryLoadingValue = detailSampleHistoryQuery.isLoading ? "加载中..." : "";
  const sampleDetailApprovalNote = detailSample?.approvalComment?.trim() ? `审批备注：${detailSample.approvalComment.trim()}` : "";
  const latestDetailReturnRecord = detailSample ? latestReturnRecord(detailSample) : null;
  const sampleDetailTerminalStatus = SAMPLE_TERMINAL_STATUSES.includes(sampleDetailStatus) ? sampleDetailStatus : "";
  const sampleDetailSummary = detailSample
    ? [
        `费用 ${detailSampleFeeTotal}`,
        detailSample.specification ? `规格 ${detailSample.specification}` : "",
        detailSample.trackingNo ? `运单 ${detailSample.trackingNo}` : "未填运单",
        detailSample.carrier ? `物流 ${detailSample.carrier}` : "未发货"
      ].filter(Boolean).join(" | ")
    : "";
  const sampleDetailBaseItems = [
    { label: "关联报价", value: detailValue(detailSample?.quote?.quoteNo ?? detailSample?.quoteId ?? "未关联"), highlight: true },
    { label: "规格", value: detailValue(detailSample?.specification) },
    { label: "样品用途", value: detailValue(detailSample ? samplePurposeLabel(detailSample.samplePurpose) : "") },
    { label: "材质", value: detailValue(detailSample?.material) },
    { label: "工艺", value: detailValue(detailSample?.process) },
    { label: "样品数量", value: detailValue(detailSample?.sampleQuantity) },
    { label: "交付期限", value: detailSample?.deliveryDeadline ? new Date(detailSample.deliveryDeadline).toLocaleDateString() : "-" },
    { label: "费用合计", value: detailSampleFeeTotal, highlight: true },
    { label: "附件数量", value: detailValue(detailSample?.fileAssetIds?.length ?? 0) }
  ];
  const sampleDetailTimelineItems = [
    {
      label: "申请",
      value: detailSample?.createdAt ? new Date(detailSample.createdAt).toLocaleString() : "-",
      done: sampleCoreStatusReached(sampleDetailStatus, "REQUESTED"),
      current: sampleDetailStatus === "REQUESTED"
    },
    {
      label: sampleCoreStatusReached(sampleDetailStatus, "PREPARING") ? "已审核" : statusLabel("APPROVING"),
      value: detailSample?.approvedAt ? new Date(detailSample.approvedAt).toLocaleString() : sampleDetailStatus === "APPROVING" ? "当前状态" : sampleDetailStatus === "REJECTED" ? "已驳回" : "未审核",
      done: sampleCoreStatusReached(sampleDetailStatus, "APPROVING"),
      current: sampleDetailStatus === "APPROVING",
      note: sampleCoreStatusReached(sampleDetailStatus, "PREPARING") ? sampleDetailApprovalNote : ""
    },
    ...(sampleDetailStatus === "REJECTED"
      ? [
          {
            label: statusLabel("REJECTED"),
            value: sampleDetailRejectedAt ? new Date(sampleDetailRejectedAt).toLocaleString() : sampleDetailHistoryLoadingValue || statusLabel("REJECTED"),
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
      label: statusLabel("SHIPPED"),
      value: detailSample?.shippedAt ? new Date(detailSample.shippedAt).toLocaleDateString() : sampleCoreStatusReached(sampleDetailStatus, "SHIPPED") ? "已发货" : "未发货",
      done: sampleCoreStatusReached(sampleDetailStatus, "SHIPPED"),
      current: sampleDetailStatus === "SHIPPED"
    },
    {
      label: statusLabel("DELIVERED"),
      value: detailSample?.deliveredAt ? new Date(detailSample.deliveredAt).toLocaleDateString() : sampleCoreStatusReached(sampleDetailStatus, "DELIVERED") ? "已签收" : "未签收",
      done: sampleCoreStatusReached(sampleDetailStatus, "DELIVERED"),
      current: sampleDetailStatus === "DELIVERED"
    },
    ...(sampleDetailTerminalStatus && sampleDetailTerminalStatus !== "REJECTED"
      ? [
          {
            label: statusLabel(sampleDetailTerminalStatus),
            value: latestDetailReturnRecord ? new Date(latestDetailReturnRecord.recordedAt).toLocaleDateString() : statusLabel(sampleDetailTerminalStatus),
            done: true,
            current: true,
            danger: ["REJECTED", "VOIDED"].includes(sampleDetailTerminalStatus)
          }
        ]
      : [])
  ];
  const hasDetailQuote = Boolean(detailQuote ?? detailSample?.quote);

  const handleCreateSample = () => {
    setCreateValidationRequested(true);
    if (createMessage || createFeeMessage) {
      return;
    }
    create.mutate();
  };

  return (
    <section className="panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>样品记录</h2>
          <span>{data.length} 条</span>
        </div>
        <button
          className="secondary-button"
          disabled={data.length === 0 || exportAllMutation.isPending}
          onClick={() => exportAllMutation.mutate()}
          type="button"
        >
          <Download size={14} />
          {exportAllMutation.isPending ? "导出中..." : "批量导出"}
        </button>
      </div>

      {samplesQuery.isLoading ? (
        <div className="empty-state">正在加载样品记录...</div>
      ) : samplesQuery.isError ? (
        <div className="error-state">样品记录加载失败，请稍后重试。</div>
      ) : data.length === 0 ? (
        <div className="empty-state">当前还没有样品记录。</div>
      ) : (
        <div className="task-list">
          {data.map((item) => {
            const feeTotal = sampleFeeTotal(item);
            const lastReturn = latestReturnRecord(item);
            return (
              <div className="task-row" key={item.id}>
                <NotebookTabs size={16} />
                <div>
                  <strong>
                    <button
                      className="table-link"
                      onClick={() => openSampleDetail(item)}
                      style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
                      type="button"
                    >
                      {item.productSummary}
                    </button>
                    {item.quote ? (
                      <>
                        {" · 关联报价 "}
                        <button
                          className="table-link"
                          onClick={() => openQuoteDetail(item)}
                          style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
                          type="button"
                        >
                          {item.quote.quoteNo}
                        </button>
                      </>
                    ) : null}
                    {item.quote?.productName ? ` · ${item.quote.productName}` : ""}
                  </strong>
                  <span>
                    {statusLabel(item.status)} 费用 {formatMoney(feeTotal, item.quote?.currency ?? item.fees?.[0]?.currency)}   | {item.samplePurpose ? `用途 ${samplePurposeLabel(item.samplePurpose)}` : ""} {item.sampleQuantity ? `数量 ${item.sampleQuantity}   | ` : ""}{item.trackingNo ? `运单 ${item.trackingNo}` : "未填运单"} {item.carrier ? `物流 ${item.carrier}` : ""}   |   
                  </span>
                  <span>
                      {item.shippedAt ? `发货 ${new Date(item.shippedAt).toLocaleDateString()}` : "未发货"} {item.deliveredAt ? `签收 ${new Date(item.deliveredAt).toLocaleDateString()}` : ""} {item.deliveryDeadline ? `交付 ${new Date(item.deliveryDeadline).toLocaleDateString()}` : ""} {lastReturn ? `${returnTypeLabel(lastReturn.returnType)} ${new Date(lastReturn.recordedAt).toLocaleDateString()}` : ""} {item.feedback ? `反馈 ${item.feedback}` : ""}
                  </span>
                </div>
                <div className="contact-row-actions">
                  <EditIconButton disabled={!canEdit(item)} onClick={() => openEdit(item)} />
                  <button className="secondary-button icon-button" onClick={() => openHistory(item)} title="历史" type="button">
                    <History size={14} />
                  </button>
                  <button className="secondary-button" disabled={item.status === "APPROVING" || !statusDialogTransitions(item.status).length} onClick={() => openStatus(item)} type="button">
                    状态
                  </button>
                  <button className="secondary-button icon-button" disabled={!canApprove(item) || approve.isPending} onClick={() => openApproval(item, "approve")} title="审核通过" type="button">
                    <CheckCircle2 size={14} />
                  </button>
                  <button className="secondary-button icon-button" disabled={!canReject(item) || reject.isPending} onClick={() => openApproval(item, "reject")} title="审核驳回" type="button">
                    <XCircle size={14} />
                  </button>
                  <DeleteIconButton disabled={!canDelete(item)} onClick={() => openDelete(item)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          <input type="date" value={createForm.deliveryDeadline} onChange={(e) => setCreateForm({ ...createForm, deliveryDeadline: e.target.value })} />
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
        {visibleCreateMessage ? <div className="error-state wide-field">{visibleCreateMessage}</div> : null}
        <div className="wide-field">
          <AddIconButton disabled={create.isPending} label={create.isPending ? t("quoteFields.submitting") : t("sampleFields.addSample")} onClick={handleCreateSample} />
        </div>
        </div>
      </div>

      <Dialog
        v2
        className="crm-action-dialog"
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
              <strong>已填写 {createFeeForms.length} 条费用记录</strong>
              <span>支持逐条添加、删除和修改</span>
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
                当前未填写费用记录，直接保存即可。需要费用时再点击“添加费用”。
              </div>
            ) : null}
            {createFeeForms.map((feeItem, index) => (
              <div className="analysis-edit-gap sample-fee-card" key={`${index}-${feeItem.incurredAt}`}>
                <div className="sample-fee-card__header">
                  <strong>费用 {index + 1}</strong>
                  <button
                    className="secondary-button"
                    disabled={createFeeForms.length === 1}
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
                          {item.label}
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
                    <input type="date" value={feeItem.incurredAt} onChange={(e) => setCreateFeeForms(createFeeForms.map((item, currentIndex) => currentIndex === index ? { ...item, incurredAt: e.target.value } : item))} />
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
        className={`crm-action-dialog ${detailMode === "sample" ? "sample-detail-dialog" : "quote-detail-dialog"}`}
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
                <span className={sampleStatusPillClass(detailSample?.status ?? "")}>{detailSample ? statusLabel(detailSample.status) : "-"}</span>
                <button className="secondary-button" disabled={!hasDetailQuote} onClick={() => setDetailMode("quote")} type="button">
                  查看报价
                </button>
              </div>
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
                  <strong>{detailValue(detailSample?.carrier)}</strong>
                </div>
                <div>
                  <span>运单号</span>
                  <strong>{detailValue(detailSample?.trackingNo)}</strong>
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
                        <strong>{feeTypeLabel(fee.feeType)} · {formatMoney(Number(fee.amount), fee.currency)}</strong>
                        <span>{new Date(fee.incurredAt).toLocaleDateString()} {fee.note ? `· ${fee.note}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">暂无费用记录。</div>
                )}
              </div>

              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>归还 / 留样记录</h4>
                  <span>{detailSample?.returnRecords?.length ? `共 ${detailSample.returnRecords.length} 条` : "暂无归还或留样记录"}</span>
                </div>
                {detailSample?.returnRecords?.length ? (
                  <div className="detail-list sample-detail-list">
                    {detailSample.returnRecords.map((record) => (
                      <div className="detail-list-item" key={record.id}>
                        <strong>{returnTypeLabel(record.returnType)} · {new Date(record.recordedAt).toLocaleDateString()}</strong>
                        <span>{record.receiverName ? `接收人 ${record.receiverName}` : ""}{record.destination ? ` · 去向 ${record.destination}` : ""}{record.note ? ` · ${record.note}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">暂无归还或留样记录。</div>
                )}
              </div>
            </section>

            <section className="sample-detail-split">
              <div className="detail-section sample-detail-section">
                <div className="sample-detail-section__header">
                  <h4>反馈说明</h4>
                  <span>客户测试反馈或内部备注</span>
                </div>
                <div className="detail-note">{detailValue(detailSample?.feedback)}</div>
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
        className="crm-action-dialog"
        title="编辑样品"
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">
              取消
            </button>
            <button
              className="primary-button"
              disabled={update.isPending || !editForm.productSummary.trim() || Boolean(shippingMessage)}
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
            <input type="date" value={editForm.deliveryDeadline} onChange={(e) => setEditForm({ ...editForm, deliveryDeadline: e.target.value })} />
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
              onChange={(ids) => setEditForm({ ...editForm, fileAssetIds: ids })}
            />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.carrier")}</label>
            <input value={editForm.carrier} onChange={(e) => setEditForm({ ...editForm, carrier: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.trackingNo")}</label>
            <input value={editForm.trackingNo} onChange={(e) => setEditForm({ ...editForm, trackingNo: e.target.value })} />
          </div>
          {shippingMessage ? <div className="error-state">{shippingMessage}</div> : null}
          <div className="form-field">
            <label>{t("sampleFields.shippedAt")}</label>
            <input type="date" value={editForm.shippedAt} onChange={(e) => setEditForm({ ...editForm, shippedAt: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("sampleFields.deliveredAt")}</label>
            <input type="date" value={editForm.deliveredAt} onChange={(e) => setEditForm({ ...editForm, deliveredAt: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>{t("sampleFields.feedback")}</label>
            <textarea value={editForm.feedback} onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })} rows={3} />
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
                        {feeTypeLabel(fee.feeType)} · {feeDisplayAmount(fee)}
                      </strong>
                      <span>
                        {new Date(fee.incurredAt).toLocaleDateString()} {fee.note ? `· ${fee.note}` : ""}
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
        className="crm-action-dialog"
        title={`样品状态 · ${currentStatusSample?.productSummary ?? ""}`}
        visible={statusOpen}
        onClose={() => {
          setStatusOpen(false);
          setStatusSample(null);
        }}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button
              className="secondary-button"
              onClick={() => {
                setStatusOpen(false);
                setStatusSample(null);
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
            <div className="detail-note">{currentStatusSample ? statusLabel(currentStatusSample.status) : "-"}</div>
          </section>
          {currentStatusSample?.status === "PREPARING" ? (
            <section className="detail-section">
              <h4>物流信息</h4>
              <div className="analysis-edit-grid sample-status-shipping-grid">
                <div className="form-field sample-status-field">
                  <label>{t("sampleFields.carrier")}</label>
                  <input value={statusForm.carrier} onChange={(e) => setStatusForm({ ...statusForm, carrier: e.target.value })} />
                </div>
                <div className="form-field sample-status-field">
                  <label>{t("sampleFields.trackingNo")}</label>
                  <input value={statusForm.trackingNo} onChange={(e) => setStatusForm({ ...statusForm, trackingNo: e.target.value })} />
                </div>
                <div className="form-field sample-status-field">
                  <label>{t("sampleFields.shippedAt")}</label>
                  <input type="date" value={statusForm.shippedAt} onChange={(e) => setStatusForm({ ...statusForm, shippedAt: e.target.value })} />
                </div>
              </div>
              <div className="empty-state" style={{ marginTop: 12 }}>
                填写后可以直接把状态推进到已寄出。
              </div>
            </section>
          ) : null}
          {currentStatusSample?.status === "SHIPPED" ? (
            <section className="detail-section">
              <h4>签收信息</h4>
              <div className="form-field sample-status-field">
                <label>{t("sampleFields.deliveredAt")}</label>
                <input
                  type="date"
                  value={statusForm.deliveredAt}
                  onChange={(e) => setStatusForm({ ...statusForm, deliveredAt: e.target.value })}
                />
              </div>
              <div className="empty-state" style={{ marginTop: 12 }}>
                可留空；填写后会一并记录到已签收状态。
              </div>
            </section>
          ) : null}
          {currentStatusSample?.status === "DELIVERED" ? (
            <section className="detail-section">
              <h4>反馈 / 归还信息</h4>
              <div className="analysis-edit-form">
                <div className="form-field wide-field">
                  <label>{t("sampleFields.feedback")}</label>
                  <textarea value={statusForm.feedback} onChange={(e) => setStatusForm({ ...statusForm, feedback: e.target.value })} rows={4} />
                </div>
              </div>
              <div className="empty-state" style={{ marginTop: 12 }}>
                可留空；填写后会记录在样品反馈中。
              </div>
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
                  <input type="date" value={returnForm.recordedAt} onChange={(e) => setReturnForm({ ...returnForm, recordedAt: e.target.value })} />
                </div>
                <div className="form-field wide-field">
                  <label>{t("common.notes")}</label>
                  <textarea value={returnForm.note} onChange={(e) => setReturnForm({ ...returnForm, note: e.target.value })} rows={3} />
                </div>
              </div>
            </section>
          ) : null}
          <section className="detail-section">
            <h4>可执行操作</h4>
            <div className="toolbar">
              {statusTransitions.length ? (
                statusTransitions
                  .filter((nextStatus) => currentStatusSample?.status !== "DELIVERED" || ["RETURNED", "STORED"].includes(nextStatus))
                  .map((nextStatus) => {
                  const requiresShipmentInfo = nextStatus === "SHIPPED";
                  const requiresDeliveryInfo = nextStatus === "DELIVERED";
                  const shipmentMissing = requiresShipmentInfo && (!statusForm.carrier.trim() || !statusForm.trackingNo.trim());
                  return (
                    <button
                      className="primary-button"
                      disabled={statusMutation.isPending || returnMutation.isPending || shipmentMissing || !currentStatusSample}
                      key={nextStatus}
                      onClick={() => {
                        if (!currentStatusSample) return;
                        if (nextStatus === "RETURNED" || nextStatus === "STORED") {
                          returnMutation.mutate(nextStatus);
                          return;
                        }
                        statusMutation.mutate({
                          sampleId: currentStatusSample.id,
                          status: nextStatus,
                          ...(requiresShipmentInfo ? { carrier: statusForm.carrier, trackingNo: statusForm.trackingNo, shippedAt: statusForm.shippedAt } : {}),
                          ...(requiresDeliveryInfo ? { deliveredAt: statusForm.deliveredAt || undefined } : {}),
                          ...(currentStatusSample.status === "DELIVERED" ? { feedback: statusForm.feedback || undefined } : {})
                        });
                      }}
                      type="button"
                    >
                      {statusDialogActionLabel(currentStatus, nextStatus)}
                    </button>
                  );
                  })
              ) : (
                <div className="empty-state">当前状态没有可执行的流转操作。</div>
              )}
            </div>
            {currentStatusSample && statusTransitions.includes("SHIPPED") && currentStatusSample.status === "PREPARING" && (!statusForm.carrier.trim() || !statusForm.trackingNo.trim() || !statusForm.shippedAt.trim()) ? (
              <div className="error-state" style={{ marginTop: 12 }}>
                切换为已寄出前，请先填写物流商、运单号和发货日期。
              </div>
            ) : null}
          </section>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog"
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
        className="crm-action-dialog"
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
        <p>删除后，这条费用记录会从样品中移除，但历史记录会保留。确定要删除费用 {feeDeleting ? feeTypeLabel(feeDeleting.feeType) : ""} 吗？</p>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog"
        title={feeMode === "edit" ? "编辑费用记录" : "填写费用记录"}
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
              <strong>{feeMode === "edit" ? "编辑费用记录" : "填写费用记录"}</strong>
              <span>{feeSample?.productSummary ? `样品 ${feeSample.productSummary}` : "请补充费用信息"}</span>
            </div>
            <span>{feeMode === "edit" ? "修改后将同步更新历史" : "支持记录单条费用"}</span>
          </div>
          <div className="analysis-edit-gap sample-fee-card">
            <div className="sample-fee-card__header">
              <strong>费用信息</strong>
            </div>
            <div className="sample-fee-card__fields">
              <div className="form-field">
                <label>{t("sampleFields.feeType")}</label>
                <select value={feeForm.feeType} onChange={(e) => setFeeForm({ ...feeForm, feeType: e.target.value })}>
                  {FEE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
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
                <input type="date" value={feeForm.incurredAt} onChange={(e) => setFeeForm({ ...feeForm, incurredAt: e.target.value })} />
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
        className="crm-action-dialog"
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
          <div className="task-list">
            {currentHistory.length ? (
              currentHistory.map((item) => (
                <div className="task-row" key={item.id}>
                  <History size={16} />
                  <div>
                    <strong>{historyActionLabel(item)}</strong>
                    <span>
                      {new Date(item.createdAt).toLocaleString()} {item.actorName ?? item.actorId ?? "系统"}
                    </span>
                    {historyDetailText(item) ? <span>{historyDetailText(item)}</span> : null}
                    {item.comment ? <span>{normalizeHistoryComment(item.comment)}</span> : null}
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
        className="crm-action-dialog"
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
    </section>
  );
}
