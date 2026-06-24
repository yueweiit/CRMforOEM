import { FollowUpTaskType } from "@prisma/client";
import {
  FOLLOW_UP_TASK_DESCRIPTIONS,
  FOLLOW_UP_TASK_TITLES,
  FOLLOW_UP_TASK_TRIGGERS
} from "./follow-up-rule-constants";

export type FollowUpTaskRule = {
  taskType: FollowUpTaskType;
  trigger: string;
  delayDays: number;
  title: string;
  description: string;
};

export const FOLLOW_UP_EMAIL_RULES: Record<string, FollowUpTaskRule[]> = {
  FIRST_OUTREACH: [
    {
      taskType: FollowUpTaskType.SECOND_FOLLOW_UP,
      trigger: FOLLOW_UP_TASK_TRIGGERS.FIRST_EMAIL_SENT,
      delayDays: 3,
      title: FOLLOW_UP_TASK_TITLES.SECOND_FOLLOW_UP,
      description: FOLLOW_UP_TASK_DESCRIPTIONS.SECOND_FOLLOW_UP
    }
  ],
  SECOND_FOLLOW_UP_EXPIRED: [
    {
      taskType: FollowUpTaskType.THIRD_FOLLOW_UP,
      trigger: FOLLOW_UP_TASK_TRIGGERS.SECOND_FOLLOW_UP_EXPIRED,
      delayDays: 4,
      title: FOLLOW_UP_TASK_TITLES.THIRD_FOLLOW_UP,
      description: FOLLOW_UP_TASK_DESCRIPTIONS.THIRD_FOLLOW_UP
    }
  ],
  QUOTATION: [
    {
      taskType: FollowUpTaskType.QUOTE_FOLLOW_UP,
      trigger: FOLLOW_UP_TASK_TRIGGERS.QUOTE_SENT,
      delayDays: 2,
      title: FOLLOW_UP_TASK_TITLES.QUOTE_FOLLOW_UP,
      description: FOLLOW_UP_TASK_DESCRIPTIONS.QUOTE_FOLLOW_UP
    }
  ],
  SAMPLE_FOLLOW_UP: [
    {
      taskType: FollowUpTaskType.SAMPLE_FOLLOW_UP,
      trigger: FOLLOW_UP_TASK_TRIGGERS.SAMPLE_SHIPPED,
      delayDays: 3,
      title: FOLLOW_UP_TASK_TITLES.SAMPLE_FOLLOW_UP,
      description: FOLLOW_UP_TASK_DESCRIPTIONS.SAMPLE_FOLLOW_UP
    }
  ],
  PRODUCT_RECOMMENDATION: [
    {
      taskType: FollowUpTaskType.CUSTOM,
      trigger: FOLLOW_UP_TASK_TRIGGERS.PRODUCT_RECOMMENDATION_SENT,
      delayDays: 3,
      title: "提醒跟进产品推荐反馈",
      description: "请确认客户是否对推荐产品、规格、目录、样品或定制方案感兴趣。"
    }
  ],
  TRADE_SHOW_INVITATION: [
    {
      taskType: FollowUpTaskType.CUSTOM,
      trigger: FOLLOW_UP_TASK_TRIGGERS.TRADE_SHOW_INVITATION_SENT,
      delayDays: 3,
      title: "提醒跟进展会邀约结果",
      description: "请确认客户是否参会、是否需要预约会面，或补充展后跟进行动。"
    }
  ],
  NEW_PRODUCT_LAUNCH: [
    {
      taskType: FollowUpTaskType.CUSTOM,
      trigger: FOLLOW_UP_TASK_TRIGGERS.NEW_PRODUCT_LAUNCH_SENT,
      delayDays: 5,
      title: "提醒跟进新品推荐反馈",
      description: "请确认客户是否需要新品目录、规格、样品或进一步定制信息。"
    }
  ],
  REORDER_REACTIVATION: [
    {
      taskType: FollowUpTaskType.CUSTOM,
      trigger: FOLLOW_UP_TASK_TRIGGERS.REORDER_REACTIVATION_SENT,
      delayDays: 5,
      title: "提醒跟进老客户复购意向",
      description: "请确认客户是否有补货计划、新采购需求，或需要更新目录与报价。"
    }
  ]
};
