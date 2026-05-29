export type FollowUpStageTransitionRule = {
  taskType: string;
  nextStage: string;
};

export const FOLLOW_UP_STAGE_RULES: Record<string, FollowUpStageTransitionRule> = {
  SECOND_FOLLOW_UP: {
    taskType: "SECOND_FOLLOW_UP",
    nextStage: "PENDING_SECOND_FOLLOW_UP"
  },
  THIRD_FOLLOW_UP: {
    taskType: "THIRD_FOLLOW_UP",
    nextStage: "PENDING_SECOND_FOLLOW_UP"
  },
  REQUIREMENT_CONFIRMATION: {
    taskType: "REQUIREMENT_CONFIRMATION",
    nextStage: "QUOTING"
  },
  QUOTE_FOLLOW_UP: {
    taskType: "QUOTE_FOLLOW_UP",
    nextStage: "SAMPLING"
  },
  SAMPLE_FOLLOW_UP: {
    taskType: "SAMPLE_FOLLOW_UP",
    nextStage: "NEGOTIATING"
  }
};
