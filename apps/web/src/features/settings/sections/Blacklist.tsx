import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBlacklistRule, getBlacklistRules, toggleBlacklistRule } from "../../../api/settings";
import { AppSelect } from "../../../components/AppSelect";
import { Field } from "../../../components/ui/Field";
import { Switch } from "../../../components/Switch";
import { useI18n } from "../../../i18n";
import { Table } from "../shared/Table";
import type { BlacklistRule } from "../shared/types";

export function Blacklist() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState({ type: "EMAIL", value: "", reason: "" });
  const { data = [] } = useQuery({ queryKey: ["blacklist-rules"], queryFn: () => getBlacklistRules<BlacklistRule[]>() });
  const create = useMutation({ mutationFn: () => createBlacklistRule(form), onSuccess: () => { setForm({ type: "EMAIL", value: "", reason: "" }); queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }); } });
  const toggle = useMutation({ mutationFn: (rule: BlacklistRule) => toggleBlacklistRule(rule.id, !rule.isActive), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }) });
  return (
    <div className="page-stack">
      <div className="form-grid">
        <label>
          <span>{t("common.type")}</span>
          <AppSelect
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
            options={[
              { value: "EMAIL", label: t("settings.emailType") },
              { value: "DOMAIN", label: t("settings.domainType") },
              { value: "COMPANY_NAME", label: t("settings.companyNameType") },
              { value: "COUNTRY", label: t("settings.countryType") },
              { value: "KEYWORD", label: t("settings.keywordType") }
            ]}
          />
        </label>
        <Field label={t("common.value")} value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <Field label={t("common.reason")} value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <div><button className="primary-button" disabled={!form.value} onClick={() => create.mutate()}>{t("settings.addBlacklist")}</button></div>
      </div>
      <Table headers={[t("common.type"), t("common.value"), t("common.reason"), t("common.status")]} rows={data.map((rule) => [blacklistTypeLabel(rule.type, t), rule.value, rule.reason ?? "-", <Switch checked={rule.isActive} onChange={() => toggle.mutate(rule)} loading={toggle.isPending} />])} />
    </div>
  );
}

function blacklistTypeLabel(type: string, t: ReturnType<typeof useI18n>["t"]) {
  const labels: Record<string, ReturnType<typeof useI18n>["t"] extends (key: infer K) => string ? K & string : never> = {
    EMAIL: "settings.emailType",
    DOMAIN: "settings.domainType",
    COMPANY_NAME: "settings.companyNameType",
    COUNTRY: "settings.countryType",
    KEYWORD: "settings.keywordType"
  };
  return labels[type] ? t(labels[type]) : type;
}
