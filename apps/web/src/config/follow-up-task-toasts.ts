import type { ToastType } from "../components/Toast";

export type TaskToastConfig = {
  type: ToastType;
  title: string;
  message: string;
  actionHref?: (customerId: string) => string;
  actionLabel?: string;
};

export type FollowUpToastTaskType =
  | "REQUIREMENT_CONFIRMATION"
  | "SAMPLE_FOLLOW_UP"
  | "QUOTE_FOLLOW_UP"
  | "SECOND_FOLLOW_UP"
  | "THIRD_FOLLOW_UP";

export const TASK_TOAST_CONFIG: Record<FollowUpToastTaskType, TaskToastConfig> = {
  REQUIREMENT_CONFIRMATION: {
    type: "info",
    title: "新跟进任务已生成",
    message: "客户回复后已创建需求确认任务",
    actionHref: (customerId) => `/customers/${customerId}`,
    actionLabel: "查看"
  },
  SAMPLE_FOLLOW_UP: {
    type: "info",
    title: "新跟进任务已生成",
    message: "已创建样品跟进任务，请确认样品测试反馈",
    actionHref: (customerId) => `/customers/${customerId}`,
    actionLabel: "查看"
  },
  QUOTE_FOLLOW_UP: {
    type: "info",
    title: "新跟进任务已生成",
    message: "已创建报价跟进任务，请确认客户报价反馈",
    actionHref: (customerId) => `/customers/${customerId}`,
    actionLabel: "查看"
  },
  SECOND_FOLLOW_UP: {
    type: "info",
    title: "新跟进任务已生成",
    message: "首封邮件已发送，已创建二次跟进任务",
    actionHref: (customerId) => `/customers/${customerId}`,
    actionLabel: "查看"
  },
  THIRD_FOLLOW_UP: {
    type: "info",
    title: "新跟进任务已生成",
    message: "二次跟进已过期，已创建三次跟进任务",
    actionHref: () => "/follow-ups",
    actionLabel: "查看"
  }
};
