import type { ToastType } from "../components/Toast";
import type { TranslationKey } from "../i18n/resources";

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
  | "THIRD_FOLLOW_UP"
  | "CUSTOM";

type T = (key: TranslationKey) => string;

export function getTaskToastConfig(t: T): Record<FollowUpToastTaskType, TaskToastConfig> {
  return {
    REQUIREMENT_CONFIRMATION: createConfig(t, "events.requirementTask", (customerId) => `/customers/${customerId}`),
    SAMPLE_FOLLOW_UP: createConfig(t, "events.sampleTask", (customerId) => `/customers/${customerId}`),
    QUOTE_FOLLOW_UP: createConfig(t, "events.quoteTask", (customerId) => `/customers/${customerId}`),
    SECOND_FOLLOW_UP: createConfig(t, "events.secondFollowUpTask", (customerId) => `/customers/${customerId}`),
    THIRD_FOLLOW_UP: createConfig(t, "events.thirdFollowUpTask", () => "/follow-ups"),
    CUSTOM: createConfig(t, "events.customTask", () => "/follow-ups")
  };
}

function createConfig(t: T, messageKey: TranslationKey, actionHref: (customerId: string) => string): TaskToastConfig {
  return {
    type: "notice",
    title: t("events.taskGenerated"),
    message: t(messageKey),
    actionHref,
    actionLabel: t("common.view")
  };
}
