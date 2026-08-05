import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, ChevronDown, Download, History, MoreHorizontal, Send, XCircle } from "lucide-react";
import {
  calculateQuotePricing,
  quoteFlowStatusLabel
} from "@oem-crm/shared";
import { showClientToast } from "../../../../components/Toast";
import {
  approveQuote,
  createQuote,
  deleteQuote,
  acceptQuote,
  exportQuote,
  exportQuotes,
  getQuoteHistory,
  getQuotes,
  rejectQuote,
  rejectCustomerQuote,
  sendQuote,
  submitQuoteReview,
  updateQuote
} from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import { useI18n } from "../../../../i18n";
import { formatDateInput } from "../../../../shared/utils/format";
import type { Quote, QuoteHistoryItem } from "../shared/types";

const CURRENCY_OPTIONS = ["USD", "CNY", "KRW", "JPY", "MXN"] as const;
const DEFAULT_QUOTE_FORM: { moq: string; quantity: string } = {
  moq: "50",
  quantity: "50"
};
type QuoteCalcMode = "formula" | "direct";
type MaterialFormItem = { name: string; usage: string; unitPrice: string; lossRate: string };
type QuoteReviewMode = "submit" | "approve" | "reject";
type QuoteStatusAction = "send" | "accept" | "rejectCustomer";
type QuoteAmountSnapshotKey = "total" | "unitPrice" | "material" | "processing" | "tax" | "shipping" | "discount";
type QuoteNextAction = {
  type: QuoteReviewMode | QuoteStatusAction;
  label: string;
};

const EMPTY_MATERIAL_ITEM: MaterialFormItem = { name: "", usage: "", unitPrice: "", lossRate: "" };

// 公式模式明细字段初值（新建表单用）
const EMPTY_FORMULA_FIELDS = {
  calcMode: "direct" as "formula" | "direct",
  materialItems: [{ ...EMPTY_MATERIAL_ITEM }],
  materialProfitRate: "",
  processingTime: "",
  processingHourlyRate: "",
  processingProfitRate: "",
  grossWeight: "",
  packageLength: "",
  packageWidth: "",
  packageHeight: "",
  volumeDivisor: "",
  shippingUnitPrice: "",
  vatRate: ""
};

function statusLabel(status: string, locale: Parameters<typeof quoteFlowStatusLabel>[1] = "zh-CN") {
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

function quoteNextActions(item: Quote): QuoteNextAction[] {
  const displayStatus = quoteDisplayStatus(item);
  if (
    item.status !== "VOIDED" &&
    item.status !== "SENT" &&
    item.status !== "ACCEPTED" &&
    item.status !== "EXPIRED" &&
    (item.approvalStatus === "DRAFT" || item.approvalStatus === "REJECTED")
  ) {
    return [{ type: "submit", label: "提交审批" }];
  }
  if (item.status !== "VOIDED" && item.approvalStatus === "PENDING_APPROVAL") {
    return [
      { type: "approve", label: "审批通过" },
      { type: "reject", label: "审批驳回" }
    ];
  }
  if (displayStatus === "APPROVED") {
    return [{ type: "send", label: "发送报价" }];
  }
  if (displayStatus === "SENT") {
    return [
      { type: "accept", label: "客户接受" },
      { type: "rejectCustomer", label: "客户拒绝" }
    ];
  }
  return [];
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

function historyActionLabel(action: string) {
  const labels: Record<string, string> = {
    CREATED: "创建",
    UPDATED: "更新",
    SUBMITTED: "提交审批",
    APPROVED: "审批通过",
    REJECTED: "审批驳回",
    VOIDED: "作废"
  };
  return labels[action] ?? action;
}

function normalizeHistoryComment(comment: string) {
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
    const comment = normalizeHistoryComment(item.comment ?? "");

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

function historyActorLabel(item: QuoteHistoryItem) {
  return item.actorName ?? item.actorId ?? "系统";
}

function toMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildMaterialItemsPayload(items: MaterialFormItem[]) {
  return items
    .map((item) => ({
      name: item.name.trim() || undefined,
      usage: item.usage === "" ? 0 : toMoney(item.usage),
      unitPrice: item.unitPrice === "" ? 0 : toMoney(item.unitPrice),
      lossRate: item.lossRate === "" ? 0 : toMoney(item.lossRate)
    }))
    .filter((item) => item.name || item.usage > 0 || item.unitPrice > 0);
}

function normalizeMaterialFormItems(items: Quote["materialItems"] | null | undefined): MaterialFormItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ ...EMPTY_MATERIAL_ITEM }];
  }
  return items.map((item) => ({
    name: typeof item.name === "string" ? item.name : "",
    usage: item.usage === null || item.usage === undefined ? "" : String(item.usage),
    unitPrice: item.unitPrice === null || item.unitPrice === undefined ? "" : String(item.unitPrice),
    lossRate: item.lossRate === null || item.lossRate === undefined ? "" : String(item.lossRate)
  }));
}

function buildQuotePayload(form: {
  productName: string;
  specification: string;
  moq: string;
  quantity: string;
  materialCost: string;
  processingCost: string;
  taxCost: string;
  shippingCost: string;
  discountAmount: string;
  calcMode: string;
  materialItems: MaterialFormItem[];
  materialProfitRate: string;
  processingTime: string;
  processingHourlyRate: string;
  processingProfitRate: string;
  grossWeight: string;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  volumeDivisor: string;
  shippingUnitPrice: string;
  vatRate: string;
}) {
  return {
    productName: form.productName,
    specification: form.specification || undefined,
    moq: toMoney(form.moq),
    quantity: toMoney(form.quantity),
    materialCost: toMoney(form.materialCost),
    processingCost: toMoney(form.processingCost),
    taxCost: toMoney(form.taxCost),
    shippingCost: toMoney(form.shippingCost),
    discountAmount: toMoney(form.discountAmount),
    calcMode: form.calcMode,
    materialItems: buildMaterialItemsPayload(form.materialItems),
    materialProfitRate: form.materialProfitRate === "" ? undefined : toMoney(form.materialProfitRate),
    processingTime: form.processingTime === "" ? undefined : toMoney(form.processingTime),
    processingHourlyRate: form.processingHourlyRate === "" ? undefined : toMoney(form.processingHourlyRate),
    processingProfitRate: form.processingProfitRate === "" ? undefined : toMoney(form.processingProfitRate),
    grossWeight: form.grossWeight === "" ? undefined : toMoney(form.grossWeight),
    packageLength: form.packageLength === "" ? undefined : toMoney(form.packageLength),
    packageWidth: form.packageWidth === "" ? undefined : toMoney(form.packageWidth),
    packageHeight: form.packageHeight === "" ? undefined : toMoney(form.packageHeight),
    volumeDivisor: form.volumeDivisor === "" ? undefined : toMoney(form.volumeDivisor),
    shippingUnitPrice: form.shippingUnitPrice === "" ? undefined : toMoney(form.shippingUnitPrice),
    vatRate: form.vatRate === "" ? undefined : toMoney(form.vatRate)
  };
}

function buildQuoteEditPayload(form: {
  quoteNo: string;
  currency: string;
  productName: string;
  specification: string;
  moq: string;
  quantity: string;
  materialCost: string;
  processingCost: string;
  taxCost: string;
  shippingCost: string;
  discountAmount: string;
  calcMode: string;
  materialItems: MaterialFormItem[];
  materialProfitRate: string;
  processingTime: string;
  processingHourlyRate: string;
  processingProfitRate: string;
  grossWeight: string;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  volumeDivisor: string;
  shippingUnitPrice: string;
  vatRate: string;
  validUntil: string;
  notes: string;
}) {
  return {
    quoteNo: form.quoteNo,
    currency: form.currency,
    ...buildQuotePayload(form),
    validUntil: form.validUntil || undefined,
    notes: form.notes
  };
}

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

function detailValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function detailMoney(quote: Quote | null | undefined, value: string | number | null | undefined) {
  if (!quote || value === null || value === undefined || value === "") {
    return "-";
  }
  return `${quote.currency} ${value}`;
}

function detailRate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return String(value);
  }
  const percent = `${(normalized * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  return `${value} (${percent})`;
}

function formulaNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return String(value);
  }
  return normalized.toFixed(2).replace(/\.?0+$/, "");
}

function formulaAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return formulaNumber(value);
}

function hasFormulaInput(value: string | number | null | undefined) {
  return value !== null && value !== undefined && value !== "";
}

function quoteToPricingInput(quote: Quote | null) {
  if (!quote) {
    return null;
  }
  return {
    calcMode: quote.calcMode === "formula" ? "formula" as const : "direct" as const,
    materialItems: quote.materialItems ?? [],
    materialProfitRate: quote.materialProfitRate,
    processingTime: quote.processingTime,
    processingHourlyRate: quote.processingHourlyRate,
    processingProfitRate: quote.processingProfitRate,
    grossWeight: quote.grossWeight,
    packageLength: quote.packageLength,
    packageWidth: quote.packageWidth,
    packageHeight: quote.packageHeight,
    volumeDivisor: quote.volumeDivisor,
    shippingUnitPrice: quote.shippingUnitPrice,
    vatRate: quote.vatRate,
    materialCost: quote.materialCost,
    processingCost: quote.processingCost,
    taxCost: quote.taxCost,
    shippingCost: quote.shippingCost,
    discountAmount: quote.discountAmount,
    quantity: quote.quantity,
    moq: quote.moq
  };
}

function rankCurrencyOption(option: string, query: string, index: number) {
  const normalizedQuery = query.trim().toUpperCase();
  if (!normalizedQuery) return index;
  if (option === normalizedQuery) return index - 100;
  if (option.startsWith(normalizedQuery)) return index - 50;
  if (option.includes(normalizedQuery)) return index + 10;
  return index + 100;
}

function CurrencyInput({
  id,
  value,
  onChange
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const options = useMemo(
    () =>
      [...CURRENCY_OPTIONS]
        .map((option, index) => ({ option, index }))
        .sort((left, right) => rankCurrencyOption(left.option, value, left.index) - rankCurrencyOption(right.option, value, right.index))
        .map(({ option }) => option),
    [value]
  );

  return (
    <div ref={wrapperRef} className="currency-combo">
      <input
        aria-controls={id}
        aria-expanded={open}
        autoComplete="off"
        role="combobox"
        value={value}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <div className="currency-combo__menu" id={id} role="listbox">
          {options.map((option) => (
            <button
              className={["currency-combo__option", option === value.toUpperCase() ? "is-active" : ""].filter(Boolean).join(" ")}
              key={option}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              type="button"
            >
              <span>{option}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalcModeSelect({
  id,
  value,
  onChange,
  directLabel,
  formulaLabel
}: {
  id: string;
  value: QuoteCalcMode;
  onChange: (value: QuoteCalcMode) => void;
  directLabel: string;
  formulaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const options = [
    { value: "direct" as const, label: directLabel },
    { value: "formula" as const, label: formulaLabel }
  ];
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div ref={wrapperRef} className={["calc-mode-combo", open ? "is-open" : ""].filter(Boolean).join(" ")}>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="quote-calc-mode-select"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{selected.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="calc-mode-combo__menu" id={id} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={["calc-mode-combo__option", option.value === value ? "is-active" : ""].filter(Boolean).join(" ")}
              key={option.value}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuotePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState({
    quoteNo: `Q-${Date.now()}`,
    productName: "",
    specification: "",
    moq: DEFAULT_QUOTE_FORM.moq,
    quantity: DEFAULT_QUOTE_FORM.quantity,
    currency: "USD",
    materialCost: "",
    processingCost: "",
    taxCost: "",
    shippingCost: "",
    discountAmount: "0",
    ...EMPTY_FORMULA_FIELDS,
    notes: ""
  });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [statusQuote, setStatusQuote] = useState<Quote | null>(null);
  const [editForm, setEditForm] = useState({
    quoteNo: "",
    productName: "",
    specification: "",
    moq: DEFAULT_QUOTE_FORM.moq,
    quantity: DEFAULT_QUOTE_FORM.quantity,
    currency: "",
    materialCost: "",
    processingCost: "",
    taxCost: "",
    shippingCost: "",
    discountAmount: "",
    ...EMPTY_FORMULA_FIELDS,
    notes: "",
    validUntil: ""
  });
  const [historyQuote, setHistoryQuote] = useState<Quote | null>(null);
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null);
  const [expandedAmountSnapshotKey, setExpandedAmountSnapshotKey] = useState<QuoteAmountSnapshotKey | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<QuoteReviewMode>("approve");
  const [reviewQuote, setReviewQuote] = useState<Quote | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [statusAction, setStatusAction] = useState<QuoteStatusAction | null>(null);
  const [moreActionsMenu, setMoreActionsMenu] = useState<{ id: string; top: number; right: number } | null>(null);

  const { data = [] } = useQuery({ queryKey: ["quotes", customerId], queryFn: () => getQuotes<Quote[]>(customerId) });
  const historyQuery = useQuery({
    queryKey: ["quotes", customerId, historyQuote?.id],
    queryFn: () => getQuoteHistory<QuoteHistoryItem[]>(historyQuote?.id ?? ""),
    enabled: Boolean(historyOpen && historyQuote?.id)
  });
  const detailHistoryQuery = useQuery({
    queryKey: ["quotes", customerId, detailQuote?.id],
    queryFn: () => getQuoteHistory<QuoteHistoryItem[]>(detailQuote?.id ?? ""),
    enabled: Boolean(detailOpen && detailQuote?.id)
  });

  const create = useMutation({
    mutationFn: () => {
      if (createValidationMessage) {
        throw new Error(createValidationMessage);
      }
      return createQuote({ ...buildQuotePayload(form), customerId, quoteNo: form.quoteNo, currency: form.currency, notes: form.notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      setForm({
        quoteNo: `Q-${Date.now()}`,
        productName: "",
        specification: "",
        moq: DEFAULT_QUOTE_FORM.moq,
        quantity: DEFAULT_QUOTE_FORM.quantity,
        currency: "USD",
        materialCost: "",
        processingCost: "",
        taxCost: "",
        shippingCost: "",
        discountAmount: "0",
        ...EMPTY_FORMULA_FIELDS,
        notes: ""
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "新增报价失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const submitReview = useMutation({
    mutationFn: ({ quoteId, comment }: { quoteId: string; comment?: string }) => submitQuoteReview(quoteId, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
      closeReview();
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "提交审批失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const approve = useMutation({
    mutationFn: ({ quoteId, comment }: { quoteId: string; comment?: string }) => approveQuote(quoteId, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
      closeReview();
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "审批通过失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const reject = useMutation({
    mutationFn: ({ quoteId, comment }: { quoteId: string; comment?: string }) => rejectQuote(quoteId, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
      closeReview();
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "审批驳回失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const sendAction = useMutation({
    mutationFn: (quoteId: string) => sendQuote(quoteId, {}, { toast: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (statusQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, statusQuote.id] });
      }
      setStatusOpen(false);
      setStatusQuote(null);
      setStatusAction(null);
      showClientToast({
        type: "success",
        title: "发送报价成功",
        message: "报价已发送给客户。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "发送报价失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const acceptAction = useMutation({
    mutationFn: (quoteId: string) => acceptQuote(quoteId, {}, { toast: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (statusQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, statusQuote.id] });
      }
      setStatusOpen(false);
      setStatusQuote(null);
      setStatusAction(null);
      showClientToast({
        type: "success",
        title: "客户接收成功",
        message: "已记录客户接受报价。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "客户接收失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const rejectCustomerAction = useMutation({
    mutationFn: (quoteId: string) => rejectCustomerQuote(quoteId, {}, { toast: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (statusQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, statusQuote.id] });
      }
      setStatusOpen(false);
      setStatusQuote(null);
      setStatusAction(null);
      showClientToast({
        type: "success",
        title: "客户拒绝成功",
        message: "已记录客户拒绝报价。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "客户拒绝失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const update = useMutation({
    mutationFn: async (payload: { basePayload: Record<string, unknown> }) => {
      if (editValidationMessage) {
        throw new Error(editValidationMessage);
      }
      const quoteId = editing?.id ?? "";
      await updateQuote(quoteId, payload.basePayload, { toast: false });
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, editing.id] });
      }
      setEditOpen(false);
      setEditing(null);
      showClientToast({
        type: "success",
        title: "更新报价成功",
        message: "报价信息已保存。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "更新报价失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const remove = useMutation({
    mutationFn: () => deleteQuote(editing?.id ?? "", { toast: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, editing.id] });
      }
      setDeleteOpen(false);
      setEditing(null);
      showClientToast({
        type: "success",
        title: "作废成功",
        message: "报价已作废，但历史记录已保留。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "作废失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const exportMutation = useMutation({
    mutationFn: (quoteId: string) => exportQuote(quoteId),
    onSuccess: async ({ blob, fileName }) => {
      downloadBlob(blob, fileName ?? "quote.csv");
      showClientToast({
        type: "success",
        title: "导出成功",
        message: "报价文件已下载。"
      });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "导出失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const exportAllMutation = useMutation({
    mutationFn: () => exportQuotes(customerId),
    onSuccess: async ({ blob, fileName }) => {
      downloadBlob(blob, fileName ?? `quotes-${customerId}.csv`);
      showClientToast({
        type: "success",
        title: "批量导出成功",
        message: "当前客户的报价表格已下载。"
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

  const openEdit = (item: Quote) => {
    setEditing(item);
    setEditForm({
      quoteNo: item.quoteNo,
      productName: item.productName,
      specification: item.specification ?? "",
      moq: String(item.moq),
      quantity: String(item.quantity),
      currency: item.currency,
      materialCost: String(item.materialCost),
      processingCost: String(item.processingCost),
      taxCost: String(item.taxCost),
      shippingCost: String(item.shippingCost),
      discountAmount: String(item.discountAmount),
      calcMode: (item.calcMode as "formula" | "direct") ?? "direct",
      materialItems: normalizeMaterialFormItems(item.materialItems),
      materialProfitRate: item.materialProfitRate ?? "",
      processingTime: item.processingTime ?? "",
      processingHourlyRate: item.processingHourlyRate ?? "",
      processingProfitRate: item.processingProfitRate ?? "",
      grossWeight: item.grossWeight ?? "",
      packageLength: item.packageLength ?? "",
      packageWidth: item.packageWidth ?? "",
      packageHeight: item.packageHeight ?? "",
      volumeDivisor: item.volumeDivisor ?? "",
      shippingUnitPrice: item.shippingUnitPrice ?? "",
      vatRate: item.vatRate ?? "",
      notes: item.notes ?? "",
      validUntil: item.validUntil ? formatDateInput(new Date(item.validUntil)) : ""
    });
    setEditOpen(true);
  };

  const openStatus = (item: Quote, action: QuoteStatusAction) => {
    setStatusQuote(item);
    setStatusAction(action);
    setStatusOpen(true);
  };

  const openHistory = (item: Quote) => {
    setHistoryQuote(item);
    setHistoryOpen(true);
  };

  const openDetail = (item: Quote) => {
    setDetailQuote(item);
    setExpandedAmountSnapshotKey(null);
    setDetailOpen(true);
  };

  const openDelete = (item: Quote) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  const openReview = (item: Quote, mode: QuoteReviewMode) => {
    setReviewQuote(item);
    setReviewMode(mode);
    setReviewComment(item.approvalComment ?? "");
    setReviewOpen(true);
  };

  const closeReview = () => {
    setReviewOpen(false);
    setReviewQuote(null);
    setReviewComment("");
  };

  const canEditQuote = (item: Quote) => item.status !== "VOIDED";
  const statusQuoteId = statusQuote?.id ?? "";
  const createSummary = calculateQuotePricing(form);
  const editSummary = calculateQuotePricing(editForm);
  const createValidationMessage = !createSummary.moqValid
    ? "报价数量不能小于 MOQ，请先调整数量或起订量。"
    : !createSummary.nonNegativeItemValid
      ? "报价金额项不能为负数，请检查成本、运费或优惠金额。"
      : !createSummary.totalValid
        ? "报价总价不能小于 0，请调整优惠金额或成本项。"
        : "";
  const editValidationMessage = !editSummary.moqValid
    ? "报价数量不能小于 MOQ，请先调整数量或起订量。"
    : !editSummary.nonNegativeItemValid
      ? "报价金额项不能为负数，请检查成本、运费或优惠金额。"
      : !editSummary.totalValid
        ? "报价总价不能小于 0，请调整优惠金额或成本项。"
        : "";
  const detailSnapshot = useMemo(() => {
    const input = quoteToPricingInput(detailQuote);
    return input ? calculateQuotePricing(input) : null;
  }, [detailQuote]);
  const detailQuoteStatus = quoteDisplayStatus(detailQuote);
  const detailQuoteTerminalStatus = QUOTE_TERMINAL_STATUSES.includes(detailQuoteStatus) ? detailQuoteStatus : "";
  const detailQuoteHistory = detailHistoryQuery.data ?? [];
  const quoteHistoryItems = historyQuery.data ?? [];
  const detailQuoteSentAt = quoteHistoryStatusTime(detailQuoteHistory, "SENT");
  const detailQuoteAcceptedAt = quoteHistoryStatusTime(detailQuoteHistory, "ACCEPTED");
  const detailQuoteTerminalAt = detailQuoteTerminalStatus ? quoteHistoryStatusTime(detailQuoteHistory, detailQuoteTerminalStatus) : "";
  const detailQuoteHistoryLoadingValue = detailHistoryQuery.isLoading ? "加载中..." : "";
  const detailQuoteApprovalNote = detailQuote?.approvalComment?.trim() ? `审批备注：${detailQuote.approvalComment.trim()}` : "";
  const detailQuoteTimelineItems = [
    {
      label: statusLabel("DRAFT", locale),
      value: detailQuote?.createdAt ? new Date(detailQuote.createdAt).toLocaleString() : "-",
      done: Boolean(detailQuote),
      current: detailQuoteStatus === "DRAFT",
      danger: false
    },
    {
      label: statusLabel("PENDING_APPROVAL", locale),
      value: detailQuote?.approvalSubmittedAt ? new Date(detailQuote.approvalSubmittedAt).toLocaleString() : detailQuoteStatus === "PENDING_APPROVAL" ? "当前状态" : "未提交",
      done: quoteCoreStatusReached(detailQuoteStatus, "PENDING_APPROVAL"),
      current: detailQuoteStatus === "PENDING_APPROVAL",
      danger: false
    },
    ...(detailQuoteStatus === "REJECTED"
      ? [
          {
            label: statusLabel("REJECTED", locale),
            value: detailQuote?.approvalReviewedAt ? new Date(detailQuote.approvalReviewedAt).toLocaleString() : quoteTimelineDateValue(quoteHistoryStatusTime(detailQuoteHistory, "REJECTED")) || detailQuoteHistoryLoadingValue || statusLabel("REJECTED", locale),
            done: true,
            current: true,
            danger: true,
            note: detailQuoteApprovalNote
          }
        ]
      : []),
    {
      label: statusLabel("APPROVED", locale),
      value: detailQuote?.approvalReviewedAt ? new Date(detailQuote.approvalReviewedAt).toLocaleString() : quoteCoreStatusReached(detailQuoteStatus, "APPROVED") ? "已审批" : "未审批",
      done: quoteCoreStatusReached(detailQuoteStatus, "APPROVED"),
      current: detailQuoteStatus === "APPROVED",
      danger: false,
      note: quoteCoreStatusReached(detailQuoteStatus, "APPROVED") ? detailQuoteApprovalNote : ""
    },
    {
      label: statusLabel("SENT", locale),
      value: quoteCoreStatusReached(detailQuoteStatus, "SENT") ? quoteTimelineDateValue(detailQuoteSentAt) || detailQuoteHistoryLoadingValue || statusLabel("SENT", locale) : "未发送",
      done: quoteCoreStatusReached(detailQuoteStatus, "SENT"),
      current: detailQuoteStatus === "SENT",
      danger: false
    },
    {
      label: statusLabel("ACCEPTED", locale),
      value: detailQuoteStatus === "ACCEPTED" ? quoteTimelineDateValue(detailQuoteAcceptedAt) || detailQuoteHistoryLoadingValue || statusLabel("ACCEPTED", locale) : "未接受",
      done: detailQuoteStatus === "ACCEPTED",
      current: detailQuoteStatus === "ACCEPTED",
      danger: false
    },
    ...(detailQuoteTerminalStatus && !["REJECTED", "ACCEPTED"].includes(detailQuoteTerminalStatus)
      ? [
          {
            label: statusLabel(detailQuoteTerminalStatus, locale),
            value: quoteTimelineDateValue(detailQuoteTerminalAt) || detailQuoteHistoryLoadingValue || statusLabel(detailQuoteTerminalStatus, locale),
            done: true,
            current: true,
            danger: ["CUSTOMER_REJECTED", "REJECTED"].includes(detailQuoteTerminalStatus)
          }
        ]
      : [])
  ];
  const detailQuoteSummary = detailQuote
    ? [
        detailQuote.productName ? `产品 ${detailQuote.productName}` : "未命名产品",
        `金额 ${detailQuote.currency} ${detailQuote.amount}`,
        `单价 ${detailQuote.currency} ${detailQuote.unitPrice}`,
        `数量 ${detailQuote.quantity}`
      ].filter(Boolean).join(" | ")
    : "";
  const detailQuoteBaseItems = [
    { label: "产品名称", value: detailValue(detailQuote?.productName || "未命名产品"), highlight: true },
    { label: "规格", value: detailValue(detailQuote?.specification) },
    { label: "MOQ", value: detailValue(detailQuote?.moq) },
    { label: "数量", value: detailValue(detailQuote?.quantity) },
    { label: "有效期", value: detailQuote?.validUntil ? new Date(detailQuote.validUntil).toLocaleDateString() : "-" },
    { label: "更新时间", value: detailQuote?.updatedAt ? new Date(detailQuote.updatedAt).toLocaleString() : "-" }
  ];
  const detailQuoteAmountItems: Array<{ label: string; value: string; highlight?: boolean; snapshotKey?: QuoteAmountSnapshotKey }> = [
    { label: "报价金额", value: detailMoney(detailQuote, detailQuote?.amount), highlight: true, snapshotKey: "total" },
    { label: "单价", value: detailMoney(detailQuote, detailQuote?.unitPrice), highlight: true, snapshotKey: "unitPrice" },
    { label: "物料价", value: detailMoney(detailQuote, detailQuote?.materialCost), snapshotKey: "material" },
    { label: "加工费", value: detailMoney(detailQuote, detailQuote?.processingCost), snapshotKey: "processing" },
    { label: "税费", value: detailMoney(detailQuote, detailQuote?.taxCost), snapshotKey: "tax" },
    { label: "运费", value: detailMoney(detailQuote, detailQuote?.shippingCost), snapshotKey: "shipping" },
    { label: "优惠金额", value: detailMoney(detailQuote, detailQuote?.discountAmount), snapshotKey: "discount" }
  ];
  const detailQuoteAmountMeta = [
    detailQuote?.calcMode === "formula" ? "公式报价" : "直接报价",
    detailQuote?.createdAt ? `创建于 ${new Date(detailQuote.createdAt).toLocaleString()}` : ""
  ].filter(Boolean).join(" · ");
  const expandedAmountSnapshot = detailQuoteAmountItems.find((item) => item.snapshotKey === expandedAmountSnapshotKey);
  const expandedAmountSnapshotLines = (() => {
    if (!expandedAmountSnapshotKey || !detailQuote || !detailSnapshot) return [];

    if (detailQuote.calcMode !== "formula" || !detailSnapshot.breakdown) {
      if (expandedAmountSnapshotKey === "total") {
        return [{
          label: "总价 = 物料价 + 加工费 + 税费 + 运费 - 优惠金额",
          value: `${formulaAmount(detailQuote.materialCost)} + ${formulaAmount(detailQuote.processingCost)} + ${formulaAmount(detailQuote.taxCost)} + ${formulaAmount(detailQuote.shippingCost)} - ${formulaAmount(detailQuote.discountAmount)} = ${formulaAmount(detailQuote.amount)}`
        }];
      }
      if (expandedAmountSnapshotKey === "unitPrice") {
        return [{
          label: "单价 = 总价 ÷ 数量",
          value: `${formulaAmount(detailQuote.amount)} ÷ ${formulaNumber(detailQuote.quantity)} = ${formulaAmount(detailQuote.unitPrice)}`
        }];
      }
      return [];
    }

    const { breakdown } = detailSnapshot;
    switch (expandedAmountSnapshotKey) {
      case "material":
        return breakdown.materialItems.length ? [
          ...breakdown.materialItems.map((material) => ({
            label: `${material.name}：用量 × 单价 × (1 + 损耗率)`,
            value: `${formulaNumber(material.usage)} × ${formulaAmount(material.unitPrice)} × (1 + ${formulaNumber(material.lossRate)}) = ${formulaAmount(material.cost)}`
          })),
          {
            label: "物料报价 = 物料损耗后成本合计 × (1 + 物料利润率)",
            value: `${formulaAmount(breakdown.materialCost)} × (1 + ${formulaNumber(detailQuote.materialProfitRate)}) = ${formulaAmount(breakdown.materialQuote)}`
          }
        ] : [];
      case "processing":
        return hasFormulaInput(detailQuote.processingTime) && hasFormulaInput(detailQuote.processingHourlyRate) ? [{
          label: "加工费报价 = 加工时间 × 工时费率 × (1 + 利润率)",
          value: `${formulaNumber(detailQuote.processingTime)} × ${formulaAmount(detailQuote.processingHourlyRate)} × (1 + ${formulaNumber(detailQuote.processingProfitRate)}) = ${formulaAmount(breakdown.processingQuote)}`
        }] : [];
      case "shipping":
        return hasFormulaInput(detailQuote.shippingUnitPrice) && (
          hasFormulaInput(detailQuote.grossWeight) || (
            hasFormulaInput(detailQuote.packageLength) &&
            hasFormulaInput(detailQuote.packageWidth) &&
            hasFormulaInput(detailQuote.packageHeight) &&
            hasFormulaInput(detailQuote.volumeDivisor)
          )
        ) ? [
          {
            label: "体积重量 = 长 × 宽 × 高 ÷ 体积系数",
            value: `${formulaNumber(detailQuote.packageLength)} × ${formulaNumber(detailQuote.packageWidth)} × ${formulaNumber(detailQuote.packageHeight)} ÷ ${formulaNumber(detailQuote.volumeDivisor)} = ${formulaNumber(breakdown.volumeWeight)}`
          },
          {
            label: "运费 = Max(毛重, 体积重量) × 运输单位价格",
            value: `Max(${formulaNumber(detailQuote.grossWeight)}, ${formulaNumber(breakdown.volumeWeight)}) × ${formulaAmount(detailQuote.shippingUnitPrice)} = ${formulaAmount(breakdown.shippingCost)}`
          }
        ] : [];
      case "tax":
        return hasFormulaInput(detailQuote.vatRate) ? [{
          label: "税费 = (物料报价 + 加工费报价 + 运费) × 增值税率",
          value: `(${formulaAmount(breakdown.materialQuote)} + ${formulaAmount(breakdown.processingQuote)} + ${formulaAmount(breakdown.shippingCost)}) × ${formulaNumber(detailQuote.vatRate)} = ${formulaAmount(breakdown.taxCost)}`
        }] : [];
      case "total":
        return [{
          label: "总价 = 物料报价 + 加工费报价 + 税费 + 运费 - 优惠金额",
          value: `${formulaAmount(detailSnapshot.materialCost)} + ${formulaAmount(detailSnapshot.processingCost)} + ${formulaAmount(detailSnapshot.taxCost)} + ${formulaAmount(detailSnapshot.shippingCost)} - ${formulaAmount(detailSnapshot.discountAmount)} = ${formulaAmount(detailSnapshot.total)}`
        }];
      case "unitPrice":
        return [{
          label: "单价 = 总价 ÷ 数量",
          value: `${formulaAmount(detailSnapshot.total)} ÷ ${formulaNumber(detailSnapshot.quantity)} = ${formulaAmount(detailSnapshot.unitPrice)}`
        }];
      default:
        return [];
    }
  })();
  const reviewDialogTitle = reviewMode === "submit" ? "提交报价审批" : reviewMode === "approve" ? "通过审批" : "驳回审批";
  const reviewDialogConfirmLabel = reviewMode === "submit" ? "确认提交" : reviewMode === "approve" ? "通过" : "驳回";
  const reviewDialogDescription = reviewMode === "submit" ? "确认提交后，报价将进入待审批状态；备注可留空。" : "备注可留空。";
  const reviewPending = reviewMode === "submit" ? submitReview.isPending : reviewMode === "approve" ? approve.isPending : reject.isPending;
  const statusActionLabel = statusAction === "send" ? "发送报价" : statusAction === "accept" ? "客户接受" : statusAction === "rejectCustomer" ? "客户拒绝" : "";
  const statusActionDescription = statusAction === "send"
    ? "确认后，报价将标记为已发送。"
    : statusAction === "accept"
      ? "确认后，将记录客户已接受当前报价。"
      : statusAction === "rejectCustomer"
        ? "确认后，将记录客户已拒绝当前报价。"
        : "";
  const statusActionPending = statusAction === "send"
    ? sendAction.isPending
    : statusAction === "accept"
      ? acceptAction.isPending
      : statusAction === "rejectCustomer"
        ? rejectCustomerAction.isPending
        : false;

  return (
    <>
    <section className="panel quote-records-panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>报价记录</h2>
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

      {data.length === 0 ? (
        <div className="empty-state">暂无记录</div>
      ) : (
        <div className="quote-record-table-wrap">
          <table className="quote-record-table">
            <thead>
              <tr>
                <th>{t("quoteFields.quoteNo")}</th>
                <th>{t("quoteFields.productName")}</th>
                <th>{t("quoteFields.specification")}</th>
                <th>{t("quoteFields.amount")}</th>
                <th>{t("quoteFields.unitPrice")}</th>
                <th>{t("quoteFields.materialCost")}</th>
                <th>{t("quoteFields.processingCost")}</th>
                <th>{t("quoteFields.taxCost")}</th>
                <th>{t("quoteFields.shipping")}</th>
                <th>{t("quoteFields.discountAmount")}</th>
                <th>{t("quoteFields.quantity")}</th>
                <th>{t("quoteFields.moq")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.createdAt")}</th>
                <th>{t("common.operation")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const nextActions = quoteNextActions(item);
                return (
                <tr key={item.id}>
                  <td>
                    <button className="table-link quote-record-link" onClick={() => openDetail(item)} type="button">
                      {item.quoteNo}
                    </button>
                  </td>
                  <td>
                    <div className="quote-record-product">
                      <strong>{item.productName || "未命名产品"}</strong>
                    </div>
                  </td>
                  <td>{item.specification || "未填写"}</td>
                  <td>{item.amount}</td>
                  <td>{item.unitPrice}</td>
                  <td>{item.materialCost}</td>
                  <td>{item.processingCost}</td>
                  <td>{item.taxCost}</td>
                  <td>{item.shippingCost}</td>
                  <td>{item.discountAmount}</td>
                  <td>{item.quantity}</td>
                  <td>{item.moq}</td>
                  <td>
                    <span className={quoteStatusPillClass(quoteDisplayStatus(item))}>
                      {statusLabel(quoteDisplayStatus(item), locale)}
                    </span>
                  </td>
                  <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="quote-record-actions">
                      <EditIconButton disabled={!canEditQuote(item)} onClick={() => openEdit(item)} />
                      <button
                        className="secondary-button icon-button"
                        disabled={exportMutation.isPending}
                        onClick={() => exportMutation.mutate(item.id)}
                        title="导出当前报价"
                        type="button"
                      >
                        <Download size={14} />
                      </button>
                      <div className="quote-record-more">
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
                          <div className="quote-record-more-layer" onMouseDown={() => setMoreActionsMenu(null)}>
                          <div
                            className="quote-record-more-menu"
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
                            {nextActions.map((action) => (
                              <button
                                key={action.type}
                                onClick={() => {
                                  setMoreActionsMenu(null);
                                  if (action.type === "submit" || action.type === "approve" || action.type === "reject") {
                                    openReview(item, action.type);
                                  } else {
                                    openStatus(item, action.type);
                                  }
                                }}
                                type="button"
                              >
                                {action.type === "submit" || action.type === "send" ? <Send size={14} /> : null}
                                {action.type === "approve" || action.type === "accept" ? <CheckCircle2 size={14} /> : null}
                                {action.type === "reject" || action.type === "rejectCustomer" ? <XCircle size={14} /> : null}
                                <span>{action.label}</span>
                              </button>
                            ))}
                          </div>
                          </div>,
                          document.body
                        ) : null}
                      </div>
                      <DeleteIconButton disabled={item.status === "VOIDED"} label="作废" onClick={() => openDelete(item)} />
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

    <section className="panel quote-create-panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>新增报价</h2>
          <span>填写基础信息与金额明细</span>
        </div>
      </div>
      <div className="form-grid compact-form">
        <Field label={t("quoteFields.quoteNo")} value={form.quoteNo} onChange={(value) => setForm({ ...form, quoteNo: value })} />
        <Field label={t("quoteFields.productName")} value={form.productName} onChange={(value) => setForm({ ...form, productName: value })} />
        <Field label={t("quoteFields.specification")} value={form.specification} onChange={(value) => setForm({ ...form, specification: value })} />
        <Field label={t("quoteFields.moq")} value={form.moq} onChange={(value) => setForm({ ...form, moq: value })} />
        <Field label={t("quoteFields.quantity")} value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <div className="form-field">
          <label>
            <span>{t("quoteFields.currency")}</span>
            <CurrencyInput
              id="quote-currency-create-options"
              value={form.currency}
              onChange={(value) => setForm({ ...form, currency: value })}
            />
          </label>
        </div>
        <div className="form-field">
          <label>
            <span>{t("quoteFields.calcMode")}</span>
            <CalcModeSelect
              id="quote-calc-mode-create-options"
              value={form.calcMode}
              onChange={(value) => setForm({ ...form, calcMode: value })}
              directLabel={t("quoteFields.directMode")}
              formulaLabel={t("quoteFields.formulaMode")}
            />
          </label>
        </div>
        {form.calcMode === "formula" ? (
          <>
            <div className="form-field wide-field quote-formula-section">
              <div className="quote-formula-section__header">
                <strong>{t("quoteFields.materialQuote")}</strong>
                <span>Sum(用量 × 单价 × (1 + 损耗率)) × (1 + 物料利润率)</span>
              </div>
              {form.materialItems.map((material, index) => (
                <div className="quote-material-row" key={`material-${index}`}>
                  <label>
                    <span>{t("quoteFields.materialName").replace("{index}", String(index + 1))}</span>
                    <input
                      placeholder="如 ABS、包装盒"
                      value={material.name}
                      onChange={(event) => setForm({
                        ...form,
                        materialItems: form.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.usage")}</span>
                    <input
                      placeholder="0"
                      type="number"
                      value={material.usage}
                      onChange={(event) => setForm({
                        ...form,
                        materialItems: form.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, usage: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.unitPrice")}</span>
                    <input
                      placeholder="0.00"
                      type="number"
                      value={material.unitPrice}
                      onChange={(event) => setForm({
                        ...form,
                        materialItems: form.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.lossRate")}</span>
                    <input
                      placeholder="0.05"
                      type="number"
                      value={material.lossRate}
                      onChange={(event) => setForm({
                        ...form,
                        materialItems: form.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, lossRate: event.target.value } : item)
                      })}
                    />
                  </label>
                  <button
                    className="secondary-button quote-row-action"
                    disabled={form.materialItems.length <= 1}
                    onClick={() => setForm({ ...form, materialItems: form.materialItems.filter((_, itemIndex) => itemIndex !== index) })}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <div className="quote-formula-grid quote-formula-grid--three">
                <label>
                  <span>{t("quoteFields.materialProfitRate")}</span>
                  <input type="number" placeholder="0.10" value={form.materialProfitRate} onChange={(event) => setForm({ ...form, materialProfitRate: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.materialCostAfterLoss")}</span>
                  <input readOnly value={(createSummary.breakdown?.materialCost ?? 0).toFixed(2)} />
                </label>
                <label>
                  <span>{t("quoteFields.materialQuote")}</span>
                  <input readOnly value={createSummary.materialCost.toFixed(2)} />
                </label>
              </div>
              <button className="secondary-button quote-add-material-button" onClick={() => setForm({ ...form, materialItems: [...form.materialItems, { ...EMPTY_MATERIAL_ITEM }] })} type="button">
                {t("quoteFields.addMaterial")}
              </button>
            </div>

            <div className="form-field wide-field quote-formula-section">
              <div className="quote-formula-section__header">
                <strong>{t("quoteFields.processingCost")}</strong>
                <span>加工时间 × 工时费率 × (1 + 加工利润率)</span>
              </div>
              <div className="quote-formula-grid quote-formula-grid--four">
                <label>
                  <span>{t("quoteFields.processingTime")}</span>
                  <input type="number" value={form.processingTime} onChange={(event) => setForm({ ...form, processingTime: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.hourlyRate")}</span>
                  <input type="number" value={form.processingHourlyRate} onChange={(event) => setForm({ ...form, processingHourlyRate: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.processingProfitRate")}</span>
                  <input type="number" placeholder="0.10" value={form.processingProfitRate} onChange={(event) => setForm({ ...form, processingProfitRate: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.processingQuote")}</span>
                  <input readOnly value={createSummary.processingCost.toFixed(2)} />
                </label>
              </div>
            </div>

            <div className="form-field wide-field quote-formula-section">
              <div className="quote-formula-section__header">
                <strong>{t("quoteFields.shipping")}</strong>
                <span>Max(毛重, 长 × 宽 × 高 ÷ 体积系数) × 运输单位价格</span>
              </div>
              <div className="quote-formula-subtitle">体积重量 = 长 × 宽 × 高 ÷ 体积系数</div>
              <div className="quote-formula-grid quote-formula-grid--four">
                <label>
                  <span>{t("quoteFields.length")}</span>
                  <input type="number" value={form.packageLength} onChange={(event) => setForm({ ...form, packageLength: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.width")}</span>
                  <input type="number" value={form.packageWidth} onChange={(event) => setForm({ ...form, packageWidth: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.height")}</span>
                  <input type="number" value={form.packageHeight} onChange={(event) => setForm({ ...form, packageHeight: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.volumeDivisor")}</span>
                  <input type="number" value={form.volumeDivisor} onChange={(event) => setForm({ ...form, volumeDivisor: event.target.value })} />
                </label>
              </div>
              <div className="quote-formula-subtitle">运费 = Max(毛重, 体积重量) × 运输单位价格</div>
              <div className="quote-formula-grid quote-formula-grid--four">
                <label>
                  <span>{t("quoteFields.volumeWeight")}</span>
                  <input readOnly value={(createSummary.breakdown?.volumeWeight ?? 0).toFixed(2)} />
                </label>
                <label>
                  <span>{t("quoteFields.grossWeight")}</span>
                  <input type="number" value={form.grossWeight} onChange={(event) => setForm({ ...form, grossWeight: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.shippingUnitPrice")}</span>
                  <input type="number" value={form.shippingUnitPrice} onChange={(event) => setForm({ ...form, shippingUnitPrice: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.shipping")}</span>
                  <input readOnly value={createSummary.shippingCost.toFixed(2)} />
                </label>
              </div>
            </div>

            <div className="form-field wide-field quote-formula-section">
              <div className="quote-formula-section__header">
                <strong>{t("quoteFields.taxCost")}</strong>
                <span>(物料报价 + 加工费报价 + 运费) × 增值税率</span>
              </div>
              <div className="quote-formula-grid quote-formula-grid--three">
                <label>
                  <span>{t("quoteFields.taxBase")}</span>
                  <input readOnly value={(createSummary.breakdown?.taxBase ?? 0).toFixed(2)} />
                </label>
                <label>
                  <span>{t("quoteFields.vatRate")}</span>
                  <input type="number" placeholder="0.13" value={form.vatRate} onChange={(event) => setForm({ ...form, vatRate: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.taxCost")}</span>
                  <input readOnly value={createSummary.taxCost.toFixed(2)} />
                </label>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="form-field wide-field quote-formula-section">
              <div className="quote-formula-section__header">
                <strong>{t("quoteFields.directMode")}</strong>
                <span>总价 = 物料价 + 加工费 + 税费 + 运费 - 优惠金额</span>
              </div>
              <div className="quote-formula-grid quote-formula-grid--four">
                <label>
                  <span>{t("quoteFields.materialCost")}</span>
                  <input type="number" value={form.materialCost} onChange={(event) => setForm({ ...form, materialCost: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.processingCost")}</span>
                  <input type="number" value={form.processingCost} onChange={(event) => setForm({ ...form, processingCost: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.taxCost")}</span>
                  <input type="number" value={form.taxCost} onChange={(event) => setForm({ ...form, taxCost: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.shipping")}</span>
                  <input type="number" value={form.shippingCost} onChange={(event) => setForm({ ...form, shippingCost: event.target.value })} />
                </label>
              </div>
            </div>
          </>
        )}

        <div className="form-field wide-field quote-formula-section">
          <div className="quote-formula-section__header">
            <strong>{t("quoteFields.summary")}</strong>
            <span>总价 = 成本合计 - 优惠金额；单价 = 总价 ÷ 数量</span>
          </div>
          <div className="quote-formula-grid quote-formula-grid--three">
            <label>
              <span>{t("quoteFields.discountAmount")}</span>
              <input type="number" value={form.discountAmount} onChange={(event) => setForm({ ...form, discountAmount: event.target.value })} />
            </label>
            <label>
              <span>{t("quoteFields.total")}</span>
              <input readOnly value={createSummary.total.toFixed(2)} />
            </label>
            <label>
              <span>{t("quoteFields.unitPrice")}</span>
              <input readOnly value={createSummary.unitPrice.toFixed(2)} />
            </label>
          </div>
        </div>
        <Field label={t("common.notes")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        {createValidationMessage ? <div className="error-state">{createValidationMessage}</div> : null}
        <div className="wide-field"><AddIconButton disabled={create.isPending || Boolean(createValidationMessage)} label={create.isPending ? t("quoteFields.submitting") : t("quoteFields.createQuote")} onClick={() => create.mutate()} /></div>
      </div>
    </section>

      <Dialog
        v2
        className="crm-action-dialog quote-dialog quote-detail-dialog"
        title={`报价详情 · ${detailQuote?.quoteNo ?? ""}`}
        width="min(1040px, calc(100vw - 48px))"
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDetailOpen(false)} type="button">关闭</button>
          </div>
        )}
      >
        <div className="detail-window sample-detail-window quote-detail-window">
          <section className="sample-detail-summary quote-detail-summary">
            <div>
              <p className="detail-eyebrow">报价单</p>
              <h3>{detailValue(detailQuote?.quoteNo)}</h3>
              <p>{detailQuoteSummary}</p>
            </div>
            <div className="sample-detail-summary__actions">
              <span className={quoteStatusPillClass(detailQuoteStatus)}>{statusLabel(detailQuoteStatus, locale)}</span>
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
              <span>{detailQuoteAmountMeta}</span>
            </div>
            <div className="detail-grid sample-detail-grid quote-amount-grid">
              {detailQuoteAmountItems.map((item) => (
                item.snapshotKey ? (
                  <button
                    aria-controls="quote-amount-snapshot"
                    aria-expanded={expandedAmountSnapshotKey === item.snapshotKey}
                    className={[
                      "detail-card",
                      "sample-detail-card",
                      "quote-amount-card",
                      item.highlight ? "is-highlight" : "",
                      expandedAmountSnapshotKey === item.snapshotKey ? "is-expanded" : ""
                    ].filter(Boolean).join(" ")}
                    key={item.label}
                    onClick={() => setExpandedAmountSnapshotKey((current) => current === item.snapshotKey ? null : item.snapshotKey ?? null)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <ChevronDown aria-hidden="true" size={16} />
                  </button>
                ) : (
                  <div className={item.highlight ? "detail-card sample-detail-card is-highlight" : "detail-card sample-detail-card"} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                )
              ))}
            </div>
            {expandedAmountSnapshot ? (
              <div aria-live="polite" className="quote-amount-snapshot" id="quote-amount-snapshot">
                <div className="quote-amount-snapshot__header">
                  <strong>{expandedAmountSnapshot.label}计算快照</strong>
                  <button aria-label={`收起${expandedAmountSnapshot.label}计算快照`} onClick={() => setExpandedAmountSnapshotKey(null)} type="button">
                    <ChevronDown aria-hidden="true" size={16} />
                  </button>
                </div>
                {expandedAmountSnapshotLines.length ? (
                  <div className="quote-snapshot-formulas">
                    {expandedAmountSnapshotLines.map((item, index) => (
                      <div className="quote-snapshot-formula" key={`${item.label}-${index}`}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : <div className="quote-amount-snapshot__empty">暂无计算快照</div>}
              </div>
            ) : null}
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
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog quote-dialog"
        title={reviewDialogTitle}
        visible={reviewOpen}
        onClose={closeReview}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={closeReview} type="button">取消</button>
            <button
              className="primary-button"
              disabled={reviewPending || !reviewQuote}
              onClick={() => {
                if (!reviewQuote) return;
                const payload = { quoteId: reviewQuote.id, comment: reviewComment.trim() };
                if (reviewMode === "submit") {
                  submitReview.mutate(payload);
                } else if (reviewMode === "approve") {
                  approve.mutate(payload);
                } else {
                  reject.mutate(payload);
                }
              }}
              type="button"
            >
              {reviewPending ? "处理中..." : reviewDialogConfirmLabel}
            </button>
          </div>
        )}
      >
        <div className="analysis-edit-form">
          <div className="detail-note">{reviewDialogDescription}</div>
          <div className="form-field wide-field">
            <label>{t("common.optionalNote")}</label>
            <textarea
              autoFocus
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              rows={4}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog quote-dialog quote-edit-dialog"
        title="编辑报价"
        width="min(1040px, calc(100vw - 48px))"
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">取消</button>
                <button
                  className="primary-button"
                  disabled={update.isPending || Boolean(editValidationMessage)}
                  onClick={() => update.mutate({ basePayload: buildQuoteEditPayload(editForm) })}
                  type="button"
              >
                {update.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        }>
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>{t("quoteFields.quoteNo")}</label>
            <input value={editForm.quoteNo} onChange={(e) => setEditForm({ ...editForm, quoteNo: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.productName")}</label>
            <input value={editForm.productName} onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.specification")}</label>
            <input value={editForm.specification} onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.moq")}</label>
            <input type="number" value={editForm.moq} onChange={(e) => setEditForm({ ...editForm, moq: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.quantity")}</label>
            <input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.currency")}</label>
            <CurrencyInput
              id="quote-currency-edit-options"
              value={editForm.currency}
              onChange={(value) => setEditForm({ ...editForm, currency: value })}
            />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.calcMode")}</label>
            <CalcModeSelect
              id="quote-calc-mode-edit-options"
              value={editForm.calcMode}
              onChange={(value) => setEditForm({ ...editForm, calcMode: value })}
              directLabel={t("quoteFields.directMode")}
              formulaLabel={t("quoteFields.formulaMode")}
            />
          </div>
          {editForm.calcMode === "formula" ? (
            <>
              {editForm.materialItems.map((material, index) => (
                <div className="form-field wide-field quote-material-row" key={`edit-material-${index}`}>
                  <label>
                    <span>{t("quoteFields.materialName").replace("{index}", String(index + 1))}</span>
                    <input
                      placeholder="如 ABS、包装盒"
                      value={material.name}
                      onChange={(event) => setEditForm({
                        ...editForm,
                        materialItems: editForm.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.usage")}</span>
                    <input
                      placeholder="0"
                      type="number"
                      value={material.usage}
                      onChange={(event) => setEditForm({
                        ...editForm,
                        materialItems: editForm.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, usage: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.unitPrice")}</span>
                    <input
                      placeholder="0.00"
                      type="number"
                      value={material.unitPrice}
                      onChange={(event) => setEditForm({
                        ...editForm,
                        materialItems: editForm.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item)
                      })}
                    />
                  </label>
                  <label>
                    <span>{t("quoteFields.lossRate")}</span>
                    <input
                      placeholder="0.05"
                      type="number"
                      value={material.lossRate}
                      onChange={(event) => setEditForm({
                        ...editForm,
                        materialItems: editForm.materialItems.map((item, itemIndex) => itemIndex === index ? { ...item, lossRate: event.target.value } : item)
                      })}
                    />
                  </label>
                  <button
                    className="secondary-button quote-row-action"
                    disabled={editForm.materialItems.length <= 1}
                    onClick={() => setEditForm({ ...editForm, materialItems: editForm.materialItems.filter((_, itemIndex) => itemIndex !== index) })}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <div className="form-field">
                <label>{t("quoteFields.materialRows")}</label>
                <button className="secondary-button" onClick={() => setEditForm({ ...editForm, materialItems: [...editForm.materialItems, { ...EMPTY_MATERIAL_ITEM }] })} type="button">
                  {t("quoteFields.addMaterial")}
                </button>
              </div>
              <div className="form-field">
                <label>{t("quoteFields.materialProfitRateHint")}</label>
                <input type="number" value={editForm.materialProfitRate} onChange={(e) => setEditForm({ ...editForm, materialProfitRate: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.processingTime")}</label>
                <input type="number" value={editForm.processingTime} onChange={(e) => setEditForm({ ...editForm, processingTime: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.processingHourlyRate")}</label>
                <input type="number" value={editForm.processingHourlyRate} onChange={(e) => setEditForm({ ...editForm, processingHourlyRate: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.processingProfitRateHint")}</label>
                <input type="number" value={editForm.processingProfitRate} onChange={(e) => setEditForm({ ...editForm, processingProfitRate: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.grossWeight")}</label>
                <input type="number" value={editForm.grossWeight} onChange={(e) => setEditForm({ ...editForm, grossWeight: e.target.value })} />
              </div>
              <div className="form-field wide-field quote-inline-grid quote-dimension-grid">
                <label>
                  <span>{t("quoteFields.length")}</span>
                  <input type="number" value={editForm.packageLength} onChange={(event) => setEditForm({ ...editForm, packageLength: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.width")}</span>
                  <input type="number" value={editForm.packageWidth} onChange={(event) => setEditForm({ ...editForm, packageWidth: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.height")}</span>
                  <input type="number" value={editForm.packageHeight} onChange={(event) => setEditForm({ ...editForm, packageHeight: event.target.value })} />
                </label>
                <label>
                  <span>{t("quoteFields.volumeDivisor")}</span>
                  <input type="number" value={editForm.volumeDivisor} onChange={(event) => setEditForm({ ...editForm, volumeDivisor: event.target.value })} />
                </label>
              </div>
              <div className="form-field">
                <label>{t("quoteFields.volumeWeight")}</label>
                <input readOnly value={(editSummary.breakdown?.volumeWeight ?? 0).toFixed(2)} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.shippingUnitPrice")}</label>
                <input type="number" value={editForm.shippingUnitPrice} onChange={(e) => setEditForm({ ...editForm, shippingUnitPrice: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.vatRateHint")}</label>
                <input type="number" value={editForm.vatRate} onChange={(e) => setEditForm({ ...editForm, vatRate: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div className="form-field">
                <label>{t("quoteFields.materialCost")}</label>
                <input type="number" value={editForm.materialCost} onChange={(e) => setEditForm({ ...editForm, materialCost: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.processingCost")}</label>
                <input type="number" value={editForm.processingCost} onChange={(e) => setEditForm({ ...editForm, processingCost: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.taxCost")}</label>
                <input type="number" value={editForm.taxCost} onChange={(e) => setEditForm({ ...editForm, taxCost: e.target.value })} />
              </div>
              <div className="form-field">
                <label>{t("quoteFields.shipping")}</label>
                <input type="number" value={editForm.shippingCost} onChange={(e) => setEditForm({ ...editForm, shippingCost: e.target.value })} />
              </div>
            </>
          )}
          <div className="form-field">
            <label>{t("quoteFields.discountAmount")}</label>
            <input type="number" value={editForm.discountAmount} onChange={(e) => setEditForm({ ...editForm, discountAmount: e.target.value })} />
          </div>
          <div className="form-field">
            <label>{t("quoteFields.validUntil")}</label>
            <input type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>{t("common.notes")}</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
          </div>
          <div className="form-field">
            <label>
              <span>{t("quoteFields.unitPrice")}</span>
              <input readOnly value={editSummary.unitPrice.toFixed(2)} />
            </label>
          </div>
          <div className="form-field">
            <label>
              <span>{t("quoteFields.total")}</span>
              <input readOnly value={editSummary.total.toFixed(2)} />
            </label>
          </div>
          {editValidationMessage ? <div className="error-state">{editValidationMessage}</div> : null}
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog quote-dialog"
        title={`${statusActionLabel || "报价状态"} · ${statusQuote?.quoteNo ?? ""}`}
        visible={statusOpen}
        onClose={() => {
          setStatusOpen(false);
          setStatusQuote(null);
          setStatusAction(null);
        }}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button
              className="secondary-button"
              onClick={() => {
                setStatusOpen(false);
                setStatusQuote(null);
                setStatusAction(null);
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
            <div className="detail-note">{statusQuote ? statusLabel(quoteDisplayStatus(statusQuote), locale) : "-"}</div>
          </section>
          {statusAction ? (
            <section className="detail-section">
              <h4>确认操作</h4>
              <div className="detail-note">{statusActionDescription}</div>
              <div className="toolbar">
                <button
                  className={statusAction === "rejectCustomer" ? "secondary-button" : "primary-button"}
                  disabled={statusActionPending || !statusQuote}
                  onClick={() => {
                    if (statusAction === "send") {
                      sendAction.mutate(statusQuoteId);
                    } else if (statusAction === "accept") {
                      acceptAction.mutate(statusQuoteId);
                    } else {
                      rejectCustomerAction.mutate(statusQuoteId);
                    }
                  }}
                  type="button"
                >
                  {statusAction === "send" ? <Send size={14} /> : null}
                  {statusAction === "accept" ? <CheckCircle2 size={14} /> : null}
                  {statusAction === "rejectCustomer" ? <XCircle size={14} /> : null}
                  {statusActionPending ? "处理中..." : `确认${statusActionLabel}`}
                </button>
              </div>
            </section>
          ) : null}
          {statusQuote && !statusAction ? (
            <div className="empty-state">当前状态没有可执行的快速流转操作。</div>
          ) : null}
        </div>
      </Dialog>

      <Dialog v2 className="crm-action-dialog quote-dialog" title="确认删除" visible={deleteOpen} onClose={() => setDeleteOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate()} type="button">{remove.isPending ? "作废中..." : "确认作废"}</button>
          </div>
        }>
        <p>作废后，这条报价会保留历史记录，但不再作为有效报价。确定要作废报价 {editing?.quoteNo} 吗？</p>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog quote-dialog"
        title={`报价历史记录 · ${historyQuote?.quoteNo ?? ""}`}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setHistoryOpen(false)} type="button">关闭</button>
          </div>
        )}
      >
        {historyQuery.isLoading ? <div className="empty-state">正在加载历史记录...</div> : null}
        {historyQuery.isError ? <div className="error-state">历史记录加载失败。</div> : null}
        {!historyQuery.isLoading && !historyQuery.isError ? (
          <div className="history-timeline" aria-label="报价历史时间轴">
            {quoteHistoryItems.length ? quoteHistoryItems.map((item) => (
              <div className="history-timeline__item" key={item.id}>
                <div className="history-timeline__rail" aria-hidden="true">
                  <span className="history-timeline__dot">
                    <History size={14} />
                  </span>
                </div>
                <div className="history-timeline__content">
                  <div className="history-timeline__header">
                    <strong>{historyActionLabel(item.action)}</strong>
                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                  </div>
                  <span className="history-timeline__meta">{historyActorLabel(item)}</span>
                  {item.comment ? <span className="history-timeline__detail">{normalizeHistoryComment(item.comment)}</span> : null}
                </div>
              </div>
            )) : <div className="empty-state">暂无历史记录。</div>}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
