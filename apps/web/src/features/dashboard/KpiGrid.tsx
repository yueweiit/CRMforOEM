import type { ReactNode } from "react";
import { ArrowUpRight, CalendarClock, Clock, MailCheck, Target, UsersRound } from "lucide-react";
import { Metric } from "../../components/ui/Metric";
import { useI18n } from "../../i18n";

export function KpiGrid(props: {
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
  };
  isAdminWorkspace: boolean;
}) {
  const { summary, isAdminWorkspace } = props;
  const { t } = useI18n();
  return (
    <div className="metric-grid dashboard-kpis">
      <Metric icon={<UsersRound size={18} />} label={isAdminWorkspace ? t("dashboard.allCustomersTotal") : t("dashboard.myCustomersTotal")} value={summary.my_customer_total} tone="teal" />
      <Metric icon={<CalendarClock size={18} />} label={t("dashboard.todayPendingFollowups")} value={summary.today_pending_followups} tone="amber" />
      <Metric icon={<ArrowUpRight size={18} />} label={t("dashboard.monthNewCustomers")} value={summary.month_new_customers} tone="rose" />
      <Metric icon={<Target size={18} />} label={t("dashboard.monthResearchDone")} value={summary.month_researched_customers} tone="neutral" />
      <Metric icon={<MailCheck size={18} />} label={t("dashboard.monthSentEmails")} value={summary.month_sent_emails} tone="teal" />
      <Metric icon={<MailCheck size={18} />} label={t("dashboard.monthRepliedCustomers")} value={summary.month_replied_customers} tone="amber" />
      <Metric icon={<Target size={18} />} label={t("dashboard.monthReplyRate")} value={`${(summary.month_reply_rate * 100).toFixed(1)}%`} tone="rose" />
      <Metric icon={<Target size={18} />} label={t("dashboard.monthQuotedCustomers")} value={summary.month_quoted_customers} tone="neutral" />
      <Metric icon={<Target size={18} />} label={t("dashboard.monthSampleCustomers")} value={summary.month_sample_customers} tone="teal" />
      <Metric icon={<Target size={18} />} label={t("dashboard.monthWonCustomers")} value={summary.month_won_customers} tone="amber" />
      <Metric icon={<Clock size={18} />} label={t("dashboard.overdueTasks")} value={summary.overdue_tasks} tone="rose" />
    </div>
  );
}
