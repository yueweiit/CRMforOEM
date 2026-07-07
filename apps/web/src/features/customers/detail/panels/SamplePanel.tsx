import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, History, NotebookTabs, Plus, Undo2 } from "lucide-react";
import { showClientToast } from "../../../../components/Toast";
import {
  createSample,
  deleteSample,
  getSampleHistory,
  getQuotes,
  getSamples,
  recordSampleFee,
  recordSampleReturn,
  updateSample
} from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import { formatDateInput } from "../../../../shared/utils/format";
import type { Quote, Sample, SampleHistoryItem } from "../shared/types";

const SAMPLE_STATUSES = [
  "REQUESTED",
  "APPROVING",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "FEEDBACK_RECEIVED",
  "RETURNED",
  "STORED",
  "VOIDED",
  "CLOSED"
] as const;

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

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "待申请",
    APPROVING: "待审核",
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

function historyActionLabel(action: string) {
  const labels: Record<string, string> = {
    CREATED: "创建",
    UPDATED: "更新",
    STATUS_CHANGED: "状态变更",
    FEE_ADDED: "费用记录",
    QUOTE_LINKED: "关联报价",
    RETURNED: "归还",
    STORED: "留样",
    VOIDED: "作废",
    CLOSED: "关闭"
  };
  return labels[action] ?? action;
}

function feeTypeLabel(type: string) {
  return FEE_TYPES.find((item) => item.value === type)?.label ?? type;
}

function returnTypeLabel(type: string) {
  return RETURN_TYPES.find((item) => item.value === type)?.label ?? type;
}

function statusCodeLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "待申请",
    APPROVING: "待审核",
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
  if (comment.startsWith("Sample status changed to ")) {
    const status = comment.slice("Sample status changed to ".length).trim();
    return `样品状态变更为 ${statusCodeLabel(status)}`;
  }
  return comment;
}

function historyDetailText(item: SampleHistoryItem) {
  if (item.action !== "FEE_ADDED") {
    return "";
  }
  const after = item.after as Record<string, unknown> | null | undefined;
  const feeType = typeof after?.feeType === "string" ? after.feeType : "";
  const amount = Number(after?.amount ?? NaN);
  const currency = typeof after?.currency === "string" ? after.currency : "";
  const incurredAt = typeof after?.incurredAt === "string" ? after.incurredAt : "";
  const note = typeof after?.note === "string" ? after.note : "";
  const segments = [
    feeType ? `费用类型 ${feeTypeLabel(feeType)}` : "",
    Number.isFinite(amount) ? `金额 ${formatMoney(amount, currency)}` : "",
    incurredAt ? `发生于 ${new Date(incurredAt).toLocaleDateString()}` : "",
    note ? `备注 ${note}` : ""
  ].filter(Boolean);
  return segments.join(" · ");
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
  return (sample.sampleFees ?? []).reduce((total, fee) => total + Number(fee.amount || 0), 0);
}

function latestReturnRecord(sample: Sample) {
  return sample.returnRecords?.[0] ?? null;
}

