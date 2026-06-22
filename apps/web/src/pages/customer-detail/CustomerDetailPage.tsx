import { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loading } from "@alifd/next";
import "@alifd/next/lib/loading/style.js";
import { Bot, Globe2, MailPlus, NotebookTabs, Star } from "lucide-react";
import { apiGet, apiPost } from "../../api/http";
import type { CustomerDetail, CustomerBackgroundTaskView, CustomerBackgroundTasksResponse, AcceptedResponse, WebsiteAnalysis, ResearchReport } from "./shared/types";
import { OverviewPanel } from "./OverviewPanel";
import { WebsiteAnalysisPanel } from "./WebsiteAnalysisPanel";
import { ResearchPanel } from "./ResearchPanel";
import { ScorePanel } from "./ScorePanel";
import { EmailPanel } from "./EmailPanel";
import { FollowUpPanel } from "./FollowUpPanel";
import { QuotePanel } from "./QuotePanel";
import { SamplePanel } from "./SamplePanel";

const tabs = [
  { to: "overview", label: "概览", icon: NotebookTabs },
  { to: "website-analysis", label: "官网分析", icon: Globe2 },
  { to: "research", label: "背调报告", icon: Bot },
  { to: "oem-score", label: "OEM评分", icon: Star },
  { to: "email", label: "开发邮件", icon: MailPlus },
  { to: "follow-ups", label: "跟进", icon: NotebookTabs },
  { to: "quotes", label: "报价", icon: NotebookTabs },
  { to: "samples", label: "样品", icon: NotebookTabs }
];

