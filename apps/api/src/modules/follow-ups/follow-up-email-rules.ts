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
  QUOTE_FOLLOW_UP: [
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
  ]
};
