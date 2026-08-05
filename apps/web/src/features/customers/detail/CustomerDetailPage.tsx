import { useEffect, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Loading } from "@alifd/next";
import "@alifd/next/lib/dialog/style.js";
import "@alifd/next/lib/loading/style.js";
import { Bot, Globe2, MailPlus, NotebookTabs, Star } from "lucide-react";
import { DetailPageHeader } from "../../../components/ui/DetailPageHeader";
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
import { useI18n } from "../../../i18n";
import type { TranslationKey } from "../../../i18n/resources";
import { getActiveTaskSignature, getCompletedActiveTaskTypes, getGenerationDialogBusy } from "./customer-task-state";
import type { GenerationAction } from "./customer-task-state";

const tabs: Array<{ to: string; labelKey: TranslationKey; icon: typeof NotebookTabs }> = [
  { to: "overview", labelKey: "customerDetail.tabOverview", icon: NotebookTabs },
  { to: "website-analysis", labelKey: "customerDetail.tabWebsiteAnalysis", icon: Globe2 },
  { to: "research", labelKey: "customerDetail.tabResearch", icon: Bot },
  { to: "oem-score", labelKey: "customerDetail.tabOemScore", icon: Star },
  { to: "email", labelKey: "customerDetail.tabEmail", icon: MailPlus },
  { to: "follow-ups", labelKey: "customerDetail.tabFollowUps", icon: NotebookTabs },
  { to: "quotes", labelKey: "customerDetail.tabQuotes", icon: NotebookTabs },
  { to: "samples", labelKey: "customerDetail.tabSamples", icon: NotebookTabs }
];

export function CustomerDetailPage() {
  const { id = "", tab = "overview" } = useParams();
  const queryClient = useQueryClient();
  const { t } = useI18n();
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
    onError: () => setMessage(t("customerDetail.websiteSubmitError"))
  });
  const researchMutation = useMutation({
    mutationFn: () => createResearchReport<AcceptedResponse<{ report: ResearchReport }>>(id),
    onSuccess: () => {
      setMessage("");
      refreshCustomer();
      refreshTasks();
      queryClient.invalidateQueries({ queryKey: ["customer", id, "research-report-history"] });
    },
    onError: () => setMessage(t("customerDetail.researchSubmitError"))
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
    onError: () => setMessage(t("customerDetail.oemSubmitError"))
  });
  const isOemScoreGenerating = scoreMutation.isPending || hasActiveTask("OEM_FIT_SCORE");
  const generationDialogBusy = getGenerationDialogBusy(pendingAction, {
    websitePending: analyzeMutation.isPending,
    researchPending: researchMutation.isPending,
    oemPending: scoreMutation.isPending
  });

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
      <DetailPageHeader
        backTo="/customers"
        backLabel={t("customerDetail.backToPool")}
        eyebrow={customer?.websiteDomain}
        title={customer?.name ?? t("customerDetail.detailFallbackTitle")}
        breadcrumbs={[
          { label: t("customerDetail.breadcrumbCustomers"), to: "/customers" },
          { label: customer?.name ?? t("customerDetail.detailFallbackTitle") }
        ]}
        actions={(
          <>
            <button
              className={`secondary-button${hasActiveTask("WEBSITE_ANALYSIS") ? " active-task" : ""}`}
              title={customer?.websiteUrl ? t("customerDetail.analyzeWebsiteTitle") : t("customerDetail.fillWebsiteTitle")}
              onClick={() => openGenerationConfirm("website")}
              disabled={!customer?.websiteUrl || analyzeMutation.isPending || hasActiveTask("WEBSITE_ANALYSIS")}
            >
              {hasActiveTask("WEBSITE_ANALYSIS") ? <ProcessingButtonLabel /> : customer?.websiteUrl ? t("customerDetail.analyzeWebsite") : t("customerDetail.fillWebsiteFirst")}
            </button>
            <button
              className={`secondary-button${hasActiveTask("RESEARCH_REPORT") ? " active-task" : ""}`}
              onClick={() => openGenerationConfirm("research")}
              disabled={researchMutation.isPending || hasActiveTask("RESEARCH_REPORT")}
            >
              {hasActiveTask("RESEARCH_REPORT") ? <ProcessingButtonLabel /> : t("customerDetail.generateResearch")}
            </button>
            <button
              className={`secondary-button${isOemScoreGenerating ? " active-task" : ""}`}
              onClick={() => openGenerationConfirm("oem")}
              disabled={isOemScoreGenerating}
            >
              {isOemScoreGenerating ? <ProcessingButtonLabel /> : t("customerDetail.generateOemScore")}
            </button>
          </>
        )}
      />

      <GenerationConfirmDialog
        action={pendingAction}
        busy={generationDialogBusy}
        onCancel={closeGenerationConfirm}
        onConfirm={confirmGenerationAction}
      />

      <nav className="tab-bar">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={`/customers/${id}/${item.to}`} className={({ isActive }) => `tab-link ${isActive ? "active" : ""}`}>
              <Icon size={15} />
              {t(item.labelKey)}
            </NavLink>
          );
        })}
      </nav>

      <CustomerTaskStrip tasks={activeTasks} />
      {message ? <section className="panel error-state">{message}</section> : null}
      {customerQuery.isLoading ? <section className="panel empty-state">{t("customerDetail.loadingDetail")}</section> : null}
      {customerQuery.isError && !customer ? <section className="panel error-state">{t("customerDetail.loadDetailError")}</section> : null}
      {customerQuery.isError && customer ? <section className="panel error-state">{t("customerDetail.refreshDetailError")}</section> : null}
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

