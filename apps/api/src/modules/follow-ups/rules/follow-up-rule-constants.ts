export const FOLLOW_UP_TASK_TITLES = {
  SECOND_FOLLOW_UP: "提醒发送第二次跟进邮件",
  THIRD_FOLLOW_UP: "提醒发送产品推荐邮件",
  REQUIREMENT_CONFIRMATION: "提醒业务员 24 小时内确认客户需求",
  QUOTE_FOLLOW_UP: "提醒业务员跟进报价反馈",
  SAMPLE_FOLLOW_UP: "提醒业务员跟进样品测试结果",
  PRODUCT_RECOMMENDATION_SENT: "提醒跟进产品推荐反馈",
  TRADE_SHOW_INVITATION_SENT: "提醒跟进展会邀约结果",
  NEW_PRODUCT_LAUNCH_SENT: "提醒跟进新品推荐反馈",
  REORDER_REACTIVATION_SENT: "提醒跟进老客户复购意向"
} as const;

export const FOLLOW_UP_TASK_DESCRIPTIONS = {
  SECOND_FOLLOW_UP: "若客户在首封邮件发送后 3 天内未回复，请业务员人工确认并发送第二次跟进邮件。",
  THIRD_FOLLOW_UP: "二次跟进任务已过期且客户仍未回复，请业务员发送产品推送邮件。",
  REQUIREMENT_CONFIRMATION: "客户已回复，请在 24 小时内确认客户采购需求并推进下一步动作。",
  QUOTE_FOLLOW_UP: "报价邮件发送后 2 个工作日，请业务员确认客户对报价的反馈。",
  SAMPLE_FOLLOW_UP: "样品推进邮件发送后 3 个工作日，请业务员确认录入样品、样品测试和审核结果。",
  PRODUCT_RECOMMENDATION_SENT: "产品推荐邮件发送后3个工作日，请确认客户是否对推荐产品、规格、目录、样品或定制方案感兴趣。",
  TRADE_SHOW_INVITATION_SENT: "展会邀约邮件发送后3个工作日，请确认客户是否参会、是否需要预约会面，或补充展后跟进行动。",
  NEW_PRODUCT_LAUNCH_SENT: "新品推荐邮件发送后5个工作日，请确认客户是否需要新品目录、规格、样品或进一步定制信息。",
  REORDER_REACTIVATION_SENT: "老客户复购意向邮件发送后5个工作日，请确认客户是否有补货计划、新采购需求，或需要更新目录与报价。"
} as const;

export const FOLLOW_UP_TASK_TRIGGERS = {
  FIRST_EMAIL_SENT: "FIRST_EMAIL_SENT",
  SECOND_FOLLOW_UP_EXPIRED: "SECOND_FOLLOW_UP_EXPIRED",
  CUSTOMER_REPLIED: "CUSTOMER_REPLIED",
  QUOTE_SENT: "QUOTE_SENT",
  SAMPLE_SHIPPED: "SAMPLE_SHIPPED",
  PRODUCT_RECOMMENDATION_SENT: "PRODUCT_RECOMMENDATION_SENT",
  TRADE_SHOW_INVITATION_SENT: "TRADE_SHOW_INVITATION_SENT",
  NEW_PRODUCT_LAUNCH_SENT: "NEW_PRODUCT_LAUNCH_SENT",
  REORDER_REACTIVATION_SENT: "REORDER_REACTIVATION_SENT"
} as const;
