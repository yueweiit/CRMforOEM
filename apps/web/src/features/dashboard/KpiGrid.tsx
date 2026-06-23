import type { ReactNode } from "react";
import { ArrowUpRight, CalendarClock, Clock, MailCheck, Target, UsersRound } from "lucide-react";
import { Metric } from "../../components/ui/Metric";

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
  return (
    <div className="metric-grid dashboard-kpis">
      <Metric icon={<UsersRound size={18} />} label={isAdminWorkspace ? "全部客户总数" : "我的客户总数"} value={summary.my_customer_total} tone="teal" />
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
  );
}
