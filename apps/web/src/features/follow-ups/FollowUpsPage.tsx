import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { followUpTaskStatusLabel, taskTypeLabel } from "@oem-crm/shared";
import { cancelFollowUpTask, completeFollowUpTask, createFollowUpTask, getFollowUpTasks } from "../../api/followUps";
import { getCustomers } from "../../api/customers";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { notifyMutationStep } from "../../components/Toast";
import { useSse } from "../../hooks/useSse";
import { useI18n } from "../../i18n";
import { FollowUpFilterBar, type Customer, type FollowUpForm } from "./FollowUpFilterBar";

type FollowUpTask = {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  dueAt: string;
  customer: { id: string; name: string; stage: string; websiteDomain?: string };
  owner: { id: string; name: string };
};

export function FollowUpsPage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [status, setStatus] = useState("OPEN");
  const [form, setForm] = useState<FollowUpForm>(defaultForm());
  const { data = [], isLoading } = useQuery({
    queryKey: ["follow-up-tasks", status],
    queryFn: () => getFollowUpTasks<FollowUpTask[]>(status)
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "task-options"],
    queryFn: () => getCustomers<Customer[]>()
  });

  useSse("follow-up.task.created", () => {
    queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
  });
  useSse("follow-up.task.completed", () => {
    queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
  });
  useSse("follow-up.task.cancelled", () => {
    queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeFollowUpTask(id, { toast: false }),
    onMutate: (id) => notifyMutationStep({ phase: "loading", title: t("toast.processing"), message: t("followUps.complete"), dedupeKey: `followup-complete:${id}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: t("followUps.completed"), message: t("followUps.completed") });
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error, id) => notifyMutationStep({ phase: "error", title: t("toast.errorUpdate"), message: error instanceof Error ? error.message : t("toast.errorUpdate"), dedupeKey: `followup-complete:${id}:error` })
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFollowUpTask(id, { toast: false }),
    onMutate: (id) => notifyMutationStep({ phase: "loading", title: t("toast.processing"), message: t("followUps.cancel"), dedupeKey: `followup-cancel:${id}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: t("followUps.cancelled"), message: t("followUps.cancelled") });
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error, id) => notifyMutationStep({ phase: "error", title: t("toast.errorUpdate"), message: error instanceof Error ? error.message : t("toast.errorUpdate"), dedupeKey: `followup-cancel:${id}:error` })
  });

  const create = useMutation({
    mutationFn: () => createFollowUpTask({ ...form, dueAt: new Date(form.dueAt).toISOString() }, { toast: false }),
    onMutate: () => notifyMutationStep({ phase: "loading", title: t("toast.processing"), message: t("toast.loadingCreate"), dedupeKey: `followup-create:${form.customerId}:${form.title}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: t("toast.successCreateTitle"), message: t("toast.successCreate") });
      setForm(defaultForm());
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error) => notifyMutationStep({ phase: "error", title: t("toast.errorCreate"), message: error instanceof Error ? error.message : t("toast.errorCreate"), dedupeKey: `followup-create:${form.customerId}:${form.title}:error` })
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Follow-up Tasks</p>
          <h1>{t("followUps.title")}</h1>
        </div>
        <button className="primary-button" disabled={!form.customerId || !form.title || create.isPending} onClick={() => create.mutate()}>
          <CheckCircle2 size={16} />
          {t("followUps.addTask")}
        </button>
      </header>

      <FollowUpFilterBar
        status={status}
        onStatusChange={setStatus}
        form={form}
        onFormChange={setForm}
        customers={customers}
      />

      <section className="table-panel">
        <div className="panel-title"><h2>{t("followUps.listTitle")}</h2><span>{data.length} {t("common.itemCount")}</span></div>
        {isLoading ? <LoadingState message={t("followUps.loading")} /> : null}
        {!isLoading && !data.length ? <EmptyState message={t("followUps.empty")} /> : null}
        {data.length ? (
          <table>
            <thead><tr><th>{t("followUps.task")}</th><th>{t("common.customer")}</th><th>{t("followUps.owner")}</th><th>{t("followUps.dueAt")}</th><th>{t("followUps.status")}</th><th>{t("common.operation")}</th></tr></thead>
            <tbody>{data.map((task) => <tr key={task.id}><td><strong>{task.title}</strong><small>{taskTypeLabel(task.type, locale)}</small></td><td><Link className="table-link" to={`/customers/${task.customer.id}/follow-ups`}>{task.customer.name}</Link></td><td>{task.owner.name}</td><td>{new Date(task.dueAt).toLocaleString()}</td><td><span className="status-pill">{followUpTaskStatusLabel(task.status, locale)}</span></td><td><button className="secondary-button" onClick={() => complete.mutate(task.id)}>{t("followUps.complete")}</button><button className="secondary-button" onClick={() => cancel.mutate(task.id)}>{t("followUps.cancel")}</button></td></tr>)}</tbody>
          </table>
        ) : null}
      </section>

      <section className="panel">
        <div className="task-row">
          <CalendarClock size={18} />
          <div>
            <strong>{t("followUps.autoRuleTitle")}</strong>
            <span>{t("followUps.autoRuleDescription")}</span>
          </div>
          <span className="status-pill">ACTIVE</span>
        </div>
      </section>
    </section>
  );
}

function defaultForm(): FollowUpForm {
  return {
    customerId: "",
    title: "",
    type: "CUSTOM",
    dueAt: new Date().toISOString().slice(0, 16),
    description: ""
  };
}
