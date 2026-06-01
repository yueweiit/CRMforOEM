import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarClock, Clock, MailCheck, Target, UsersRound } from "lucide-react";
import { apiGet } from "../api/http";
import { useSse } from "../hooks/useSse";

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
  high_priority_customers: CustomerRow[];
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

type DashboardFilterOptions = {
  countries: string[];
  customer_types: Array<{ id: string; name: string }>;
  stages: string[];
};

type CustomerRow = {
  id: string;
  name: string;
  country?: string | null;
  stage: string;
  owner_name: string;
  score?: number | null;
  grade?: string | null;
  quote_amount?: number;
  next_task_due_at?: string | null;
  updated_at?: string;
  priority_level?: "A" | "B" | "C";
  priority_reason?: string;
  priority_tags?: string[];
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
    queryFn: () => apiGet<DashboardFilterOptions>("/dashboards/filter-options"),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const { data = fallback, isFetching, isError } = useQuery({
    queryKey: ["dashboard", "me", queryString],
    queryFn: () => apiGet<PersonalDashboard>(`/dashboards/me${queryString}`),
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
        <button className="primary-button">
          <ArrowUpRight size={16} />
          新增客户
        </button>
      </header>

      <DashboardFilterBar filters={filters} options={filterOptions} onChange={setFilters} />
      {isError ? <section className="panel error-state">看板数据加载失败，请稍后重试。</section> : null}
      {isFetching ? <section className="panel loading-state">正在刷新看板数据...</section> : null}

      <div className="metric-grid dashboard-kpis">
        <Metric icon={<UsersRound size={18} />} label="我的客户总数" value={summary.my_customer_total} tone="teal" />
        <Metric icon={<CalendarClock size={18} />} label="今日待跟进" value={summary.today_pending_followups} tone="amber" />
        <Metric icon={<ArrowUpRight size={18} />} label="本月新增客户" value={summary.month_new_customers} tone="rose" />
        <Metric icon={<Target size={18} />} label="本月背调完成" value={summary.month_researched_customers} tone="neutral" />
        <Metric icon={<MailCheck size={18} />} label="本月邮件发送" value={summary.month_sent_emails} tone="teal" />
        <Metric icon={<MailCheck size={18} />} label="本月客户回复" value={summary.month_replied_customers} tone="amber" />
        <Metric icon={<Target size={18} />} label="本月回复率" value={`${(summary.month_reply_rate * 100).toFixed(1)}%`} tone="rose" />
        <Metric icon={<Target size={18} />} label="本月报价客户" value={summary.month_quoted_customers} tone="neutral" />
        <Metric icon={<Target size={18} />} label="本月样品客户" value={summary.month_sample_customers} tone="teal" />
        <Metric icon={<Target size={18} />} label="本月成交客户" value={summary.month_won_customers} tone="amber" />
        <Metric icon={<Clock size={18} />} label="逾期任务" value={summary.overdue_tasks} tone="rose" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>客户开发阶段分布</h2>
            <span>个人客户池</span>
          </div>
          <BarList data={data.stage_distribution.map((item) => ({ label: stageLabel(item.stage), value: item.count }))} />
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
          <CustomerTable rows={data.high_priority_customers} />
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
              <div className="empty-state">今天没有待跟进任务。</div>
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

function DashboardFilterBar(props: {
  filters: ReturnType<typeof defaultPersonalFilters>;
  options?: DashboardFilterOptions;
  onChange: (filters: ReturnType<typeof defaultPersonalFilters>) => void;
}) {
  const stages = props.options?.stages?.length ? props.options.stages : Object.keys(stageLabels);
  return (
    <section className="filter-panel">
      <label>
        <span>开始日期</span>
        <input type="date" value={props.filters.from} onChange={(event) => props.onChange({ ...props.filters, from: event.target.value })} />
      </label>
      <label>
        <span>结束日期</span>
        <input type="date" value={props.filters.to} onChange={(event) => props.onChange({ ...props.filters, to: event.target.value })} />
      </label>
      <label>
        <span>国家</span>
        <select value={props.filters.country} onChange={(event) => props.onChange({ ...props.filters, country: event.target.value })}>
          <option value="">全部国家</option>
          {props.options?.countries?.map((country) => (
            <option value={country} key={country}>{country}</option>
          ))}
        </select>
      </label>
      <label>
        <span>客户类型</span>
        <select value={props.filters.customer_type_id} onChange={(event) => props.onChange({ ...props.filters, customer_type_id: event.target.value })}>
          <option value="">全部类型</option>
          {props.options?.customer_types?.map((type) => (
            <option value={type.id} key={type.id}>{type.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>阶段</span>
        <select value={props.filters.stage} onChange={(event) => props.onChange({ ...props.filters, stage: event.target.value })}>
          <option value="">全部阶段</option>
          {stages.map((stage) => (
            <option value={stage} key={stage}>{stageLabel(stage)}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function Metric(props: { icon: ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <section className={`metric ${props.tone}`}>
      <span>{props.icon}</span>
      <div>
        <p>{props.label}</p>
        <strong>{props.value}</strong>
      </div>
    </section>
  );
}

function BarList(props: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...props.data.map((item) => item.value));
  return (
    <div className="bar-list">
      {props.data.length ? props.data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${Math.max(4, item.value / max * 100)}%` }} /></div>
          <strong>{item.value}</strong>
        </div>
      )) : <div className="empty-state">暂无分布数据。</div>}
    </div>
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
      )) : <div className="empty-state">暂无邮件趋势数据。</div>}
    </div>
  );
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  if (!rows.length) {
    return <div className="empty-state">暂无高优先级客户。</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>优先级</th>
          <th>客户</th>
          <th>国家</th>
          <th>阶段</th>
          <th>评分</th>
          <th>负责人</th>
          <th>下一任务</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((customer) => (
          <tr key={customer.id}>
            <td>
              <span
                className={`priority-pill ${(customer.priority_level ?? "C").toLowerCase()}`}
                title={customer.priority_reason}
              >
                {customer.priority_level ?? "-"}
              </span>
            </td>
            <td>
              {customer.name}
              {customer.priority_tags && customer.priority_tags.length > 0 ? (
                <div className="inline-tags">
                  {customer.priority_tags.map((tag) => (
                    <span className="mini-tag" key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </td>
            <td>{customer.country ?? "-"}</td>
            <td><span className="status-pill">{stageLabel(customer.stage)}</span></td>
            <td>{customer.score ?? "-"} {customer.grade ? `(${customer.grade})` : ""}</td>
            <td>{customer.owner_name}</td>
            <td>{customer.next_task_due_at ? formatDateTime(customer.next_task_due_at) : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function defaultPersonalFilters() {
  const now = new Date();
  const from = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = formatDateInput(now);
  return { from, to, country: "", customer_type_id: "", stage: "" };
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

const stageLabels: Record<string, string> = {
  PENDING_RESEARCH: "待背调",
  RESEARCHING: "背调中",
  RESEARCHED: "已背调",
  PENDING_EMAIL_GENERATION: "待生成邮件",
  PENDING_EMAIL_SEND: "待发送邮件",
  FIRST_EMAIL_SENT: "已发送首封邮件",
  PENDING_SECOND_FOLLOW_UP: "待二次跟进",
  REPLIED: "客户已回复",
  REQUIREMENT_CONFIRMING: "需求确认中",
  QUOTING: "报价中",
  SAMPLING: "样品中",
  NEGOTIATING: "订单谈判",
  WON: "已成交",
  PAUSED: "暂缓开发",
  INVALID: "无效客户",
  BLACKLISTED: "黑名单"
};

function stageLabel(stage: string) {
  return stageLabels[stage] ?? stage;
}

const taskTypeLabels: Record<string, string> = {
  COMPLETE_RESEARCH: "完成背调",
  GENERATE_EMAIL: "生成邮件",
  REVIEW_EMAIL: "审核邮件",
  SECOND_FOLLOW_UP: "二次跟进",
  THIRD_FOLLOW_UP: "三次跟进",
  REQUIREMENT_CONFIRMATION: "需求确认",
  QUOTE_FOLLOW_UP: "报价跟进",
  SAMPLE_FOLLOW_UP: "样品跟进",
  STAGE_STALE_REMINDER: "阶段停滞提醒",
  CUSTOM: "自定义任务"
};

function taskTypeLabel(type: string) {
  return taskTypeLabels[type] ?? type;
}
