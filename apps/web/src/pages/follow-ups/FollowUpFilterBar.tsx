import { TASK_TYPE_LABELS } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";

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
  return (
    <section className="filter-panel">
      <label>
        <span>状态</span>
        <AppSelect
          variant="filter"
          value={status}
          onChange={onStatusChange}
          options={[
            { value: "", label: "全部" },
            { value: "OPEN", label: "待处理" },
            { value: "COMPLETED", label: "已完成" },
            { value: "CANCELLED", label: "已取消" }
          ]}
        />
      </label>
      <label>
        <span>关联客户</span>
        <AppSelect
          variant="filter"
          value={form.customerId}
          onChange={(customerId) => onFormChange({ ...form, customerId })}
          options={[
            { value: "", label: "选择客户" },
            ...customers.map((customer) => ({ value: customer.id, label: customer.name }))
          ]}
        />
      </label>
      <label>
        <span>任务类型</span>
        <AppSelect
          variant="filter"
          value={form.type}
          onChange={(type) => onFormChange({ ...form, type })}
          options={Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </label>
      <label><span>任务标题</span><input value={form.title} onChange={(event) => onFormChange({ ...form, title: event.target.value })} /></label>
      <label><span>截止时间</span><input type="datetime-local" value={form.dueAt} onChange={(event) => onFormChange({ ...form, dueAt: event.target.value })} /></label>
      <label className="wide-field"><span>任务说明</span><textarea value={form.description} onChange={(event) => onFormChange({ ...form, description: event.target.value })} /></label>
    </section>
  );
}
