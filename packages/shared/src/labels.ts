import { DEFAULT_LOCALE, type Locale } from "./i18n";

const LOCALIZED_STAGE_LABELS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    PENDING_RESEARCH: "待背调",
    RESEARCHING: "背调中",
    RESEARCHED: "已背调",
    PENDING_EMAIL_GENERATION: "待生成邮件",
    PENDING_EMAIL_SEND: "待发送邮件",
    FIRST_EMAIL_SENT: "已发送首封邮件",
    PENDING_SECOND_FOLLOW_UP: "待二次跟进",
    REPLIED: "客户已回复",
    REQUIREMENT_CONFIRMING: "需求确认中",
    QUOTING: "报价中",
    SAMPLING: "样品中",
    NEGOTIATING: "订单谈判",
    WON: "已成交",
    PAUSED: "暂缓开发",
    INVALID: "无效客户",
    BLACKLISTED: "黑名单"
  },
  "en-US": {
    PENDING_RESEARCH: "Pending research",
    RESEARCHING: "Researching",
    RESEARCHED: "Researched",
    PENDING_EMAIL_GENERATION: "Pending email generation",
    PENDING_EMAIL_SEND: "Pending email send",
    FIRST_EMAIL_SENT: "First email sent",
    PENDING_SECOND_FOLLOW_UP: "Pending second follow-up",
    REPLIED: "Customer replied",
    REQUIREMENT_CONFIRMING: "Confirming requirements",
    QUOTING: "Quoting",
    SAMPLING: "Sampling",
    NEGOTIATING: "Negotiating",
    WON: "Won",
    PAUSED: "Paused",
    INVALID: "Invalid",
    BLACKLISTED: "Blacklisted"
  },
  "es-ES": {
    PENDING_RESEARCH: "Pendiente de investigacion",
    RESEARCHING: "Investigando",
    RESEARCHED: "Investigado",
    PENDING_EMAIL_GENERATION: "Pendiente de generar email",
    PENDING_EMAIL_SEND: "Pendiente de enviar email",
    FIRST_EMAIL_SENT: "Primer email enviado",
    PENDING_SECOND_FOLLOW_UP: "Pendiente de segundo seguimiento",
    REPLIED: "Cliente respondio",
    REQUIREMENT_CONFIRMING: "Confirmando requisitos",
    QUOTING: "Cotizando",
    SAMPLING: "Muestras",
    NEGOTIATING: "Negociacion",
    WON: "Ganado",
    PAUSED: "Pausado",
    INVALID: "No valido",
    BLACKLISTED: "Lista negra"
  }
};

export const STAGE_LABELS = LOCALIZED_STAGE_LABELS[DEFAULT_LOCALE];

export function stageLabel(stage: string, locale: Locale = DEFAULT_LOCALE) {
  return LOCALIZED_STAGE_LABELS[locale]?.[stage] ?? LOCALIZED_STAGE_LABELS[DEFAULT_LOCALE]?.[stage] ?? stage;
}

const LOCALIZED_TASK_TYPE_LABELS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    COMPLETE_RESEARCH: "完成客户调研",
    GENERATE_EMAIL: "生成邮件",
    REVIEW_EMAIL: "审核邮件",
    SECOND_FOLLOW_UP: "二次跟进",
    THIRD_FOLLOW_UP: "三次跟进",
    REQUIREMENT_CONFIRMATION: "需求确认",
    QUOTE_FOLLOW_UP: "报价跟进",
    SAMPLE_FOLLOW_UP: "样品跟进",
    STAGE_STALE_REMINDER: "阶段停滞提醒",
    CUSTOM: "自定义任务"
  },
  "en-US": {
    COMPLETE_RESEARCH: "Complete customer research",
    GENERATE_EMAIL: "Generate email",
    REVIEW_EMAIL: "Review email",
    SECOND_FOLLOW_UP: "Second follow-up",
    THIRD_FOLLOW_UP: "Third follow-up",
    REQUIREMENT_CONFIRMATION: "Requirement confirmation",
    QUOTE_FOLLOW_UP: "Quote follow-up",
    SAMPLE_FOLLOW_UP: "Sample follow-up",
    STAGE_STALE_REMINDER: "Stage stale reminder",
    CUSTOM: "Custom task"
  },
  "es-ES": {
    COMPLETE_RESEARCH: "Completar investigacion del cliente",
    GENERATE_EMAIL: "Generar email",
    REVIEW_EMAIL: "Revisar email",
    SECOND_FOLLOW_UP: "Segundo seguimiento",
    THIRD_FOLLOW_UP: "Tercer seguimiento",
    REQUIREMENT_CONFIRMATION: "Confirmacion de requisitos",
    QUOTE_FOLLOW_UP: "Seguimiento de cotizacion",
    SAMPLE_FOLLOW_UP: "Seguimiento de muestra",
    STAGE_STALE_REMINDER: "Recordatorio de etapa detenida",
    CUSTOM: "Tarea personalizada"
  }
};

