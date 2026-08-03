import type { ToastType } from "../components/Toast";
import type { TranslationKey } from "../i18n/resources";

export type EmailToastEvent = "inbound-mail.received";

export type EmailToastContext = {
  customerId: string;
  customerName: string;
  subject: string;
  fromEmail?: string;
};

export type EmailToastConfig = {
  type: ToastType;
  title: string | ((context: EmailToastContext) => string);
  message: string | ((context: EmailToastContext) => string);
  dedupeKey?: (context: EmailToastContext) => string;
  actionHref?: (context: EmailToastContext) => string;
  actionLabel?: string;
};

type T = (key: TranslationKey) => string;

export function getEmailEventToastConfig(t: T): Record<EmailToastEvent, EmailToastConfig> {
  return {
    "inbound-mail.received": {
      type: "notice",
      title: t("events.inboundMailReceived"),
      message: (context) => `${context.customerName} · ${context.subject}`,
      dedupeKey: (context) => `mail:${context.customerId}:${context.subject}`,
      actionHref: (context) => `/customers/${context.customerId}/email`,
      actionLabel: t("common.viewEmail")
    }
  };
}
