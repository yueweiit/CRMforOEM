import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookTabs } from "lucide-react";
import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { createCustomerContact, getCustomerFilterOptions, updateCustomer, updateCustomerStage } from "../../../../api/customers";
import { AppSelect } from "../../../../components/AppSelect";
import { Field } from "../../../../components/ui/Field";
import { splitList } from "../../../../shared/utils/string";
import type { CustomerOptions } from "../../../../shared/types/customer";
import type { CustomerDetail } from "../shared/types";
import { Detail } from "../shared/ui";

function defaultContactForm() {
  return { name: "", title: "", email: "", phone: "", qualityScore: "50", isDecisionMaker: false };
}

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
    mutationFn: () => createCustomerContact(customerId, { ...contact, qualityScore: Number(contact.qualityScore || 0), isDecisionMaker: contact.isDecisionMaker }),
    onSuccess: () => { setContact(defaultContactForm()); onChanged(); }
  });
  return (
    <div className="content-grid">
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
              <button className="secondary-button" onClick={() => setIsEditing(true)}>编辑资料</button>
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
        <div className="panel-title"><h2>联系人</h2><span>{customer.contacts.length} 个</span></div>
        <div className="task-list">
          {customer.contacts.map((item) => <div className="task-row" key={item.id}><NotebookTabs size={16} /><div><strong>{item.name || item.email || "未命名联系人"}</strong><span>{item.title ?? "-"} · {item.email ?? "-"} · {item.phone ?? "-"}</span></div><span className="status-pill">{item.qualityScore}</span></div>)}
          {!customer.contacts.length ? <div className="empty-state">暂无联系人。</div> : null}
        </div>
        <div className="form-grid compact-form">
          <Field label="姓名" value={contact.name} onChange={(name) => setContact({ ...contact, name })} />
          <Field label="职位" value={contact.title} onChange={(title) => setContact({ ...contact, title })} />
          <Field label="邮箱" value={contact.email} onChange={(email) => setContact({ ...contact, email })} />
          <Field label="电话" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} />
          <Field label="质量分" value={contact.qualityScore} onChange={(qualityScore) => setContact({ ...contact, qualityScore })} />
          <div><button className="secondary-button" disabled={createContact.isPending} onClick={() => createContact.mutate()}>新增联系人</button></div>
        </div>
      </section>
    </div>
  );
}
