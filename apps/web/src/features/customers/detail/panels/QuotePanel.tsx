import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { NotebookTabs } from "lucide-react";
import { showClientToast } from "../../../../components/Toast";
import { createQuote, deleteQuote, getQuotes, updateQuote } from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import type { Quote } from "../shared/types";

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    SENT: "已发送",
    ACCEPTED: "已接受",
    REJECTED: "已拒绝",
    EXPIRED: "已过期"
  };
  return labels[status] ?? status;
}

export function QuotePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ quoteNo: `Q-${Date.now()}`, currency: "USD", amount: "", notes: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [editForm, setEditForm] = useState({ quoteNo: "", currency: "", amount: "", notes: "", status: "" });

  const { data = [] } = useQuery({ queryKey: ["quotes", customerId], queryFn: () => getQuotes<Quote[]>(customerId) });

  const create = useMutation({
    mutationFn: () => createQuote({ ...form, customerId, amount: Number(form.amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      setForm({ quoteNo: `Q-${Date.now()}`, currency: "USD", amount: "", notes: "" });
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "新增报价失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateQuote(editing?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
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
    mutationFn: () => deleteQuote(editing?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", customerId] });
      setDeleteOpen(false);
      setEditing(null);
    }
  });

  const openEdit = (item: Quote) => {
    setEditing(item);
    setEditForm({
      quoteNo: item.quoteNo,
      currency: item.currency,
      amount: String(item.amount),
      notes: item.notes ?? "",
      status: item.status
    });
    setEditOpen(true);
  };

  const openDelete = (item: Quote) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  return (
    <section className="panel">
      <div className="panel-title"><h2>报价记录</h2><span>{data.length} 条</span></div>

      {data.length === 0 ? (
        <div className="empty-state">暂无报价记录。</div>
      ) : (
        <div className="task-list">
          {data.map((item) => (
            <div className="task-row" key={item.id}>
              <NotebookTabs size={16} />
              <div>
                <strong>{item.quoteNo} · {item.currency} {item.amount}</strong>
                <span>{statusLabel(item.status)} · {new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="contact-row-actions">
                <EditIconButton onClick={() => openEdit(item)} />
                <DeleteIconButton onClick={() => openDelete(item)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form-grid compact-form">
        <Field label="报价编号" value={form.quoteNo} onChange={(value) => setForm({ ...form, quoteNo: value })} />
        <Field label="币种" value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} />
        <Field label="金额" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
        <Field label="备注" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div><AddIconButton disabled={create.isPending} label={create.isPending ? "提交中..." : "新增报价"} onClick={() => create.mutate()} /></div>
      </div>

      <Dialog v2 className="crm-action-dialog" title="编辑报价" visible={editOpen} onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={update.isPending} onClick={() => update.mutate({ ...editForm, amount: isNaN(Number(editForm.amount)) ? undefined : Number(editForm.amount) })} type="button">{update.isPending ? "保存中..." : "保存"}</button>
          </div>
        }>
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>报价编号</label>
            <input value={editForm.quoteNo} onChange={(e) => setEditForm({ ...editForm, quoteNo: e.target.value })} />
          </div>
          <div className="form-field">
            <label>币种</label>
            <input value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })} />
          </div>
          <div className="form-field">
            <label>金额</label>
            <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
          </div>
          <div className="form-field">
            <label>状态</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="form-field wide-field">
            <label>备注</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
          </div>
        </div>
      </Dialog>

      <Dialog v2 className="crm-action-dialog" title="确认删除" visible={deleteOpen} onClose={() => setDeleteOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate()} type="button">{remove.isPending ? "删除中..." : "确认删除"}</button>
          </div>
        }>
        <p>删除后数据不可恢复。确定要删除报价 {editing?.quoteNo} 吗？</p>
      </Dialog>
    </section>
  );
}
