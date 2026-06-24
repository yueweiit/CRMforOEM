import { CustomerStage, RiskLevel } from "@prisma/client";

export type CustomerWhere = Record<string, unknown>;

export type DateRange = {
  from: Date;
  to: Date;
  groupBy: "day" | "week" | "month";
};

export const HIGH_VALUE_STAGES: CustomerStage[] = [CustomerStage.QUOTING, CustomerStage.SAMPLING, CustomerStage.NEGOTIATING, CustomerStage.WON];
export const RISK_STAGES: CustomerStage[] = [CustomerStage.BLACKLISTED, CustomerStage.INVALID, CustomerStage.PAUSED];
export const HIGH_RISK_LEVELS: RiskLevel[] = [RiskLevel.HIGH, RiskLevel.BLOCKED];

export function computePriority(
  stage: CustomerStage,
  score: number | null,
  quoteAmount: number,
  nextTaskDueAt: Date | null
): { level: "A" | "B" | "C"; reason: string; tags: string[] } {
  const now = new Date();
  const threeDays = new Date(now.getTime() + 3 * 86_400_000);
  const sevenDays = new Date(now.getTime() + 7 * 86_400_000);

  const reasons: string[] = [];
  const tags: string[] = [];

  const isNegotiating = stage === CustomerStage.NEGOTIATING;
  const hasHighScore = score !== null && score >= 80;
  const hasQuoteAndUrgent = quoteAmount > 0 && nextTaskDueAt !== null && nextTaskDueAt <= threeDays;

  if (isNegotiating) { reasons.push("处于订单谈判阶段"); tags.push("谈判中"); }
  if (hasHighScore) { reasons.push(`OEM 评分 ${score} 分`); tags.push("高评分"); }
  if (hasQuoteAndUrgent) { reasons.push("有报价且任务临期"); tags.push("报价中"); tags.push("任务临期"); }

  if (isNegotiating || hasHighScore || hasQuoteAndUrgent) {
    return { level: "A", reason: reasons.join("，"), tags };
  }

  const isQuotingOrSampling = stage === CustomerStage.QUOTING || stage === CustomerStage.SAMPLING;
  const hasMediumScore = score !== null && score >= 60 && score < 80;
  const hasTaskSoon = nextTaskDueAt !== null && nextTaskDueAt <= sevenDays;

  if (isQuotingOrSampling) {
    reasons.push(stage === CustomerStage.QUOTING ? "处于报价阶段" : "处于样品阶段");
    tags.push(stage === CustomerStage.QUOTING ? "报价中" : "样品中");
  }
  if (hasMediumScore) { reasons.push(`OEM 评分 ${score} 分`); tags.push("中等评分"); }
  if (hasTaskSoon) { reasons.push("7 天内有跟进任务"); tags.push("任务临期"); }

  if (isQuotingOrSampling || hasMediumScore || hasTaskSoon) {
    return { level: "B", reason: reasons.join("，"), tags };
  }

  return { level: "C", reason: "常规推进客户", tags: ["常规推进"] };
}

export function priorityRank(level: string): number {
  if (level === "A") return 0;
  if (level === "B") return 1;
  return 2;
}
