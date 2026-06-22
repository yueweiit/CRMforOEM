import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api/http";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { notifyMutationStep } from "../../components/Toast";
import { useSse } from "../../hooks/useSse";
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
  const [status, setStatus] = useState("OPEN");
  const [form, setForm] = useState<FollowUpForm>(defaultForm());
  const { data = [], isLoading } = useQuery({
    queryKey: ["follow-up-tasks", status],
    queryFn: () => apiGet<FollowUpTask[]>(`/follow-up-tasks${status ? `?status=${status}` : ""}`)
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "task-options"],
    queryFn: () => apiGet<Customer[]>("/customers")
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
    mutationFn: (id: string) => apiPost(`/follow-up-tasks/${id}/complete`, undefined, { toast: false }),
    onMutate: (id) => notifyMutationStep({ phase: "loading", title: "处理中", message: "正在完成跟进任务。", dedupeKey: `followup-complete:${id}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: "跟进任务已完成", message: "任务状态已更新为已完成。" });
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error, id) => notifyMutationStep({ phase: "error", title: "完成失败", message: error instanceof Error ? error.message : "完成跟进任务失败。", dedupeKey: `followup-complete:${id}:error` })
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiPatch(`/follow-up-tasks/${id}`, { status: "CANCELLED" }, { toast: false }),
    onMutate: (id) => notifyMutationStep({ phase: "loading", title: "处理中", message: "正在取消跟进任务。", dedupeKey: `followup-cancel:${id}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: "跟进任务已取消", message: "任务状态已更新为已取消。" });
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error, id) => notifyMutationStep({ phase: "error", title: "取消失败", message: error instanceof Error ? error.message : "取消跟进任务失败。", dedupeKey: `followup-cancel:${id}:error` })
  });

  const create = useMutation({
    mutationFn: () => apiPost("/follow-up-tasks", { ...form, dueAt: new Date(form.dueAt).toISOString() }, { toast: false }),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "处理中", message: "正在创建跟进任务。", dedupeKey: `followup-create:${form.customerId}:${form.title}` }),
    onSuccess: () => {
      notifyMutationStep({ phase: "success", title: "跟进任务已创建", message: "新任务已加入跟进列表。" });
      setForm(defaultForm());
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    },
    onError: (error) => notifyMutationStep({ phase: "error", title: "创建失败", message: error instanceof Error ? error.message : "创建跟进任务失败。", dedupeKey: `followup-create:${form.customerId}:${form.title}:error` })
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Follow-up Tasks</p>
          <h1>跟进任务</h1>
        </div>
        <button className="primary-button" disabled={!form.customerId || !form.title || create.isPending} onClick={() => create.mutate()}>
          <CheckCircle2 size={16} />
          新增任务
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
        <div className="panel-title"><h2>任务列表</h2><span>{data.length} 项</span></div>
        {isLoading ? <LoadingState message="正在加载任务..." /> : null}
        {!isLoading && !data.length ? <EmptyState message="暂无跟进任务。" /> : null}
        {data.length ? (
          <table>
            <thead><tr><th>任务</th><th>客户</th><th>负责人</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{data.map((task) => <tr key={task.id}><td><strong>{task.title}</strong><small>{task.type}</small></td><td><Link className="table-link" to={`/customers/${task.customer.id}/follow-ups`}>{task.customer.name}</Link></td><td>{task.owner.name}</td><td>{new Date(task.dueAt).toLocaleString()}</td><td><span className="status-pill">{task.status}</span></td><td><button className="secondary-button" onClick={() => complete.mutate(task.id)}>完成</button><button className="secondary-button" onClick={() => cancel.mutate(task.id)}>取消</button></td></tr>)}</tbody>
          </table>
        ) : null}
      </section>

      <section className="panel">
        <div className="task-row">
          <CalendarClock size={18} />
          <div>
            <strong>自动跟进规则</strong>
            <span>首封邮件发送后 3 天未回复、报价后、样品寄出后，系统会自动生成提醒任务，协助业务员持续推进客户。</span>
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
