import { useEffect, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Loading } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import "@alifd/next/lib/loading/style.js";
import { Bot, Globe2, MailPlus, NotebookTabs, Star } from "lucide-react";
import { getCustomerDetail, getCustomerBackgroundTasks, createWebsiteAnalysis, createResearchReport, createOemFitScore } from "../../../api/customers";
import type { CustomerDetail, CustomerBackgroundTaskView, CustomerBackgroundTasksResponse, AcceptedResponse, WebsiteAnalysis, ResearchReport } from "./shared/types";
import { OverviewPanel } from "./panels/OverviewPanel";
import { WebsiteAnalysisPanel } from "./panels/WebsiteAnalysisPanel";
import { ResearchPanel } from "./panels/ResearchPanel";
import { ScorePanel } from "./panels/ScorePanel";
import { EmailPanel } from "./panels/EmailPanel";
import { FollowUpPanel } from "./panels/FollowUpPanel";
import { QuotePanel } from "./panels/QuotePanel";
import { SamplePanel } from "./panels/SamplePanel";
import { getActiveTaskSignature, getCompletedActiveTaskTypes } from "./customer-task-state";

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
  const [pendingAction, setPendingAction] = useState<GenerationAction | null>(null);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomerDetail<CustomerDetail>(id),
    enabled: Boolean(id && localStorage.getItem("accessToken")),
    refetchInterval: (query) => {
      const data = query.state.data as CustomerDetail | undefined;
      const hasPendingWebsiteAnalysis = data?.websiteAnalyses?.some((analysis) => isPendingStatus(analysis.status));
      const hasPendingResearchReport = data?.researchReports?.some((report) => isPendingStatus(report.status));
      return hasPendingWebsiteAnalysis || hasPendingResearchReport ? 3000 : false;
    },
    refetchIntervalInBackground: true
  });
  const customer = customerQuery.data;

  const tasksQuery = useQuery({
    queryKey: ["customer-background-tasks", id],
    queryFn: () => getCustomerBackgroundTasks<CustomerBackgroundTasksResponse>(id),
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
  const previousActiveTasks = useRef<CustomerBackgroundTaskView[]>([]);
  const activeTaskSignature = getActiveTaskSignature(activeTasks);

  const refreshCustomer = () => queryClient.invalidateQueries({ queryKey: ["customer", id] });
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["customer-background-tasks", id] });

  useEffect(() => {
    const completedTypes = getCompletedActiveTaskTypes(previousActiveTasks.current, activeTasks);
    if (completedTypes.length > 0) {
      refreshCustomer();
      if (completedTypes.includes("WEBSITE_ANALYSIS")) {
        queryClient.invalidateQueries({ queryKey: ["customer", id, "website-analysis-history"] });
      }
      if (completedTypes.includes("RESEARCH_REPORT")) {
        queryClient.invalidateQueries({ queryKey: ["customer", id, "research-report-history"] });
      }
      queryClient.invalidateQueries({ queryKey: ["customer", id, "oem-score-history"] });
    }
    previousActiveTasks.current = activeTasks;
  }, [activeTaskSignature, activeTasks, id, queryClient]);

  const analyzeMutation = useMutation({
    mutationFn: () => createWebsiteAnalysis<AcceptedResponse<{ analysis: WebsiteAnalysis }>>(id),
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
      queryClient.invalidateQueries({ queryKey: ["customer", id, "website-analysis-history"] });
    },
    onError: () => setMessage("官网分析提交失败，请先确认已保存有效官网 URL。")
  });
  const researchMutation = useMutation({
    mutationFn: () => createResearchReport<AcceptedResponse<{ report: ResearchReport }>>(id),
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
      queryClient.invalidateQueries({ queryKey: ["customer", id, "research-report-history"] });
    },
    onError: () => setMessage("背调任务提交失败，请刷新后重试。")
  });
  const scoreMutation = useMutation({
    mutationFn: () => createOemFitScore(id),
    onMutate: () => {
      refreshTasks();
    },
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
      queryClient.invalidateQueries({ queryKey: ["customer", id, "oem-score-history"] });
    },
    onError: () => setMessage("OEM评分生成失败，请稍后重试。")
  });
  const isOemScoreGenerating = scoreMutation.isPending || hasActiveTask("OEM_FIT_SCORE");

  function openGenerationConfirm(action: GenerationAction) {
    setPendingAction(action);
  }

  function closeGenerationConfirm() {
    setPendingAction(null);
  }

  function confirmGenerationAction() {
    if (pendingAction === "website") analyzeMutation.mutate();
    if (pendingAction === "research") researchMutation.mutate();
    if (pendingAction === "oem") scoreMutation.mutate();
    setPendingAction(null);
  }

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
            onClick={() => openGenerationConfirm("website")}
            disabled={!customer?.websiteUrl || analyzeMutation.isPending || hasActiveTask("WEBSITE_ANALYSIS")}
          >
            {hasActiveTask("WEBSITE_ANALYSIS") ? <ProcessingButtonLabel /> : customer?.websiteUrl ? "官网分析" : "先填写官网"}
          </button>
          <button
            className={`secondary-button${hasActiveTask("RESEARCH_REPORT") ? " active-task" : ""}`}
            onClick={() => openGenerationConfirm("research")}
            disabled={researchMutation.isPending || hasActiveTask("RESEARCH_REPORT")}
          >
            {hasActiveTask("RESEARCH_REPORT") ? <ProcessingButtonLabel /> : "生成背调"}
          </button>
          <button
            className={`secondary-button${isOemScoreGenerating ? " active-task" : ""}`}
            onClick={() => openGenerationConfirm("oem")}
            disabled={isOemScoreGenerating}
          >
            {isOemScoreGenerating ? <ProcessingButtonLabel /> : "OEM评分"}
          </button>
        </div>
      </header>

      <GenerationConfirmDialog
        action={pendingAction}
        busy={analyzeMutation.isPending || researchMutation.isPending || isOemScoreGenerating}
        onCancel={closeGenerationConfirm}
        onConfirm={confirmGenerationAction}
      />

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
      {message ? <section className="panel error-state">{message}</section> : null}
      {customerQuery.isLoading ? <section className="panel empty-state">正在加载客户详情...</section> : null}
      {customerQuery.isError && !customer ? <section className="panel error-state">客户详情加载失败，请重新登录或刷新页面。</section> : null}
      {customerQuery.isError && customer ? <section className="panel error-state">客户详情刷新失败，当前显示的是上一次加载的数据。</section> : null}
      {customer ? (
        <CustomerTab
          tab={tab}
          customer={customer}
          customerId={id}
          onChanged={refreshCustomer}
          isWebsiteAnalysisGenerating={hasActiveTask("WEBSITE_ANALYSIS")}
          isResearchGenerating={hasActiveTask("RESEARCH_REPORT")}
          isOemScoreGenerating={isOemScoreGenerating}
        />
      ) : null}
    </section>
  );
}