export function CustomerDetailPage() {
  const { id = "", tab = "overview" } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiGet<CustomerDetail>(`/customers/${id}`),
    enabled: Boolean(id && localStorage.getItem("accessToken")),
    refetchInterval: (query) => {
      const data = query.state.data as CustomerDetail | undefined;
      const websiteStatus = data?.websiteAnalyses?.[0]?.status;
      const researchStatus = data?.researchReports?.[0]?.status;
      return isPendingStatus(websiteStatus) || isPendingStatus(researchStatus) ? 3000 : false;
    },
    refetchIntervalInBackground: true
  });
  const customer = customerQuery.data;

  const tasksQuery = useQuery({
    queryKey: ["customer-background-tasks", id],
    queryFn: () => apiGet<CustomerBackgroundTasksResponse>(`/customers/${id}/background-tasks`),
    enabled: Boolean(id && localStorage.getItem("accessToken")),
    refetchInterval: (query) => {
      const data = query.state.data as CustomerBackgroundTasksResponse | undefined;
      return data?.active?.length ? 3000 : false;
    },
    refetchIntervalInBackground: true
  });

  const activeTasks = tasksQuery.data?.active ?? [];
  const hasActiveTask = (type: CustomerBackgroundTaskView["type"]) =>
    activeTasks.some((task) => task.type === type);

  const refreshCustomer = () => queryClient.invalidateQueries({ queryKey: ["customer", id] });
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["customer-background-tasks", id] });

  const analyzeMutation = useMutation({
    mutationFn: () => apiPost<AcceptedResponse<{ analysis: WebsiteAnalysis }>>(`/customers/${id}/website-analyses`),
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
    },
    onError: () => setMessage("官网分析提交失败，请先确认已保存有效官网 URL。")
  });
  const researchMutation = useMutation({
    mutationFn: () => apiPost<AcceptedResponse<{ report: ResearchReport }>>(`/customers/${id}/research-reports`, {}),
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
    },
    onError: () => setMessage("背调任务提交失败，请刷新后重试。")
  });
  const scoreMutation = useMutation({ mutationFn: () => apiPost(`/customers/${id}/oem-fit-scores`), onSuccess: () => { setMessage("OEM评分已生成。"); refreshCustomer(); } });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{customer?.websiteDomain ?? `Customer #${id}`}</p>
          <h1>{customer?.name ?? "客户详情"}</h1>
        </div>
        <div className="toolbar">
          <button
            className={`secondary-button${hasActiveTask("WEBSITE_ANALYSIS") ? " active-task" : ""}`}
            title={customer?.websiteUrl ? "抓取并分析客户官网" : "请先在概览中编辑并保存官网URL"}
            onClick={() => analyzeMutation.mutate()}
            disabled={!customer?.websiteUrl || analyzeMutation.isPending || hasActiveTask("WEBSITE_ANALYSIS")}
          >
            {hasActiveTask("WEBSITE_ANALYSIS") ? <ProcessingButtonLabel /> : customer?.websiteUrl ? "官网分析" : "先填写官网"}
          </button>
          <button
            className={`secondary-button${hasActiveTask("RESEARCH_REPORT") ? " active-task" : ""}`}
            onClick={() => researchMutation.mutate()}
            disabled={researchMutation.isPending || hasActiveTask("RESEARCH_REPORT")}
          >
            {hasActiveTask("RESEARCH_REPORT") ? <ProcessingButtonLabel /> : "生成背调"}
          </button>
          <button className="secondary-button" onClick={() => scoreMutation.mutate()} disabled={scoreMutation.isPending}>OEM评分</button>
        </div>
      </header>

      <nav className="tab-bar">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={`/customers/${id}/${item.to}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}>
              <Icon size={15} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <CustomerTaskStrip tasks={activeTasks} />
      {message ? <section className="panel loading-state">{message}</section> : null}
      {customerQuery.isLoading ? <section className="panel empty-state">正在加载客户详情...</section> : null}
      {customerQuery.isError && !customer ? <section className="panel error-state">客户详情加载失败，请重新登录或刷新页面。</section> : null}
      {customerQuery.isError && customer ? <section className="panel error-state">客户详情刷新失败，当前显示的是上一次加载的数据。</section> : null}
      {customer ? <CustomerTab tab={tab} customer={customer} customerId={id} onChanged={refreshCustomer} /> : null}
    </section>
  );
}

function ProcessingButtonLabel() {
  return (
    <span className="button-loading">
      <Loading className="button-loading-icon" inline visible size="medium" color="#0f766e" />
      <span className="button-loading-text">{"处理中..."}</span>
    </span>
  );
}

function CustomerTab(props: { tab: string; customer: CustomerDetail; customerId: string; onChanged: () => void }) {
  if (props.tab === "website-analysis") return <WebsiteAnalysisPanel customer={props.customer} />;
  if (props.tab === "research") return <ResearchPanel customer={props.customer} />;
  if (props.tab === "oem-score") return <ScorePanel customer={props.customer} />;
  if (props.tab === "email") return <EmailPanel customer={props.customer} customerId={props.customerId} onChanged={props.onChanged} />;
  if (props.tab === "follow-ups") return <FollowUpPanel tasks={props.customer.followUpTasks} />;
  if (props.tab === "quotes") return <QuotePanel customerId={props.customerId} />;
  if (props.tab === "samples") return <SamplePanel customerId={props.customerId} />;
  return <OverviewPanel customer={props.customer} customerId={props.customerId} onChanged={props.onChanged} />;
}

function CustomerTaskStrip({ tasks }: { tasks: CustomerBackgroundTaskView[] }) {
  if (!tasks.length) return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>后台处理中</h2>
        <span>{tasks.length} 个任务</span>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <div className="task-row" key={`${task.type}-${task.id}`}>
            <div />
            <div>
              <strong>{task.title}</strong>
              <span>{backgroundTaskStatusText(task.status)}</span>
              {task.errorMessage ? <span>{task.errorMessage}</span> : null}
            </div>
            <span className="status-pill">{backgroundTaskTypeText(task.type)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function backgroundTaskStatusText(status: CustomerBackgroundTaskView["status"]) {
  switch (status) {
    case "QUEUED": return "排队中";
    case "RUNNING": return "处理中";
    case "SUCCEEDED": return "已完成";
    case "FAILED": return "失败";
    case "CANCELLED": return "已取消";
    default: return status;
  }
}

function backgroundTaskTypeText(type: CustomerBackgroundTaskView["type"]) {
  switch (type) {
    case "WEBSITE_ANALYSIS": return "官网分析";
    case "RESEARCH_REPORT": return "背调报告";
    case "EMAIL_DRAFT": return "邮件草稿";
    default: return type;
  }
}

function isPendingStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}
