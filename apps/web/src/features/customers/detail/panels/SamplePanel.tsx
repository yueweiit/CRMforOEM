import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { NotebookTabs } from "lucide-react";
import { showClientToast } from "../../../../components/Toast";
import { createSample, deleteSample, getSamples, updateSample } from "../../../../api/customers";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import type { Sample } from "../shared/types";

const SAMPLE_STATUSES = ["REQUESTED", "PREPARING", "SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED", "CLOSED"] as const;

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "已申请",
    PREPARING: "备货中",
    SHIPPED: "已发货",
    DELIVERED: "已送达",
    FEEDBACK_RECEIVED: "已反馈",
    CLOSED: "已关闭"
  };
  return labels[status] ?? status;
}

export function SamplePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ productSummary: "", carrier: "", trackingNo: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [editForm, setEditForm] = useState({ productSummary: "", carrier: "", trackingNo: "", status: "", shippedAt: "", feedback: "" });

  const { data = [] } = useQuery({ queryKey: ["samples", customerId], queryFn: () => getSamples<Sample[]>(customerId) });

  const create = useMutation({
    mutationFn: () => createSample({ ...form, customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
      setForm({ productSummary: "", carrier: "", trackingNo: "" });
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
    mutationFn: (payload: Record<string, unknown>) => updateSample(editing?.id ?? "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
      setEditOpen(false);
      setEditing(null);
    },
    onError: (error) => {
      showClientToast({
        type: "error",
        title: "更新样品失败",
        message: error instanceof Error ? error.message : "操作失败"
      });
    }
  });

  const remove = useMutation({
    mutationFn: () => deleteSample(editing?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["samples", customerId] });
      setDeleteOpen(false);
      setEditing(null);
    }
  });

  const openEdit = (item: Sample) => {
    setEditing(item);
    setEditForm({
      productSummary: item.productSummary,
      carrier: item.carrier ?? "",
      trackingNo: item.trackingNo ?? "",
      status: item.status,
      shippedAt: item.shippedAt ?? "",
      feedback: item.feedback ?? ""
    });
    setEditOpen(true);
  };

  const openDelete = (item: Sample) => {
    setEditing(item);
    setDeleteOpen(true);
  };

  return (
    <section className="panel">
      <div className="panel-title"><h2>样品记录</h2><span>{data.length} 条</span></div>

      {data.length === 0 ? (
        <div className="empty-state">暂无样品记录。</div>
      ) : (
        <div className="task-list">
          {data.map((item) => (
            <div className="task-row" key={item.id}>
              <NotebookTabs size={16} />
              <div>
                <strong>{item.productSummary}</strong>
                <span>{statusLabel(item.status)} · {item.trackingNo ?? "-"} · {new Date(item.createdAt).toLocaleDateString()}</span>
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
        <Field label="样品/产品" value={form.productSummary} onChange={(value) => setForm({ ...form, productSummary: value })} />
        <Field label="物流商" value={form.carrier} onChange={(value) => setForm({ ...form, carrier: value })} />
        <Field label="运单号" value={form.trackingNo} onChange={(value) => setForm({ ...form, trackingNo: value })} />
        <div><AddIconButton disabled={create.isPending} label={create.isPending ? "提交中..." : "新增样品"} onClick={() => create.mutate()} /></div>
      </div>

      <Dialog v2 className="crm-action-dialog" title="编辑样品" visible={editOpen} onClose={() => setEditOpen(false)}
        footer={
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" onClick={() => setEditOpen(false)} type="button">取消</button>
            <button className="primary-button" disabled={update.isPending} onClick={() => update.mutate({ ...editForm, shippedAt: editForm.shippedAt || undefined, feedback: editForm.feedback || undefined })} type="button">{update.isPending ? "保存中..." : "保存"}</button>
          </div>
        }>
        <div className="analysis-edit-form">
          <div className="form-field">
            <label>样品/产品</label>
            <input value={editForm.productSummary} onChange={(e) => setEditForm({ ...editForm, productSummary: e.target.value })} />
          </div>
          <div className="form-field">
            <label>物流商</label>
            <input value={editForm.carrier} onChange={(e) => setEditForm({ ...editForm, carrier: e.target.value })} />
          </div>
          <div className="form-field">
            <label>运单号</label>
            <input value={editForm.trackingNo} onChange={(e) => setEditForm({ ...editForm, trackingNo: e.target.value })} />
          </div>
          <div className="form-field">
            <label>状态</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {SAMPLE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>发货日期</label>
            <input type="date" value={editForm.shippedAt} onChange={(e) => setEditForm({ ...editForm, shippedAt: e.target.value })} />
          </div>
          <div className="form-field wide-field">
            <label>反馈</label>
            <textarea value={editForm.feedback} onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })} rows={3} />
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
        <p>删除后数据不可恢复。确定要删除样品 {editing?.productSummary} 吗？</p>
      </Dialog>
    </section>
  );
}
