import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { CheckCircle2, Download, History, NotebookTabs, Send, XCircle } from "lucide-react";
import { showClientToast } from "../../../../components/Toast";
import { approveQuote, createQuote, deleteQuote, exportQuote, exportQuotes, getQuoteHistory, getQuotes, rejectQuote, submitQuoteReview, updateQuote } from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import { formatDateInput } from "../../../../shared/utils/format";
import type { Quote, QuoteHistoryItem } from "../shared/types";

const CURRENCY_OPTIONS = ["USD", "CNY", "KRW", "JPY", "MXN"] as const;

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    SENT: "已发送",
    ACCEPTED: "已接受",
    REJECTED: "已拒绝",
    EXPIRED: "已过期",
    VOIDED: "已作废"
  };
  return labels[status] ?? status;
}

function approvalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "待提交",
    PENDING_APPROVAL: "审批中",
    APPROVED: "已审批",
    REJECTED: "已驳回"
  };
  return labels[status] ?? status;
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

function toMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    discountAmount: toMoney(form.discountAmount)
  };
}

function calculateQuoteSummary(form: {
  moq: string;
  quantity: string;
  materialCost: string;
  processingCost: string;
  taxCost: string;
  shippingCost: string;
  discountAmount: string;
}) {
  const total = toMoney(form.materialCost) + toMoney(form.processingCost) + toMoney(form.taxCost) + toMoney(form.shippingCost) - toMoney(form.discountAmount);
  const quantity = Math.max(toMoney(form.quantity), 0);
  const moq = Math.max(toMoney(form.moq), 0);
  const unitPrice = quantity > 0 ? total / quantity : 0;
  return {
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    unitPrice: Math.round((unitPrice + Number.EPSILON) * 100) / 100,
    quantity,
    moq,
    moqValid: quantity === 0 || moq === 0 ? true : quantity >= moq
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

export function QuotePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    quoteNo: `Q-${Date.now()}`,
    productName: "",
    specification: "",
    moq: "1",
    quantity: "1",
    currency: "USD",
    materialCost: "",
    processingCost: "",
    taxCost: "",
    shippingCost: "",
    discountAmount: "0",
    notes: ""
  });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [editForm, setEditForm] = useState({
    quoteNo: "",
    productName: "",
    specification: "",
    moq: "1",
    quantity: "1",
    currency: "",
    materialCost: "",
    processingCost: "",
    taxCost: "",
    shippingCost: "",
    discountAmount: "",
    notes: "",
    validUntil: ""
  });
  const [historyQuote, setHistoryQuote] = useState<Quote | null>(null);

  const { data = [] } = useQuery({ queryKey: ["quotes", customerId], queryFn: () => getQuotes<Quote[]>(customerId) });
  const historyQuery = useQuery({
    queryKey: ["quotes", customerId, historyQuote?.id],
    queryFn: () => getQuoteHistory<QuoteHistoryItem[]>(historyQuote?.id ?? ""),
    enabled: Boolean(historyOpen && historyQuote?.id)
  });

  const create = useMutation({
    mutationFn: () => createQuote({ ...buildQuotePayload(form), customerId, quoteNo: form.quoteNo, currency: form.currency, notes: form.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      setForm({
        quoteNo: `Q-${Date.now()}`,
        productName: "",
        specification: "",
        moq: "1",
        quantity: "1",
        currency: "USD",
        materialCost: "",
        processingCost: "",
        taxCost: "",
        shippingCost: "",
        discountAmount: "0",
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
    mutationFn: (quoteId: string) => submitQuoteReview(quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
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
    mutationFn: (quoteId: string) => approveQuote(quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
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
    mutationFn: (quoteId: string) => rejectQuote(quoteId, { comment: "审批驳回" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (historyQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, historyQuote.id] });
      }
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "审批驳回失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateQuote(editing?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ["quotes", customerId, editing.id] });
      }
      setEditOpen(false);
      setEditing(null);
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
      notes: item.notes ?? "",
      validUntil: item.validUntil ? formatDateInput(new Date(item.validUntil)) : ""
    });
    setEditOpen(true);
  };

  const openHistory = (item: Quote) => {
    setHistoryQuote(item);
    setHistoryOpen(true);
  };

  const openDelete = (item: Quote) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  const canSubmitReview = (item: Quote) => item.status !== "VOIDED" && (item.approvalStatus === "DRAFT" || item.approvalStatus === "REJECTED");
  const canReview = (item: Quote) => item.status !== "VOIDED" && item.approvalStatus === "PENDING_APPROVAL";
  const canEditQuote = (item: Quote) => item.status !== "VOIDED";
  const createSummary = calculateQuoteSummary(form);
  const editSummary = calculateQuoteSummary(editForm);

  return (
    <section className="panel">
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
        <div className="empty-state">当前还没有报价记录。</div>
      ) : (
        <div className="task-list">
          {data.map((item) => (
            <div className="task-row" key={item.id}>
              <NotebookTabs size={16} />
              <div>
                <strong>{item.quoteNo} · {item.productName || "未命名产品"} · {item.currency} {item.amount}</strong>
                <span>{statusLabel(item.status)} · {approvalStatusLabel(item.approvalStatus)} · {new Date(item.createdAt).toLocaleDateString()}   |   </span>
                <span>规格 {item.specification || "未填写"} · MOQ {item.moq} · 数量 {item.quantity} · 单价 {item.unitPrice}   |   </span>
                <span>物料 {item.materialCost} + 加工 {item.processingCost} + 税费 {item.taxCost} + 运费 {item.shippingCost} - 优惠 {item.discountAmount}=总价{item.amount}</span>
              </div>
              <div className="contact-row-actions">
                <EditIconButton disabled={!canEditQuote(item)} onClick={() => openEdit(item)} />
                <button className="secondary-button icon-button" onClick={() => openHistory(item)} title="历史" type="button">
                  <History size={14} />
                </button>
                <button
                  className="secondary-button icon-button"
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate(item.id)}
                  title="导出当前报价"
                  type="button"
                >
                  <Download size={14} />
                </button>
                <button
                  className="secondary-button icon-button"
                  disabled={!canSubmitReview(item) || submitReview.isPending}
                  onClick={() => submitReview.mutate(item.id)}
                  title="提交审批流"
                  type="button"
                >
                  <Send size={14} />
                </button>
                <button
                  className="secondary-button icon-button"
                  disabled={!canReview(item) || approve.isPending}
                  onClick={() => approve.mutate(item.id)}
                  title="通过审批"
                  type="button"
                >
                  <CheckCircle2 size={14} />
                </button>
                <button
                  className="secondary-button icon-button"
                  disabled={!canReview(item) || reject.isPending}
                  onClick={() => reject.mutate(item.id)}
                  title="驳回审批"
                  type="button"
                >
                  <XCircle size={14} />
                </button>
                <DeleteIconButton disabled={item.status === "VOIDED"} label="作废" onClick={() => openDelete(item)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form-grid compact-form">
        <Field label="报价编号" value={form.quoteNo} onChange={(value) => setForm({ ...form, quoteNo: value })} />
        <Field label="产品名" value={form.productName} onChange={(value) => setForm({ ...form, productName: value })} />
        <Field label="规格" value={form.specification} onChange={(value) => setForm({ ...form, specification: value })} />
        <Field label="MOQ" value={form.moq} onChange={(value) => setForm({ ...form, moq: value })} />
        <Field label="报价数量" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <div className="form-field">
          <label>
            <span>币种</span>
            <CurrencyInput
              id="quote-currency-create-options"
              value={form.currency}
              onChange={(value) => setForm({ ...form, currency: value })}
            />
          </label>
        </div>
        <Field label="物料价" value={form.materialCost} onChange={(value) => setForm({ ...form, materialCost: value })} />
        <Field label="加工费" value={form.processingCost} onChange={(value) => setForm({ ...form, processingCost: value })} />
        <Field label="税费" value={form.taxCost} onChange={(value) => setForm({ ...form, taxCost: value })} />
        <Field label="运费" value={form.shippingCost} onChange={(value) => setForm({ ...form, shippingCost: value })} />
        <Field label="优惠金额" value={form.discountAmount} onChange={(value) => setForm({ ...form, discountAmount: value })} />
        <Field label="备注" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="form-field">
          <label>
            <span>单价</span>
            <input readOnly value={createSummary.unitPrice.toFixed(2)} />
          </label>
        </div>
        <div className="form-field">
          <label>
            <span>计算总价</span>
            <input readOnly value={createSummary.total.toFixed(2)} />
          </label>
        </div>
        {!createSummary.moqValid ? <div className="error-state">报价数量不能小于 MOQ，请先调整数量或起订量。</div> : null}
        <div><AddIconButton disabled={create.isPending || !createSummary.moqValid} label={create.isPending ? "提交中..." : "新增报价"} onClick={() => create.mutate()} /></div>
      </div>

      <Dialog v2 className="crm-action-dialog" title="编辑报价" visible={editOpen} onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">取消</button>
            <button
              className="primary-button"
              disabled={update.isPending || !editSummary.moqValid}
              onClick={() => update.mutate({
                quoteNo: editForm.quoteNo,
                currency: editForm.currency,
                ...buildQuotePayload(editForm),
                validUntil: editForm.validUntil || undefined,
                notes: editForm.notes
              })}
              type="button"
            >
              {update.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        }>
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>报价编号</label>
            <input value={editForm.quoteNo} onChange={(e) => setEditForm({ ...editForm, quoteNo: e.target.value })} />
          </div>
          <div className="form-field">
            <label>产品名</label>
            <input value={editForm.productName} onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })} />
          </div>
          <div className="form-field">
            <label>规格</label>
            <input value={editForm.specification} onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })} />
          </div>
          <div className="form-field">
            <label>MOQ</label>
            <input type="number" value={editForm.moq} onChange={(e) => setEditForm({ ...editForm, moq: e.target.value })} />
          </div>
          <div className="form-field">
            <label>报价数量</label>
            <input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
          </div>
          <div className="form-field">
            <label>币种</label>
            <CurrencyInput
              id="quote-currency-edit-options"
              value={editForm.currency}
              onChange={(value) => setEditForm({ ...editForm, currency: value })}
            />
          </div>
          <div className="form-field">
            <label>物料价</label>
            <input type="number" value={editForm.materialCost} onChange={(e) => setEditForm({ ...editForm, materialCost: e.target.value })} />
          </div>
          <div className="form-field">
            <label>加工费</label>
            <input type="number" value={editForm.processingCost} onChange={(e) => setEditForm({ ...editForm, processingCost: e.target.value })} />
          </div>
          <div className="form-field">
            <label>税费</label>
            <input type="number" value={editForm.taxCost} onChange={(e) => setEditForm({ ...editForm, taxCost: e.target.value })} />
          </div>
          <div className="form-field">
            <label>运费</label>
            <input type="number" value={editForm.shippingCost} onChange={(e) => setEditForm({ ...editForm, shippingCost: e.target.value })} />
          </div>
          <div className="form-field">
            <label>优惠金额</label>
            <input type="number" value={editForm.discountAmount} onChange={(e) => setEditForm({ ...editForm, discountAmount: e.target.value })} />
          </div>
          <div className="form-field">
            <label>有效期</label>
            <input type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>备注</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
          </div>
          <div className="form-field">
            <label>
              <span>单价</span>
              <input readOnly value={editSummary.unitPrice.toFixed(2)} />
            </label>
          </div>
          <div className="form-field">
            <label>
              <span>计算总价</span>
              <input readOnly value={editSummary.total.toFixed(2)} />
            </label>
          </div>
          {!editSummary.moqValid ? <div className="error-state">报价数量不能小于 MOQ，请先调整数量或起订量。</div> : null}
        </div>
      </Dialog>

      <Dialog v2 className="crm-action-dialog" title="确认删除" visible={deleteOpen} onClose={() => setDeleteOpen(false)}
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
        className="crm-action-dialog"
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
          <div className="task-list">
            {(historyQuery.data ?? []).length ? (historyQuery.data ?? []).map((item) => (
              <div className="task-row" key={item.id}>
                <History size={16} />
                <div>
                  <strong>{historyActionLabel(item.action)}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()} · {item.actorName ?? item.actorId ?? "系统"}</span>
                  {item.comment ? <span>{item.comment}</span> : null}
                </div>
              </div>
            )) : <div className="empty-state">暂无历史记录。</div>}
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
