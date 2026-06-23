import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBlacklistRule, getBlacklistRules, toggleBlacklistRule } from "../../../api/settings";
import { AppSelect } from "../../../components/AppSelect";
import { Field } from "../../../components/ui/Field";
import { Switch } from "../../../components/Switch";
import { Table } from "../shared/Table";
import type { BlacklistRule } from "../shared/types";

export function Blacklist() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: "EMAIL", value: "", reason: "" });
  const { data = [] } = useQuery({ queryKey: ["blacklist-rules"], queryFn: () => getBlacklistRules<BlacklistRule[]>() });
  const create = useMutation({ mutationFn: () => createBlacklistRule(form), onSuccess: () => { setForm({ type: "EMAIL", value: "", reason: "" }); queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }); } });
  const toggle = useMutation({ mutationFn: (rule: BlacklistRule) => toggleBlacklistRule(rule.id, !rule.isActive), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blacklist-rules"] }) });
  return (
    <div className="page-stack">
      <div className="form-grid">
        <label>
          <span>类型</span>
          <AppSelect
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
            options={[
              { value: "EMAIL", label: "邮箱" },
              { value: "DOMAIN", label: "域名" },
              { value: "COMPANY_NAME", label: "公司名" },
              { value: "COUNTRY", label: "国家" },
              { value: "KEYWORD", label: "关键词" }
            ]}
          />
        </label>
        <Field label="值" value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <Field label="原因" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <div><button className="primary-button" disabled={!form.value} onClick={() => create.mutate()}>加入黑名单</button></div>
      </div>
      <Table headers={["类型", "值", "原因", "状态"]} rows={data.map((rule) => [rule.type, rule.value, rule.reason ?? "-", <Switch checked={rule.isActive} onChange={() => toggle.mutate(rule)} loading={toggle.isPending} />])} />
    </div>
  );
}
