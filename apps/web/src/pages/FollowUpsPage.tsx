import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api/http";
import { useSse } from "../hooks/useSse";

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

type Customer = { id: string; name: string };

export function FollowUpsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("OPEN");
  const [form, setForm] = useState({ customerId: "", title: "", type: "CUSTOM", dueAt: new Date().toISOString().slice(0, 16), description: "" });
  const { data = [], isLoading } = useQuery({ queryKey: ["follow-up-tasks", status], queryFn: () => apiGet<FollowUpTask[]>(`/follow-up-tasks${status ? `?status=${status}` : ""}`) });
  const { data: customers = [] } = useQuery({ queryKey: ["customers", "task-options"], queryFn: () => apiGet<Customer[]>("/customers") });

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
    mutationFn: (id: string) => apiPost(`/follow-up-tasks/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    }
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiPatch(`/follow-up-tasks/${id}`, { status: "CANCELLED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    }
  });
  const create = useMutation({
    mutationFn: () => apiPost("/follow-up-tasks", { ...form, dueAt: new Date(form.dueAt).toISOString() }),
    onSuccess: () => {
      setForm({ customerId: "", title: "", type: "CUSTOM", dueAt: new Date().toISOString().slice(0, 16), description: "" });
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["nav-follow-up-overdue-count"] });
    }
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

      <section className="filter-panel">
        <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="OPEN">待处理</option><option value="COMPLETED">已完成</option><option value="CANCELLED">已取消</option></select></label>
        <label><span>关联客户</span><select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">选择客户</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
        <label><span>任务标题</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label><span>截止时间</span><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
      </section>

      <section className="table-panel">
        <div className="panel-title"><h2>任务列表</h2><span>{data.length} 项</span></div>
        {isLoading ? <div className="empty-state">正在加载任务...</div> : null}
        {!isLoading && !data.length ? <div className="empty-state">暂无跟进任务。</div> : null}
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
            <span>首封邮件发送后 3 天未回复、报价后、样品寄出后时，系统会自动生成提醒任务，提醒业务员人工跟进任务。</span>
          </div>
          <span className="status-pill">ACTIVE</span>
        </div>
      </section>
    </section>
  );
}
