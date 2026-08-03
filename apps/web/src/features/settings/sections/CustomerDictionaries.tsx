import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCustomerSource, createCustomerType, getCustomerSources, getCustomerTypes, updateCustomerSource, updateCustomerType } from "../../../api/settings";
import { Field } from "../../../components/ui/Field";
import { Switch } from "../../../components/Switch";
import { useI18n } from "../../../i18n";
import { Table } from "../shared/Table";
import type { DictionaryRow } from "../shared/types";

export function CustomerDictionaries() {
  const { t } = useI18n();
  return (
    <div className="content-grid">
      <DictionaryPanel
        title={t("settings.customerSource")}
        queryKey="customer-sources"
        fetchFn={getCustomerSources}
        createFn={createCustomerSource}
        updateFn={updateCustomerSource}
        placeholder={t("settings.sourcePlaceholder")}
      />
      <DictionaryPanel
        title={t("settings.customerType")}
        queryKey="customer-types"
        fetchFn={getCustomerTypes}
        createFn={createCustomerType}
        updateFn={updateCustomerType}
        placeholder={t("settings.typePlaceholder")}
      />
    </div>
  );
}

function DictionaryPanel(props: {
  title: string;
  queryKey: string;
  fetchFn: <T>() => Promise<T>;
  createFn: (payload: unknown) => Promise<unknown>;
  updateFn: (id: string, payload: unknown) => Promise<unknown>;
  placeholder: string;
}) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", description: "" });
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const { data = [] } = useQuery({ queryKey: [props.queryKey], queryFn: () => props.fetchFn<DictionaryRow[]>() });
  const create = useMutation({
    mutationFn: () => props.createFn(form),
    onSuccess: () => {
      setForm({ name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const toggle = useMutation({
    mutationFn: (row: DictionaryRow) => props.updateFn(row.id, { isActive: !row.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  const save = useMutation({
    mutationFn: (row: DictionaryRow) => {
      const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
      return props.updateFn(row.id, draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [props.queryKey] });
      queryClient.invalidateQueries({ queryKey: ["customer-filter-options"] });
    }
  });
  return (
    <section className="panel">
      <div className="panel-title"><h2>{props.title}</h2><span>{data.length} {t("common.itemCount")}</span></div>
      <div className="form-grid compact-form">
        <Field label={t("common.name")} value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label={t("common.description")} value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <div className="wide-field"><button className="primary-button" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>{t("settings.addPrefix")}{props.title}</button></div>
      </div>
      <div className="empty-state">{props.placeholder}</div>
      <Table
        headers={[t("common.name"), t("common.description"), t("common.status"), t("common.operation")]}
        rows={data.map((row) => {
          const draft = drafts[row.id] ?? { name: row.name, description: row.description ?? "" };
          return [
            <input className="table-input" value={draft.name} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, name: event.target.value } })} />,
            <input className="table-input" value={draft.description} onChange={(event) => setDrafts({ ...drafts, [row.id]: { ...draft, description: event.target.value } })} />,
            <Switch checked={row.isActive} onChange={() => toggle.mutate(row)} loading={toggle.isPending} />,
            <div className="toolbar">
              <button className="secondary-button" disabled={!draft.name || save.isPending} onClick={() => save.mutate(row)}>{t("common.save")}</button>
            </div>
          ];
        })}
      />
    </section>
  );
}
