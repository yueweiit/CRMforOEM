export const FOLLOW_UP_TASK_TITLES = {
  SECOND_FOLLOW_UP: "提醒发送第二次跟进邮件",
  THIRD_FOLLOW_UP: "提醒发送第三次跟进邮件",
  REQUIREMENT_CONFIRMATION: "提醒业务员 24 小时内确认客户需求",
  QUOTE_FOLLOW_UP: "提醒业务员跟进报价反馈",
  SAMPLE_FOLLOW_UP: "提醒业务员跟进样品测试结果"
} as const;

export const FOLLOW_UP_TASK_DESCRIPTIONS = {
  SECOND_FOLLOW_UP: "若客户在首封邮件发送后 3 天内未回复，请业务员人工确认并发送第二次跟进邮件。",
  THIRD_FOLLOW_UP: "二次跟进任务已过期且客户仍未回复，请业务员发送第三次跟进邮件。",
  REQUIREMENT_CONFIRMATION: "客户已回复，请在 24 小时内确认客户采购需求并推进下一步动作。",
  QUOTE_FOLLOW_UP: "报价邮件发送后 2 个工作日，请业务员确认客户对报价的反馈。",
  SAMPLE_FOLLOW_UP: "样品推进邮件发送后 3 个工作日，请业务员确认录入样品、样品测试和审核结果。"
} as const;

export const FOLLOW_UP_TASK_TRIGGERS = {
  FIRST_EMAIL_SENT: "FIRST_EMAIL_SENT",
  SECOND_FOLLOW_UP_EXPIRED: "SECOND_FOLLOW_UP_EXPIRED",
  CUSTOMER_REPLIED: "CUSTOMER_REPLIED",
  QUOTE_SENT: "QUOTE_SENT",
  SAMPLE_SHIPPED: "SAMPLE_SHIPPED"
} as const;
