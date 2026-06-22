import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LineChart, PieChart, Trophy, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";
import { stageLabel } from "@oem-crm/shared";
import { apiGet } from "../../api/http";
import { BarList } from "../../components/ui/BarList";
import { Metric } from "../../components/ui/Metric";
import { formatDateInput } from "../../utils/format";
import { toQueryString } from "../../utils/string";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingState } from "../../components/ui/LoadingState";
import type { ReportCustomerRow } from "../../types/customer";
import { ReportFilterBar, type DashboardFilterOptions } from "./ReportFilterBar";
import { SalesRankingTable, type SalesRankingRow } from "./SalesRankingTable";
import { CustomerTable } from "./CustomerTable";

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
  sales_ranking: SalesRankingRow[];
  high_value_customers: ReportCustomerRow[];
  risk_customers: ReportCustomerRow[];
  product_line_feedback: Array<{ product_line: string; customer_count: number }>;
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
      {isError ? <section className="panel"><ErrorState message="看板数据加载失败，请检查权限或稍后重试。" /></section> : null}
      {isFetching ? <section className="panel"><LoadingState message="正在刷新看板数据..." /></section> : null}

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
        <SalesRankingTable rows={data.sales_ranking} />
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
      )) : <EmptyState message="暂无趋势数据。" />}
    </div>
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
