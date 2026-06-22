export const STAGE_LABELS: Record<string, string> = {
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
};

export function stageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? stage;
}

export const TASK_TYPE_LABELS: Record<string, string> = {
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
};

export function taskTypeLabel(type: string) {
  return TASK_TYPE_LABELS[type] ?? type;
}