export const TASK_TYPE_LABELS = LOCALIZED_TASK_TYPE_LABELS[DEFAULT_LOCALE];

export function taskTypeLabel(type: string, locale: Locale = DEFAULT_LOCALE) {
  return LOCALIZED_TASK_TYPE_LABELS[locale]?.[type] ?? LOCALIZED_TASK_TYPE_LABELS[DEFAULT_LOCALE]?.[type] ?? type;
}

const LOCALIZED_FOLLOW_UP_TASK_STATUS_LABELS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    OPEN: "待处理",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    OVERDUE: "已逾期"
  },
  "en-US": {
    OPEN: "Open",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    OVERDUE: "Overdue"
  },
  "es-ES": {
    OPEN: "Abierta",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
    OVERDUE: "Vencida"
  }
};

export const FOLLOW_UP_TASK_STATUS_LABELS = LOCALIZED_FOLLOW_UP_TASK_STATUS_LABELS[DEFAULT_LOCALE];

export function followUpTaskStatusLabel(status: string, locale: Locale = DEFAULT_LOCALE) {
  return LOCALIZED_FOLLOW_UP_TASK_STATUS_LABELS[locale]?.[status] ?? LOCALIZED_FOLLOW_UP_TASK_STATUS_LABELS[DEFAULT_LOCALE]?.[status] ?? status;
}

const LOCALIZED_QUOTE_FLOW_STATUS_LABELS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    DRAFT: "新建",
    PENDING_APPROVAL: "提交审批",
    APPROVED: "审批通过",
    REJECTED: "审批驳回",
    CUSTOMER_REJECTED: "客户拒绝",
    SENT: "已发送",
    ACCEPTED: "客户接受",
    EXPIRED: "到期失效",
    VOIDED: "作废关闭"
  },
  "en-US": {
    DRAFT: "Draft",
    PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CUSTOMER_REJECTED: "Customer rejected",
    SENT: "Sent",
    ACCEPTED: "Accepted by customer",
    EXPIRED: "Expired",
    VOIDED: "Voided"
  },
  "es-ES": {
    DRAFT: "Borrador",
    PENDING_APPROVAL: "Pendiente de aprobacion",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
    CUSTOMER_REJECTED: "Rechazado por cliente",
    SENT: "Enviado",
    ACCEPTED: "Aceptado por cliente",
    EXPIRED: "Vencido",
    VOIDED: "Anulado"
  }
} as const;

export const QUOTE_FLOW_STATUS_LABELS = LOCALIZED_QUOTE_FLOW_STATUS_LABELS[DEFAULT_LOCALE];

export type QuoteFlowStatus = keyof typeof QUOTE_FLOW_STATUS_LABELS;

export function quoteFlowStatusLabel(status: string, locale: Locale = DEFAULT_LOCALE) {
  return LOCALIZED_QUOTE_FLOW_STATUS_LABELS[locale]?.[status as QuoteFlowStatus] ?? LOCALIZED_QUOTE_FLOW_STATUS_LABELS[DEFAULT_LOCALE]?.[status as QuoteFlowStatus] ?? status;
}
