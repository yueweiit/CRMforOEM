import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { stageLabel, taskTypeLabel } from "@oem-crm/shared";
import { getDashboardFilterOptions, getMyDashboard } from "../../api/dashboards";
import { getCurrentUser } from "../../auth/permissions";
import { BarList } from "../../components/ui/BarList";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingState } from "../../components/ui/LoadingState";
import { useSse } from "../../hooks/useSse";
import type { PriorityCustomerRow } from "../../shared/types/customer";
import { formatDateInput, formatDateTime } from "../../shared/utils/format";
import { toQueryString } from "../../shared/utils/string";
import { DashboardFilterBar, type DashboardFilterOptions } from "./DashboardFilterBar";
import { KpiGrid } from "./KpiGrid";
import { PriorityCustomerTable } from "./PriorityCustomerTable";

type PersonalDashboard = {
  summary: {
    my_customer_total: number;
    today_pending_followups: number;
    month_new_customers: number;
    month_researched_customers: number;
    month_sent_emails: number;
    month_replied_customers: number;
    month_reply_rate: number;
    month_quoted_customers: number;
    month_sample_customers: number;
    month_won_customers: number;
    overdue_tasks: number;
    won_metric_source?: string;
    reply_metric_source?: string;
    generated_at?: string;
  };
  high_priority_customers: PriorityCustomerRow[];
  stage_distribution: Array<{ stage: string; count: number }>;
  email_trend: Array<{
    bucket: string;
    sent: number;
    replied: number;
    sent_message_count?: number;
    replied_message_count?: number;
  }>;
  followup_tasks: Array<{
    id: string;
    title: string;
    dueAt: string;
    is_overdue?: boolean;
    task_type?: string;
    customer: { id: string; name: string; stage: string };
  }>;
};

const fallback: PersonalDashboard = {
  summary: {
    my_customer_total: 0,
    today_pending_followups: 0,
    month_new_customers: 0,
    month_researched_customers: 0,
    month_sent_emails: 0,
    month_replied_customers: 0,
    month_reply_rate: 0,
    month_quoted_customers: 0,
    month_sample_customers: 0,
    month_won_customers: 0,
    overdue_tasks: 0
  },
  high_priority_customers: [],
  stage_distribution: [
    { stage: "PENDING_RESEARCH", count: 0 },
    { stage: "RESEARCHED", count: 0 },
    { stage: "FIRST_EMAIL_SENT", count: 0 },
    { stage: "REPLIED", count: 0 }
  ],
  email_trend: [],
  followup_tasks: []
};

export function DashboardPage() {
  const queryClient = useQueryClient();
  const isAdminWorkspace = getCurrentUser()?.dataScope === "ALL";
  const [filters, setFilters] = useState(defaultPersonalFilters());
  const queryString = useMemo(() => toQueryString(filters), [filters]);

  useSse("inbound-mail.received", () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "me"] });
  });
  useSse("follow-up.task.created", () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "me"] });
  });
  useSse("follow-up.task.completed", () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "me"] });
  });
  useSse("follow-up.task.cancelled", () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "me"] });
  });
  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filter-options", "personal"],
    queryFn: () => getDashboardFilterOptions<DashboardFilterOptions>(),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const { data = fallback, isFetching, isError } = useQuery({
    queryKey: ["dashboard", "me", queryString],
    queryFn: () => getMyDashboard<PersonalDashboard>(queryString),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const summary = data.summary;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal Pipeline</p>
          <h1>OEM 客户开发工作台</h1>
        </div>
      </header>

      <DashboardFilterBar filters={filters} options={filterOptions} onChange={setFilters} />
      {isError ? <section className="panel"><ErrorState message="看板数据加载失败，请稍后重试。" /></section> : null}
      {isFetching ? <section className="panel"><LoadingState message="正在刷新看板数据..." /></section> : null}

      <KpiGrid summary={summary} isAdminWorkspace={isAdminWorkspace} />

      <div className="content-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>客户开发阶段分布</h2>
            <span>{isAdminWorkspace ? "全员客户池" : "个人客户池"}</span>
          </div>
          <BarList data={data.stage_distribution.map((item) => ({ label: stageLabel(item.stage), value: item.count }))} emptyMessage="暂无分布数据。" />
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>邮件发送/回复趋势</h2>
            <span>按筛选时间聚合</span>
          </div>
          <TrendBars data={data.email_trend} />
        </section>
      </div>

      <div className="content-grid">
        <section className="table-panel">
          <div className="panel-title">
            <h2>高优先级客户</h2>
            <span>A/B 评分或阶段靠后</span>
          </div>
          <PriorityCustomerTable rows={data.high_priority_customers} />
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>今日跟进任务</h2>
            <span>{data.followup_tasks.length} 项</span>
          </div>
          <div className="task-list">
            {data.followup_tasks.length ? (
              data.followup_tasks.map((task) => (
                <div
                  className={`task-row ${task.is_overdue ? "overdue" : ""}`}
                  key={task.id}
                >
                  <Clock size={18} />
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {task.customer.name} · {formatDateTime(task.dueAt)}
                      {task.task_type ? ` · ${taskTypeLabel(task.task_type)}` : ""}
                    </span>
                  </div>
                  <span className="status-pill">{stageLabel(task.customer.stage)}</span>
                </div>
              ))
            ) : (
              <EmptyState message="今天没有待跟进任务。" />
            )}
          </div>
        </section>
      </div>

      {data.summary.generated_at ? (
        <div className="data-timestamp">
          数据更新于 {formatDateTime(data.summary.generated_at)}
        </div>
      ) : null}
    </section>
  );
}

function TrendBars(props: {
  data: Array<{
    bucket: string;
    sent: number;
    replied: number;
    sent_message_count?: number;
    replied_message_count?: number;
  }>;
}) {
  const resolved = props.data.map((item) => ({
    ...item,
    sentVal: item.sent_message_count ?? item.sent,
    repliedVal: item.replied_message_count ?? item.replied
  }));
  const max = Math.max(1, ...resolved.flatMap((item) => [item.sentVal, item.repliedVal]));
  return (
    <div className="trend-bars">
      {resolved.length ? resolved.map((item) => (
        <div className="trend-row" key={item.bucket}>
          <span>{item.bucket}</span>
          <div className="trend-stack">
            <i className="sent" style={{ width: `${Math.max(3, item.sentVal / max * 100)}%` }} title={`发送 ${item.sentVal}`} />
            <i className="replied" style={{ width: `${Math.max(3, item.repliedVal / max * 100)}%` }} title={`回复 ${item.repliedVal}`} />
          </div>
          <strong>{item.sentVal}/{item.repliedVal}</strong>
        </div>
      )) : <EmptyState message="暂无邮件趋势数据。" />}
    </div>
  );
}

function defaultPersonalFilters() {
  const now = new Date();
  const from = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = formatDateInput(now);
  return { from, to, country: "", customer_type_id: "", stage: "" };
}
