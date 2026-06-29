import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import { NotebookTabs } from "lucide-react";
import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { createCustomerContact, deleteCustomerContact, getCustomerFilterOptions, updateCustomer, updateCustomerContact, updateCustomerStage } from "../../../../api/customers";
import { AppSelect } from "../../../../components/AppSelect";
import { AddIconButton } from "../../../../components/AddIconButton";
import { DeleteIconButton } from "../../../../components/DeleteIconButton";
import { EditIconButton } from "../../../../components/EditIconButton";
import { Field } from "../../../../components/ui/Field";
import { splitList } from "../../../../shared/utils/string";
import type { CustomerOptions } from "../../../../shared/types/customer";
import type { Contact, CustomerDetail } from "../shared/types";
import { Detail } from "../shared/ui";

function defaultContactForm() {
  return { name: "", title: "", email: "", phone: "", qualityScore: "50", isDecisionMaker: false };
}

type ContactForm = ReturnType<typeof defaultContactForm>;

function customerToForm(customer: CustomerDetail) {
  return {
    name: customer.name ?? "",
    websiteUrl: customer.websiteUrl ?? "",
    country: customer.country ?? "",
    language: customer.language ?? "",
    timezone: customer.timezone ?? "",
    currency: customer.currency ?? "",
    sourceId: customer.source?.id ?? "",
    typeId: customer.type?.id ?? "",
    ownerId: customer.owner?.id ?? "",
    stage: customer.stage,
    tags: customer.tags?.join(", ") ?? "",
    notes: customer.notes ?? ""
  };
}

