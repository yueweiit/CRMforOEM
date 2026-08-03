import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getRoles, getUsers, toggleUser } from "../../../api/settings";
import { splitList } from "../../../shared/utils/string";
import { AppSelect } from "../../../components/AppSelect";
import { Field } from "../../../components/ui/Field";
import { Switch } from "../../../components/Switch";
import { useI18n } from "../../../i18n";
import { Table } from "../shared/Table";
import type { UserRow, RoleRow } from "../shared/types";

export function UserManagement() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState({ email: "", name: "", password: "ChangeMe123!", title: "", roleCodes: "SALES_REP" });
  const { data = [] } = useQuery({ queryKey: ["settings-users"], queryFn: () => getUsers<UserRow[]>() });
  const { data: roles = [] } = useQuery({ queryKey: ["settings-roles"], queryFn: () => getRoles<RoleRow[]>() });
  const create = useMutation({
    mutationFn: () => createUser({ ...form, roleCodes: splitList(form.roleCodes) }),
    onSuccess: () => {
      setForm({ email: "", name: "", password: "ChangeMe123!", title: "", roleCodes: "SALES_REP" });
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    }
  });
  const toggle = useMutation({ mutationFn: (user: UserRow) => toggleUser(user.id, !user.isActive), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings-users"] }) });
  return (
    <div className="page-stack">
      <div className="form-grid">
        <Field label={t("common.email")} value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Field label={t("common.name")} value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label={t("common.initialPassword")} value={form.password} onChange={(password) => setForm({ ...form, password })} />
        <label>
          <span>{t("common.role")}</span>
          <AppSelect
            value={form.roleCodes}
            onChange={(roleCodes) => setForm({ ...form, roleCodes })}
            options={roles.map((role) => ({ value: role.code, label: role.name }))}
          />
        </label>
        <div className="wide-field"><button className="primary-button" onClick={() => create.mutate()} disabled={!form.email || !form.name || create.isPending}>{t("settings.addUser")}</button></div>
      </div>
      <Table headers={[t("common.name"), t("common.email"), t("common.role"), t("common.team"), t("common.status")]} rows={data.map((user) => [user.name, user.email, user.userRoles.map((item) => item.role.name).join(", "), user.team?.name ?? "-", <Switch checked={user.isActive} onChange={() => toggle.mutate(user)} loading={toggle.isPending} />])} />
    </div>
  );
}
