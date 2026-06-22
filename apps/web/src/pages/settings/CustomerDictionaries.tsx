import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "../../api/http";
import { Field } from "../../components/ui/Field";
import { Switch } from "../../components/Switch";
import { Table } from "./Table";
import type { DictionaryRow } from "./types";

export function CustomerDictionaries() {
  return (
    <div className="content-grid">
      <DictionaryPanel title="客户来源" queryKey="customer-sources" path="/settings/customer-sources" placeholder="如 Google搜索、展会、LinkedIn" />
      <DictionaryPanel title="客户类型" queryKey="customer-types" path="/settings/customer-types" placeholder="如 品牌商、批发商、分销商" />
    </div>
  );
}

function DictionaryPanel(props: { title: string; queryKey: string; path: string; placeholder: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const { data = [] } = useQuery({ queryKey: [props.queryKey], queryFn: () => apiGet<DictionaryRow[]>(props.path) });
  const create = useMutation({
    mutationFn: () => apiPost(props.path, form),
    onSuccess: () => {
      setForm({ name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const toggle = useMutation({
    mutationFn: (row: DictionaryRow) => apiPatch(`${props.path}/${row.id}`, { isActive: !row.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const save = useMutation({
    mutationFn: (row: DictionaryRow) => {
      const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
      return apiPatch(`${props.path}/${row.id}`, draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  return (
    <section className="panel">
      <div className="panel-title"><h2>{props.title}</h2><span>{data.length} 项</span></div>
      <div className="form-grid compact-form">
        <Field label="名称" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="说明" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <div className="wide-field"><button className="primary-button" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>新增{props.title}</button></div>
      </div>
      <div className="empty-state">{props.placeholder}</div>
      <Table
        headers={["名称", "说明", "状态", "操作"]}
        rows={data.map((row) => {
          const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
          return [
            <input className="table-input" value={draft.name} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, name: event.target.value } })} />,
            <input className="table-input" value={draft.description} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, description: event.target.value } })} />,
            <Switch checked={row.isActive} onChange={() => toggle.mutate(row)} loading={toggle.isPending} />,
            <div className="toolbar">
              <button className="secondary-button" disabled={!draft.name || save.isPending} onClick={() => save.mutate(row)}>保存</button>
            </div>
          ];
        })}
      />
    </section>
  );
}