export function OverviewPanel({ customer, customerId, onChanged }: { customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(customerToForm(customer));
  const [contact, setContact] = useState(defaultContactForm());
  const [contactDialogMode, setContactDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingContactId, setEditingContactId] = useState("");
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState("");
  const { data: options } = useQuery({
    queryKey: ["customer-filter-options"],
    queryFn: () => getCustomerFilterOptions<CustomerOptions>()
  });
  useEffect(() => {
    setEditForm(customerToForm(customer));
  }, [customer]);
  const saveCustomer = useMutation({
    mutationFn: async () => {
      await updateCustomer(customerId, {
        name: editForm.name,
        websiteUrl: editForm.websiteUrl || null,
        country: editForm.country || null,
        language: editForm.language || null,
        timezone: editForm.timezone || null,
        currency: editForm.currency || null,
        sourceId: editForm.sourceId || null,
        typeId: editForm.typeId || null,
        ownerId: editForm.ownerId || null,
        tags: splitList(editForm.tags),
        notes: editForm.notes || null
      });
      if (editForm.stage && editForm.stage !== customer.stage) {
        await updateCustomerStage(customerId, {
          stage: editForm.stage,
          reason: "Manual update from customer detail"
        });
      }
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onChanged();
    }
  });
  const createContact = useMutation({
    mutationFn: () => createCustomerContact(customerId, buildContactPayload(contact)),
    onSuccess: () => {
      resetContactDialog();
      onChanged();
    }
  });
  const updateContact = useMutation({
    mutationFn: () => updateCustomerContact(customerId, editingContactId, buildContactPayload(contact)),
    onSuccess: () => {
      resetContactDialog();
      onChanged();
    }
  });
  const deleteContact = useMutation({
    mutationFn: (contactId: string) => deleteCustomerContact(customerId, contactId),
    onSuccess: () => {
      setPendingDeleteContactId("");
      onChanged();
    }
  });
  const isContactSaving = createContact.isPending || updateContact.isPending;

  function openCreateContactDialog() {
    setEditingContactId("");
    setContact(defaultContactForm());
    setContactDialogMode("create");
  }

  function openEditContactDialog(item: Contact) {
    setEditingContactId(item.id);
    setContact(contactToForm(item));
    setContactDialogMode("edit");
  }

  function closeContactDialog() {
    if (isContactSaving) return;
    resetContactDialog();
  }

  function resetContactDialog() {
    setContactDialogMode(null);
    setEditingContactId("");
    setContact(defaultContactForm());
  }

  function submitContact() {
    if (contactDialogMode === "edit") {
      updateContact.mutate();
      return;
    }
    createContact.mutate();
  }

  function closeDeleteContactDialog() {
    if (deleteContact.isPending) return;
    setPendingDeleteContactId("");
  }

  function confirmDeleteContact() {
    if (!pendingDeleteContactId) return;
    deleteContact.mutate(pendingDeleteContactId);
  }
  return (
    <div className="content-grid">
      <Dialog
        v2
        className="crm-action-dialog contact-dialog"
        title={contactDialogMode === "edit" ? "编辑联系人" : "新增联系人"}
        visible={Boolean(contactDialogMode)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" disabled={isContactSaving} onClick={closeContactDialog} type="button">
              取消
            </button>
            <button className="primary-button" disabled={isContactSaving} onClick={submitContact} type="button">
              {isContactSaving ? "保存中..." : contactDialogMode === "edit" ? "保存修改" : "新增联系人"}
            </button>
          </div>
        )}
        onClose={closeContactDialog}
      >
        <div className="form-grid compact-form contact-dialog-form">
          <Field label="姓名" value={contact.name} onChange={(name) => setContact({ ...contact, name })} />
          <Field label="职位" value={contact.title} onChange={(title) => setContact({ ...contact, title })} />
          <Field label="邮箱" value={contact.email} onChange={(email) => setContact({ ...contact, email })} />
          <Field label="电话" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} />
          <div className="contact-meta-row">
            <label className="contact-inline-field contact-score-field">
              <span>质量分</span>
              <input
                inputMode="numeric"
                value={contact.qualityScore}
                onChange={(event) => setContact({ ...contact, qualityScore: event.target.value })}
              />
            </label>
            <label className="contact-inline-field contact-checkbox-field">
              <span>关键决策人</span>
              <input
                checked={contact.isDecisionMaker}
                type="checkbox"
                onChange={(event) => setContact({ ...contact, isDecisionMaker: event.target.checked })}
              />
            </label>
          </div>
        </div>
        {createContact.isError || updateContact.isError ? <div className="error-state">联系人保存失败，请检查邮箱或分数字段。</div> : null}
      </Dialog>

      <Dialog
        v2
        className="crm-delete-dialog"
        title="确认删除联系人"
        visible={Boolean(pendingDeleteContactId)}
        footer={(
          <div className="toolbar crm-dialog-footer">
            <button className="secondary-button" disabled={deleteContact.isPending} onClick={closeDeleteContactDialog} type="button">
              取消
            </button>
            {deleteContact.isPending ? (
              <button className="primary-button" disabled type="button">处理中...</button>
            ) : (
              <DeleteIconButton className="primary-button" onClick={confirmDeleteContact} />
            )}
          </div>
        )}
        onClose={closeDeleteContactDialog}
      >
        确认删除这个联系人吗？删除后将无法恢复。
      </Dialog>

      <section className="panel">
        <div className="panel-title">
          <h2>客户概览</h2>
          <div className="toolbar">
            {isEditing ? (
              <>
                <button className="secondary-button" onClick={() => { setEditForm(customerToForm(customer)); setIsEditing(false); }}>取消</button>
                <button className="primary-button" disabled={!editForm.name || saveCustomer.isPending} onClick={() => saveCustomer.mutate()}>
                  {saveCustomer.isPending ? "保存中..." : "保存客户资料"}
                </button>
              </>
            ) : (
              <EditIconButton label="编辑资料" onClick={() => setIsEditing(true)} />
            )}
          </div>
        </div>
        {saveCustomer.isError ? <div className="error-state">保存失败，请检查字段格式。</div> : null}
        {isEditing ? (
          <div className="form-grid">
            <Field label="公司名称 *" value={editForm.name} onChange={(name) => setEditForm({ ...editForm, name })} />
            <Field label="官网URL" value={editForm.websiteUrl} onChange={(websiteUrl) => setEditForm({ ...editForm, websiteUrl })} />
            <Field label="国家/地区" value={editForm.country} onChange={(country) => setEditForm({ ...editForm, country })} />
            <Field label="语言" value={editForm.language} onChange={(language) => setEditForm({ ...editForm, language })} />
            <Field label="时区" value={editForm.timezone} onChange={(timezone) => setEditForm({ ...editForm, timezone })} />
            <Field label="币种" value={editForm.currency} onChange={(currency) => setEditForm({ ...editForm, currency })} />
            <label>
              <span>客户来源</span>
              <AppSelect
                value={editForm.sourceId}
                onChange={(sourceId) => setEditForm({ ...editForm, sourceId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.sources.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>客户类型</span>
              <AppSelect
                value={editForm.typeId}
                onChange={(typeId) => setEditForm({ ...editForm, typeId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.types.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>负责人</span>
              <AppSelect
                value={editForm.ownerId}
                onChange={(ownerId) => setEditForm({ ...editForm, ownerId })}
                options={[
                  { value: "", label: "未选择" },
                  ...(options?.users.map((item) => ({ value: item.id, label: item.name })) ?? [])
                ]}
              />
            </label>
            <label>
              <span>客户阶段</span>
              <AppSelect
                value={editForm.stage}
                onChange={(stage) => setEditForm({ ...editForm, stage })}
                options={(options?.stages ?? Object.keys(STAGE_LABELS)).map((stage) => ({ value: stage, label: stageLabel(stage) }))}
              />
            </label>
            <Field label="标签" value={editForm.tags} onChange={(tags) => setEditForm({ ...editForm, tags })} />
            <label className="wide-field">
              <span>备注</span>
              <textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} />
            </label>
          </div>
        ) : (
          <div className="detail-grid">
            <Detail label="阶段" value={stageLabel(customer.stage)} />
            <Detail label="风险" value={customer.riskLevel} />
            <Detail label="官网" value={customer.websiteUrl ?? "-"} />
            <Detail label="国家/语言" value={`${customer.country ?? "-"} / ${customer.language ?? "-"}`} />
            <Detail label="时区/币种" value={`${customer.timezone ?? "-"} / ${customer.currency ?? "-"}`} />
            <Detail label="负责人" value={customer.owner?.name ?? "-"} />
            <Detail label="客户来源" value={customer.source?.name ?? "-"} />
            <Detail label="客户类型" value={customer.type?.name ?? "-"} />
            <Detail label="标签" value={customer.tags?.join(", ") || "-"} />
            <Detail label="备注" value={customer.notes ?? "-"} wide />
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>联系人</h2>
          <div className="toolbar">
            <AddIconButton label="新增联系人" onClick={openCreateContactDialog} />
          </div>
        </div>
        <div className="task-list">
          {customer.contacts.map((item) => (
            <div className="task-row contact-row" key={item.id}>
              <NotebookTabs size={16} />
              <button className="contact-row-main" onClick={() => openEditContactDialog(item)} type="button">
                <strong>
                  {item.name || item.email || "未命名联系人"}
                  {item.isDecisionMaker ? <span className="status-pill contact-role-pill">决策人</span> : null}
                </strong>
                <span>{item.title ?? "-"} · {item.email ?? "-"}</span>
              </button>
              <div className="contact-row-actions">
                <span className="status-pill">{item.qualityScore}</span>
                <DeleteIconButton onClick={() => setPendingDeleteContactId(item.id)} />
              </div>
            </div>
          ))}
          {!customer.contacts.length ? <div className="empty-state">暂无联系人。</div> : null}
        </div>
      </section>
    </div>
  );
}

function contactToForm(contact: Contact): ContactForm {
  return {
    name: contact.name ?? "",
    title: contact.title ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    qualityScore: String(contact.qualityScore ?? 50),
    isDecisionMaker: Boolean(contact.isDecisionMaker)
  };
}

function buildContactPayload(contact: ContactForm) {
  return {
    name: blankToUndefined(contact.name),
    title: blankToUndefined(contact.title),
    email: blankToUndefined(contact.email),
    phone: blankToUndefined(contact.phone),
    qualityScore: clampScore(contact.qualityScore),
    isDecisionMaker: contact.isDecisionMaker
  };
}

function blankToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function clampScore(value: string) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}