type GenerationAction = "website" | "research" | "oem";

function GenerationConfirmDialog(props: {
  action: GenerationAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const config = props.action ? generationActionConfig[props.action] : undefined;
  return (
    <Dialog
      v2
      className="crm-action-dialog"
      title={config?.title ?? ""}
      visible={Boolean(props.action)}
      footer={(
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" disabled={props.busy} onClick={props.onCancel} type="button">
            取消
          </button>
          <button className="primary-button" disabled={props.busy} onClick={props.onConfirm} type="button">
            {props.busy ? "提交中..." : config?.confirmText ?? "确认"}
          </button>
        </div>
      )}
      onClose={props.onCancel}
    >
      {config?.description}
    </Dialog>
  );
}

const generationActionConfig: Record<GenerationAction, { title: string; description: string; confirmText: string }> = {
  website: {
    title: "确认发起官网分析",
    description: "系统会重新抓取客户官网并生成分析。当前已有报告会继续保留，可在历史记录中查看。",
    confirmText: "开始分析"
  },
  research: {
    title: "确认生成背调报告",
    description: "系统会整理客户资料、官网分析、公开搜索和企业资料库，生成新的背调报告。当前报告会继续保留。",
    confirmText: "生成背调"
  },
  oem: {
    title: "确认生成OEM评分",
    description: "系统会基于客户资料、官网分析、背调报告和我方资料重新计算 OEM 适配评分。当前评分会继续保留。",
    confirmText: "生成评分"
  }
};

function ProcessingButtonLabel() {
  return (
    <span className="button-loading">
      <Loading className="button-loading-icon" inline visible size="medium" color="#0f766e" />
      <span className="button-loading-text">{"处理中..."}</span>
    </span>
  );
}

function CustomerTab(props: {
  tab: string;
  customer: CustomerDetail;
  customerId: string;
  onChanged: () => void;
  isWebsiteAnalysisGenerating: boolean;
  isResearchGenerating: boolean;
  isOemScoreGenerating: boolean;
}) {
  if (props.tab === "website-analysis") return <WebsiteAnalysisPanel customer={props.customer} customerId={props.customerId} isGenerating={props.isWebsiteAnalysisGenerating} />;
  if (props.tab === "research") return <ResearchPanel customer={props.customer} customerId={props.customerId} isGenerating={props.isResearchGenerating} />;
  if (props.tab === "oem-score") return <ScorePanel customer={props.customer} customerId={props.customerId} isGenerating={props.isOemScoreGenerating} />;
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
    case "OEM_FIT_SCORE": return "OEM评分";
    case "EMAIL_DRAFT": return "邮件草稿";
    default: return type;
  }
}

function isPendingStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}
