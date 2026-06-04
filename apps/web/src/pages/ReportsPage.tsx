import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BarChart3, LineChart, PieChart, Trophy, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";
import { apiGet } from "../api/http";
import { AppSelect } from "../components/AppSelect";

type ManagementDashboard = {
  summary: {
    team_customer_total: number;
    researched_customers: number;
    sent_emails: number;
    reply_rate: number;
    quote_conversion_rate: number;
    sample_conversion_rate: number;
    won_conversion_rate: number;
  };
  new_customer_trend: Array<{ bucket: string; value: number }>;
  country_distribution: Array<{ country: string; count: number }>;
  type_distribution: Array<{ customer_type_id: string | null; customer_type: string; count: number }>;
  stage_distribution: Array<{ stage: string; count: number }>;
  sales_ranking: Array<{
    owner_id: string;
    owner_name: string;
    customer_total: number;
    new_customers: number;
    researched_customers: number;
    sent_emails: number;
    replied_customers: number;
    quoted_customers: number;
    sample_customers: number;
    won_customers: number;
    won_rate: number;
  }>;
  high_value_customers: CustomerRow[];
  risk_customers: CustomerRow[];
  product_line_feedback: Array<{ product_line: string; customer_count: number }>;
};

type DashboardFilterOptions = {
  teams: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; teamId?: string | null }>;
  countries: string[];
  customer_types: Array<{ id: string; name: string }>;
  stages: string[];
};

type CustomerRow = {
  id: string;
  name: string;
  country?: string | null;
  stage: string;
  risk_level?: string;
  owner_name: string;
  score?: number | null;
  grade?: string | null;
  quote_amount?: number;
  overdue_tasks?: number;
};

const fallback: ManagementDashboard = {
  summary: {
    team_customer_total: 0,
    researched_customers: 0,
    sent_emails: 0,
    reply_rate: 0,
    quote_conversion_rate: 0,
    sample_conversion_rate: 0,
    won_conversion_rate: 0
  },
  new_customer_trend: [],
  country_distribution: [],
  type_distribution: [],
  stage_distribution: [],
  sales_ranking: [],
  high_value_customers: [],
  risk_customers: [],
  product_line_feedback: []
};

export function ReportsPage() {
  const { scope = "management" } = useParams();
  const endpoint = scope === "team" ? "/dashboards/team" : "/dashboards/management";
  const [filters, setFilters] = useState(defaultReportFilters());
  const queryString = useMemo(() => toQueryString(filters), [filters]);
  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filter-options", scope],
    queryFn: () => apiGet<DashboardFilterOptions>("/dashboards/filter-options"),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const { data = fallback, isFetching, isError } = useQuery({
    queryKey: ["dashboard", scope, queryString],
    queryFn: () => apiGet<ManagementDashboard>(`${endpoint}${queryString}`),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });
  const summary = data.summary;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>数据看板</h1>
        </div>
      </header>

      <ReportFilterBar filters={filters} options={filterOptions} onChange={setFilters} />
      {isError ? <section className="panel error-state">看板数据加载失败，请检查权限或稍后重试。</section> : null}
      {isFetching ? <section className="panel loading-state">正在刷新看板数据...</section> : null}

      <div className="metric-grid dashboard-kpis">
        <Metric icon={<UsersRound size={18} />} label="客户总数" value={summary.team_customer_total} tone="teal" />
        <Metric icon={<BarChart3 size={18} />} label="背调完成数量" value={summary.researched_customers} tone="amber" />
        <Metric icon={<LineChart size={18} />} label="邮件发送数量" value={summary.sent_emails} tone="rose" />
        <Metric icon={<PieChart size={18} />} label="邮件回复率" value={`${(summary.reply_rate * 100).toFixed(1)}%`} tone="neutral" />
        <Metric icon={<Trophy size={18} />} label="报价转化率" value={`${(summary.quote_conversion_rate * 100).toFixed(1)}%`} tone="teal" />
        <Metric icon={<Trophy size={18} />} label="样品转化率" value={`${(summary.sample_conversion_rate * 100).toFixed(1)}%`} tone="amber" />
        <Metric icon={<Trophy size={18} />} label="成交转化率" value={`${(summary.won_conversion_rate * 100).toFixed(1)}%`} tone="rose" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>新增客户趋势</h2>
            <span>{filters.group_by}</span>
          </div>
          <SingleTrend data={data.new_customer_trend} />
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>客户开发阶段分布</h2>
            <span>漏斗口径</span>
          </div>
          <BarList data={data.stage_distribution.map((item) => ({ label: stageLabel(item.stage), value: item.count }))} />
        </section>
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>客户国家分布</h2>
            <span>Top countries</span>
          </div>
          <BarList data={data.country_distribution.map((item) => ({ label: item.country, value: item.count }))} />
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>客户类型分布</h2>
            <span>客户画像</span>
          </div>
          <BarList data={data.type_distribution.map((item) => ({ label: item.customer_type, value: item.count }))} />
        </section>
      </div>

      <section className="table-panel">
        <div className="panel-title">
          <h2>业务员绩效排行</h2>
          <span>成交、回复、发送综合排序</span>
        </div>
        <RankingTable rows={data.sales_ranking} />
      </section>

      <div className="content-grid">
        <section className="table-panel">
          <div className="panel-title">
            <h2>高价值客户</h2>
            <span>A/B 评分、报价高或阶段靠后</span>
          </div>
          <CustomerTable rows={data.high_value_customers} mode="value" />
        </section>
        <section className="table-panel">
          <div className="panel-title">
            <h2>风险客户</h2>
            <span>高风险、低评分、逾期</span>
          </div>
          <CustomerTable rows={data.risk_customers} mode="risk" />
        </section>
      </div>

      <section className="panel">
        <div className="panel-title">
          <h2>产品线反馈统计</h2>
          <span>来自官网产品分析</span>
        </div>
        <BarList data={data.product_line_feedback.map((item) => ({ label: item.product_line, value: item.customer_count }))} />
      </section>
    </section>
  );
}