function allowedTransitions(status: string) {
  const transitions: Record<string, string[]> = {
    REQUESTED: ["APPROVING", "VOIDED"],
    APPROVING: ["PREPARING", "VOIDED"],
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

function buildCreatePayload(customerId: string, form: {
  productSummary: string;
  quoteId: string;
}) {
  return {
    customerId,
    productSummary: form.productSummary,
    quoteId: form.quoteId || undefined
  };
}

function buildUpdatePayload(form: {
  productSummary: string;
  quoteId: string;
  carrier: string;
  trackingNo: string;
  status: string;
  shippedAt: string;
  deliveredAt: string;
  feedback: string;
}) {
  return {
    productSummary: form.productSummary,
    quoteId: form.quoteId || undefined,
    carrier: form.carrier || undefined,
    trackingNo: form.trackingNo || undefined,
    status: form.status,
    shippedAt: form.shippedAt || undefined,
    deliveredAt: form.deliveredAt || undefined,
    feedback: form.feedback || undefined
  };
}

function shippingValidationMessage(form: {
  status: string;
  carrier: string;
  trackingNo: string;
}) {
  if (form.status !== "SHIPPED") {
    return "";
  }
  if (!form.carrier.trim() || !form.trackingNo.trim()) {
    return "样品寄出时必须填写物流商和运单号。";
  }
  return "";
}

export function SamplePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState({ productSummary: "", quoteId: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [feeSample, setFeeSample] = useState<Sample | null>(null);
  const [returnSample, setReturnSample] = useState<Sample | null>(null);
  const [historySample, setHistorySample] = useState<Sample | null>(null);
  const [editForm, setEditForm] = useState({
    productSummary: "",
    quoteId: "",
    carrier: "",
    trackingNo: "",
    status: "",
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

  const data = samplesQuery.data ?? [];
  const quoteOptions = quotesQuery.data ?? [];

  const refreshSamples = () => {
    queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
  };

  const create = useMutation({
    mutationFn: () => createSample(buildCreatePayload(customerId, createForm) as never),
    onSuccess: () => {
      refreshSamples();
      setCreateForm({ productSummary: "", quoteId: "" });
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
      const message = shippingValidationMessage(editForm);
      if (message) {
        throw new Error(message);
      }
      return updateSample(editing?.id ?? "", buildUpdatePayload(editForm) as never);
    },
    onSuccess: () => {
      refreshSamples();
      setEditOpen(false);
      setEditing(null);
      showClientToast({ type: "success", title: "样品已更新", message: "样品信息和状态已保存。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "更新样品失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const approve = useMutation({
    mutationFn: (item: Sample) => updateSample(item.id, { status: "PREPARING" }),
    onSuccess: () => {
      refreshSamples();
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

  const feeMutation = useMutation({
    mutationFn: () => recordSampleFee(feeSample?.id ?? "", { ...feeForm, amount: toNumber(feeForm.amount), incurredAt: feeForm.incurredAt || undefined }),
    onSuccess: () => {
      refreshSamples();
      setFeeOpen(false);
      setFeeSample(null);
      setFeeForm({ feeType: "SAMPLE_MAKING", amount: "", currency: "USD", note: "", incurredAt: formatDateInput(new Date()) });
      showClientToast({ type: "success", title: "费用已记录", message: "样品费用已写入台账。" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "记录费用失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      recordSampleReturn(returnSample?.id ?? "", {
        ...returnForm,
        returnType: returnForm.returnType,
        recordedAt: returnForm.recordedAt || undefined
      }),
    onSuccess: () => {
      refreshSamples();
      setReturnOpen(false);
      setReturnSample(null);
      setReturnForm({
        returnType: "RETURNED",
        receiverName: "",
        destination: "",
        note: "",
        recordedAt: formatDateInput(new Date())
      });
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
      quoteId: item.quoteId ?? "",
      carrier: item.carrier ?? "",
      trackingNo: item.trackingNo ?? "",
      status: item.status,
      shippedAt: item.shippedAt ? formatDateInput(new Date(item.shippedAt)) : "",
      deliveredAt: item.deliveredAt ? formatDateInput(new Date(item.deliveredAt)) : "",
      feedback: item.feedback ?? ""
    });
    setEditOpen(true);
  };

  const openFee = (item: Sample) => {
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

  const openReturn = (item: Sample) => {
    setReturnSample(item);
    setReturnForm({
      returnType: item.status === "STORED" ? "STORED" : "RETURNED",
      receiverName: "",
      destination: "",
      note: "",
      recordedAt: formatDateInput(new Date())
    });
    setReturnOpen(true);
  };

  const openHistory = (item: Sample) => {
    setHistorySample(item);
    setHistoryOpen(true);
  };

  const openDelete = (item: Sample) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  const canEdit = (item: Sample) => item.status !== "VOIDED" && item.status !== "CLOSED";
  const canApprove = (item: Sample) => item.status === "APPROVING";
  const canFee = (item: Sample) => item.status !== "VOIDED";
  const canReturn = (item: Sample) => ["SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED"].includes(item.status);
  const canDelete = (item: Sample) => item.status !== "VOIDED" && item.status !== "CLOSED";
  const currentHistory = historyQuery.data ?? [];
  const shippingMessage = shippingValidationMessage(editForm);

  return (
    <section className="panel">
      <div className="panel-title">
        <div className="quote-panel-title">
          <h2>样品记录</h2>
          <span>{data.length} 条</span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="empty-state">当前还没有样品记录。</div>
      ) : (
        <div className="task-list">
          {data.map((item) => {
            const feeTotal = sampleFeeTotal(item);
            const lastReturn = latestReturnRecord(item);
            const lastFee = item.sampleFees?.[0] ?? null;
            return (
              <div className="task-row" key={item.id}>
                <NotebookTabs size={16} />
                <div>
                  <strong>
                    {item.productSummary}
                    {item.quote ? ` · 关联报价 ${item.quote.quoteNo}` : ""}
                    {item.quote?.productName ? ` · ${item.quote.productName}` : ""}
                  </strong>
                  <span>
                    {statusLabel(item.status)} {item.quote?.status ? `报价 ${item.quote.status}` : "未关联报价"} 费用 {formatMoney(feeTotal, item.quote?.currency ?? item.sampleFees?.[0]?.currency)} {item.trackingNo ? `运单 ${item.trackingNo}` : "未填运单"} {item.carrier ? `物流 ${item.carrier}` : ""}
                  </span>
                  <span>
                    {item.shippedAt ? `发货 ${new Date(item.shippedAt).toLocaleDateString()}` : "未发货"} {item.deliveredAt ? `签收 ${new Date(item.deliveredAt).toLocaleDateString()}` : ""} {lastReturn ? `${returnTypeLabel(lastReturn.returnType)} ${new Date(lastReturn.recordedAt).toLocaleDateString()}` : ""} {lastFee ? `${feeTypeLabel(lastFee.feeType)} ${formatMoney(Number(lastFee.amount), lastFee.currency)}` : ""} {item.feedback ? `反馈 ${item.feedback}` : ""}
                  </span>
                </div>
                <div className="contact-row-actions">
                  <EditIconButton disabled={!canEdit(item)} onClick={() => openEdit(item)} />
                  <button className="secondary-button icon-button" onClick={() => openHistory(item)} title="历史" type="button">
                    <History size={14} />
                  </button>
                  <button className="secondary-button icon-button" disabled={!canApprove(item) || approve.isPending} onClick={() => approve.mutate(item)} title="审核通过" type="button">
                    <CheckCircle2 size={14} />
                  </button>
                  <button className="secondary-button icon-button" disabled={!canFee(item)} onClick={() => openFee(item)} title="记录费用" type="button">
                    <Plus size={14} />
                  </button>
                  <button className="secondary-button icon-button" disabled={!canReturn(item)} onClick={() => openReturn(item)} title="归还/留样" type="button">
                    <Undo2 size={14} />
                  </button>
                  <DeleteIconButton disabled={!canDelete(item)} onClick={() => openDelete(item)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="form-grid compact-form">
        <Field label="样品/产品" value={createForm.productSummary} onChange={(value) => setCreateForm({ ...createForm, productSummary: value })} />
        <div className="form-field">
          <label>
            <span>关联报价</span>
            <select value={createForm.quoteId} onChange={(e) => setCreateForm({ ...createForm, quoteId: e.target.value })}>
              <option value="">不关联</option>
              {quoteOptions.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.quoteNo} · {quote.productName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <AddIconButton
            disabled={create.isPending || !createForm.productSummary.trim()}
            label={create.isPending ? "提交中..." : "新增样品"}
            onClick={() => create.mutate()}
          />
        </div>
      </div>

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
              {update.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>样品/产品</label>
            <input value={editForm.productSummary} onChange={(e) => setEditForm({ ...editForm, productSummary: e.target.value })} />
          </div>
          <div className="form-field">
            <label>关联报价</label>
            <select value={editForm.quoteId} onChange={(e) => setEditForm({ ...editForm, quoteId: e.target.value })}>
              <option value="">不关联</option>
              {quoteOptions.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.quoteNo} · {quote.productName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>状态</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {SAMPLE_STATUSES.map((status) => (
                <option key={status} value={status} disabled={status !== editForm.status && !allowedTransitions(editing?.status ?? "").includes(status)}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>物流商</label>
            <input value={editForm.carrier} onChange={(e) => setEditForm({ ...editForm, carrier: e.target.value })} />
          </div>
          <div className="form-field">
            <label>运单号</label>
            <input value={editForm.trackingNo} onChange={(e) => setEditForm({ ...editForm, trackingNo: e.target.value })} />
          </div>
          {shippingMessage ? <div className="error-state">{shippingMessage}</div> : null}
          <div className="form-field">
            <label>发货日期</label>
            <input type="date" value={editForm.shippedAt} onChange={(e) => setEditForm({ ...editForm, shippedAt: e.target.value })} />
          </div>
          <div className="form-field">
            <label>签收日期</label>
            <input type="date" value={editForm.deliveredAt} onChange={(e) => setEditForm({ ...editForm, deliveredAt: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>反馈</label>
            <textarea value={editForm.feedback} onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })} rows={3} />
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog"
        title="记录样品费用"
        visible={feeOpen}
        onClose={() => setFeeOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setFeeOpen(false)} type="button">
              取消
            </button>
            <button className="primary-button" disabled={feeMutation.isPending} onClick={() => feeMutation.mutate()} type="button">
              {feeMutation.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>费用类型</label>
            <select value={feeForm.feeType} onChange={(e) => setFeeForm({ ...feeForm, feeType: e.target.value })}>
              {FEE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>金额</label>
            <input type="number" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} />
          </div>
          <div className="form-field">
            <label>币种</label>
            <input value={feeForm.currency} onChange={(e) => setFeeForm({ ...feeForm, currency: e.target.value })} />
          </div>
          <div className="form-field">
            <label>发生日期</label>
            <input type="date" value={feeForm.incurredAt} onChange={(e) => setFeeForm({ ...feeForm, incurredAt: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>备注</label>
            <textarea value={feeForm.note} onChange={(e) => setFeeForm({ ...feeForm, note: e.target.value })} rows={3} />
          </div>
        </div>
      </Dialog>

      <Dialog
        v2
        className="crm-action-dialog"
        title="归还 / 留样"
        visible={returnOpen}
        onClose={() => setReturnOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setReturnOpen(false)} type="button">
              取消
            </button>
            <button className="primary-button" disabled={returnMutation.isPending} onClick={() => returnMutation.mutate()} type="button">
              {returnMutation.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        }
      >
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>动作类型</label>
            <select value={returnForm.returnType} onChange={(e) => setReturnForm({ ...returnForm, returnType: e.target.value })}>
              {RETURN_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>接收人</label>
            <input value={returnForm.receiverName} onChange={(e) => setReturnForm({ ...returnForm, receiverName: e.target.value })} />
          </div>
          <div className="form-field">
            <label>去向</label>
            <input value={returnForm.destination} onChange={(e) => setReturnForm({ ...returnForm, destination: e.target.value })} />
          </div>
          <div className="form-field">
            <label>记录日期</label>
            <input type="date" value={returnForm.recordedAt} onChange={(e) => setReturnForm({ ...returnForm, recordedAt: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>备注</label>
            <textarea value={returnForm.note} onChange={(e) => setReturnForm({ ...returnForm, note: e.target.value })} rows={3} />
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
                    <strong>{historyActionLabel(item.action)}</strong>
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
