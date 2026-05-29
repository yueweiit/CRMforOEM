import type { ToastType } from "../components/Toast";

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

export const EMAIL_EVENT_TOAST_CONFIG: Record<EmailToastEvent, EmailToastConfig> = {
  "inbound-mail.received": {
    type: "info",
    title: "收到客户回复",
    message: (context) => `${context.customerName}：${context.subject}`,
    dedupeKey: (context) => `mail:${context.customerId}:${context.subject}`,
    actionHref: (context) => `/customers/${context.customerId}/email`,
    actionLabel: "查看邮件"
  }
};