function GenerationConfirmDialog(props: {
  action: GenerationAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const config = props.action ? generationActionConfig(props.action, t) : undefined;
  return (
    <Dialog
      v2
      className="crm-action-dialog"
      title={config?.title ?? ""}
      visible={Boolean(props.action)}
      footer={(
        <div className="toolbar crm-dialog-footer">
          <button className="secondary-button" onClick={props.onCancel} type="button">
            {t("common.cancel")}
          </button>
          <button className="primary-button" disabled={props.busy} onClick={props.onConfirm} type="button">
            {props.busy ? t("customerDetail.submitting") : config?.confirmText ?? t("customerDetail.confirmDefault")}
          </button>
        </div>
      )}
      onClose={props.onCancel}
    >
      {config?.description}
    </Dialog>
  );
}

function generationActionConfig(action: GenerationAction, t: ReturnType<typeof useI18n>["t"]) {
  const configs: Record<GenerationAction, { title: string; description: string; confirmText: string }> = {
    website: {
      title: t("customerDetail.confirmWebsiteTitle"),
      description: t("customerDetail.confirmWebsiteDescription"),
      confirmText: t("customerDetail.confirmWebsiteAction")
    },
    research: {
      title: t("customerDetail.confirmResearchTitle"),
      description: t("customerDetail.confirmResearchDescription"),
      confirmText: t("customerDetail.confirmResearchAction")
    },
    oem: {
      title: t("customerDetail.confirmOemTitle"),
      description: t("customerDetail.confirmOemDescription"),
      confirmText: t("customerDetail.confirmOemAction")
    }
  };
  return configs[action];
}

function ProcessingButtonLabel() {
  const { t } = useI18n();
  return (
    <span className="button-loading">
      <Loading className="button-loading-icon" inline visible size="medium" color="#0f766e" />
      <span className="button-loading-text">{t("customerDetail.processing")}</span>
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
  const { t } = useI18n();
  if (!tasks.length) return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{t("customerDetail.backgroundProcessing")}</h2>
        <span>{t("customerDetail.taskCount").replace("{count}", String(tasks.length))}</span>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <div className="task-row" key={`${task.type}-${task.id}`}>
            <div />
            <div>
              <strong>{task.title}</strong>
              <span>{backgroundTaskStatusText(task.status, t)}</span>
              {task.errorMessage ? <span>{task.errorMessage}</span> : null}
            </div>
            <span className="status-pill">{backgroundTaskTypeText(task.type, t)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function backgroundTaskStatusText(status: CustomerBackgroundTaskView["status"], t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "QUEUED": return t("customerDetail.statusQueued");
    case "RUNNING": return t("customerDetail.statusRunning");
    case "SUCCEEDED": return t("customerDetail.statusSucceeded");
    case "FAILED": return t("customerDetail.statusFailed");
    case "CANCELLED": return t("customerDetail.statusCancelled");
    default: return status;
  }
}

function backgroundTaskTypeText(type: CustomerBackgroundTaskView["type"], t: ReturnType<typeof useI18n>["t"]) {
  switch (type) {
    case "WEBSITE_ANALYSIS": return t("customerDetail.taskWebsiteAnalysis");
    case "RESEARCH_REPORT": return t("customerDetail.taskResearchReport");
    case "OEM_FIT_SCORE": return t("customerDetail.taskOemScore");
    case "EMAIL_DRAFT": return t("customerDetail.taskEmailDraft");
    default: return type;
  }
}

function isPendingStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}
