import { TASK_TYPE_LABELS, taskTypeLabel } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";
import { useI18n } from "../../i18n";

export type Customer = { id: string; name: string };

export type FollowUpForm = {
  customerId: string;
  title: string;
  type: string;
  dueAt: string;
  description: string;
};

export function FollowUpFilterBar({
  status,
  onStatusChange,
  form,
  onFormChange,
  customers
}: {
  status: string;
  onStatusChange: (status: string) => void;
  form: FollowUpForm;
  onFormChange: (form: FollowUpForm) => void;
  customers: Customer[];
}) {
  const { locale, t } = useI18n();
  return (
    <section className="filter-panel">
      <label>
          <span>{t("followUps.status")}</span>
        <AppSelect
          variant="filter"
          value={status}
          onChange={onStatusChange}
          options={[
            { value: "", label: t("common.all") },
            { value: "OPEN", label: t("followUps.pending") },
            { value: "COMPLETED", label: t("followUps.completed") },
            { value: "CANCELLED", label: t("followUps.cancelled") }
          ]}
        />
      </label>
      <label>
        <span>{t("followUps.relatedCustomer")}</span>
        <AppSelect
          variant="filter"
          value={form.customerId}
          onChange={(customerId) => onFormChange({ ...form, customerId })}
          options={[
            { value: "", label: t("followUps.selectCustomer") },
            ...customers.map((customer) => ({ value: customer.id, label: customer.name }))
          ]}
        />
      </label>
      <label>
        <span>{t("followUps.taskType")}</span>
        <AppSelect
          variant="filter"
          value={form.type}
          onChange={(type) => onFormChange({ ...form, type })}
          options={Object.keys(TASK_TYPE_LABELS).map((value) => ({ value, label: taskTypeLabel(value, locale) }))}
        />
      </label>
      <label><span>{t("followUps.taskTitle")}</span><input value={form.title} onChange={(event) => onFormChange({ ...form, title: event.target.value })} /></label>
      <label><span>{t("followUps.dueAt")}</span><input type="datetime-local" value={form.dueAt} onChange={(event) => onFormChange({ ...form, dueAt: event.target.value })} /></label>
      <label className="wide-field"><span>{t("followUps.description")}</span><textarea value={form.description} onChange={(event) => onFormChange({ ...form, description: event.target.value })} /></label>
    </section>
  );
}