function ReportFilterBar(props: {
  filters: ReturnType<typeof defaultReportFilters>;
  options?: DashboardFilterOptions;
  onChange: (filters: ReturnType<typeof defaultReportFilters>) => void;
}) {
  const stages = props.options?.stages?.length ? props.options.stages : Object.keys(stageLabels);
  return (
    <section className="filter-panel reports-filter">
      <label>
        <span>开始日期</span>
        <input type="date" value={props.filters.from} onChange={(event) => props.onChange({ ...props.filters, from: event.target.value })} />
      </label>
      <label>
        <span>结束日期</span>
        <input type="date" value={props.filters.to} onChange={(event) => props.onChange({ ...props.filters, to: event.target.value })} />
      </label>
      <label>
        <span>团队</span>
        <AppSelect
          variant="filter"
          value={props.filters.team_id}
          onChange={(team_id) => props.onChange({ ...props.filters, team_id })}
          options={[
            { value: "", label: "全部团队" },
            ...(props.options?.teams?.map((team) => ({ value: team.id, label: team.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>业务员</span>
        <AppSelect
          variant="filter"
          value={props.filters.owner_id}
          onChange={(owner_id) => props.onChange({ ...props.filters, owner_id })}
          options={[
            { value: "", label: "全部业务员" },
            ...(props.options?.users?.map((user) => ({ value: user.id, label: user.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>国家</span>
        <AppSelect
          variant="filter"
          value={props.filters.country}
          onChange={(country) => props.onChange({ ...props.filters, country })}
          options={[
            { value: "", label: "全部国家" },
            ...(props.options?.countries?.map((country) => ({ value: country, label: country })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>客户类型</span>
        <AppSelect
          variant="filter"
          value={props.filters.customer_type_id}
          onChange={(customer_type_id) => props.onChange({ ...props.filters, customer_type_id })}
          options={[
            { value: "", label: "全部类型" },
            ...(props.options?.customer_types?.map((type) => ({ value: type.id, label: type.name })) ?? [])
          ]}
        />
      </label>
      <label>
        <span>客户阶段</span>
        <AppSelect
          variant="filter"
          value={props.filters.stage}
          onChange={(stage) => props.onChange({ ...props.filters, stage })}
          options={[
            { value: "", label: "全部阶段" },
            ...stages.map((stage) => ({ value: stage, label: stageLabel(stage) }))
          ]}
        />
      </label>
      <label>
        <span>聚合粒度</span>
        <AppSelect
          variant="filter"
          value={props.filters.group_by}
          onChange={(group_by) => props.onChange({ ...props.filters, group_by })}
          options={[
            { value: "day", label: "按天" },
            { value: "week", label: "按周" },
            { value: "month", label: "按月" }
          ]}
        />
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

function SingleTrend(props: { data: Array<{ bucket: string; value: number }> }) {
  const max = Math.max(1, ...props.data.map((item) => item.value));
  return (
    <div className="trend-bars">
      {props.data.length ? props.data.map((item) => (
        <div className="trend-row" key={item.bucket}>
          <span>{item.bucket}</span>
          <div className="trend-stack">
            <i className="sent" style={{ width: `${Math.max(3, item.value / max * 100)}%` }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      )) : <div className="empty-state">暂无趋势数据。</div>}
    </div>
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
      )) : <div className="empty-state">暂无统计数据。</div>}
    </div>
  );
}

function RankingTable({ rows }: { rows: ManagementDashboard["sales_ranking"] }) {
  if (!rows.length) return <div className="empty-state">暂无业务员绩效数据。</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>业务员</th>
          <th>客户</th>
          <th>新增</th>
          <th>背调</th>
          <th>发送</th>
          <th>回复</th>
          <th>报价</th>
          <th>样品</th>
          <th>成交</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.owner_id}>
            <td>{row.owner_name}</td>
            <td>{row.customer_total}</td>
            <td>{row.new_customers}</td>
            <td>{row.researched_customers}</td>
            <td>{row.sent_emails}</td>
            <td>{row.replied_customers}</td>
            <td>{row.quoted_customers}</td>
            <td>{row.sample_customers}</td>
            <td>{row.won_customers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustomerTable({ rows, mode }: { rows: CustomerRow[]; mode: "value" | "risk" }) {
  if (!rows.length) return <div className="empty-state">暂无客户数据。</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>客户</th>
          <th>国家</th>
          <th>阶段</th>
          <th>{mode === "value" ? "评分/金额" : "风险/逾期"}</th>
          <th>负责人</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((customer) => (
          <tr key={customer.id}>
            <td>{customer.name}</td>
            <td>{customer.country ?? "-"}</td>
            <td><span className="status-pill">{stageLabel(customer.stage)}</span></td>
            <td>
              {mode === "value"
                ? `${customer.score ?? "-"} ${customer.grade ? `(${customer.grade})` : ""} / ${customer.quote_amount ?? 0}`
                : `${customer.risk_level ?? "-"} / ${customer.overdue_tasks ?? 0}`}
            </td>
            <td>{customer.owner_name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function defaultReportFilters() {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 29);
  return {
    from: formatDateInput(fromDate),
    to: formatDateInput(now),
    team_id: "",
    owner_id: "",
    country: "",
    customer_type_id: "",
    stage: "",
    group_by: "day"
  };
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
