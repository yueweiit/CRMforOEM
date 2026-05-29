import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CustomerStage, FollowUpTaskStatus, type FollowUpTaskType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FOLLOW_UP_EMAIL_RULES, type FollowUpTaskRule } from "./follow-up-email-rules";
import {
  FOLLOW_UP_TASK_DESCRIPTIONS,
  FOLLOW_UP_TASK_TITLES,
  FOLLOW_UP_TASK_TRIGGERS
} from "./follow-up-rule-constants";
import { SSE_EVENTS, FollowUpTaskChangedPayload } from "../../common/events/event-types";

@Injectable()
export class FollowUpRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async handleEmailSent(input: { customerId: string; actorUserId: string; purpose?: string }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { ownerId: true }
    });
    if (!customer) return;

    const rules = this.getRulesForPurpose(input.purpose);
    if (!rules.length) return;

    const ownerId = this.resolveOwnerId(customer.ownerId, input.actorUserId);

    for (const rule of rules) {
      await this.createTaskFromRule(input.customerId, ownerId, rule);
    }

    if (rules.length > 0) {
      const orgId = await this.getOrgIdByCustomer(input.customerId);
      if (orgId) {
        const overdueCount = await this.countOverdue(orgId);
        const targetUserIds = Array.from(
          new Set([ownerId, input.actorUserId].filter((value): value is string => Boolean(value)))
        );
        this.eventEmitter.emit(SSE_EVENTS.FOLLOW_UP_TASK_CREATED, {
          orgId,
          targetUserIds,
          taskId: "",
          customerId: input.customerId,
          type: rules[0].taskType,
          overdueCount
        } satisfies FollowUpTaskChangedPayload);
      }
    }
  }

  async handleCustomerReplied(customerId: string) {
    const tasksToCancel = await this.prisma.followUpTask.findMany({
      where: {
        customerId,
        status: { in: [FollowUpTaskStatus.OPEN, FollowUpTaskStatus.OVERDUE] as never },
        type: { in: ["SECOND_FOLLOW_UP", "THIRD_FOLLOW_UP"] as never }
      },
      select: { id: true, type: true }
    });

    await this.prisma.followUpTask.updateMany({
      where: {
        customerId,
        status: { in: [FollowUpTaskStatus.OPEN, FollowUpTaskStatus.OVERDUE] as never },
        type: { in: ["SECOND_FOLLOW_UP", "THIRD_FOLLOW_UP"] as never }
      },
      data: { status: FollowUpTaskStatus.CANCELLED as never }
    });

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { ownerId: true }
    });
    if (!customer?.ownerId) return;

    const orgId = await this.getOrgIdByCustomer(customerId);
    const targetUserIds = Array.from(
      new Set([customer.ownerId].filter((value): value is string => Boolean(value)))
    );
    if (orgId && tasksToCancel.length > 0) {
      const overdueCount = await this.countOverdue(orgId);
      this.eventEmitter.emit(SSE_EVENTS.FOLLOW_UP_TASK_CANCELLED, {
        orgId,
        targetUserIds,
        taskId: "",
        customerId,
        type: tasksToCancel[0]?.type ?? "SECOND_FOLLOW_UP",
        overdueCount
      } satisfies FollowUpTaskChangedPayload);
    }

    const existingRequirementTask = await this.prisma.followUpTask.findFirst({
      where: {
        customerId,
        status: FollowUpTaskStatus.OPEN as never,
        type: { in: ["REQUIREMENT_CONFIRMATION","QUOTE_FOLLOW_UP","SAMPLE_FOLLOW_UP"] } as never
      },
      select: { id: true }
    });
    if (existingRequirementTask) return;

    await this.prisma.followUpTask.create({
      data: {
        customerId,
        ownerId: customer.ownerId,
        type: "REQUIREMENT_CONFIRMATION" as never,
        title: FOLLOW_UP_TASK_TITLES.REQUIREMENT_CONFIRMATION,
        description: FOLLOW_UP_TASK_DESCRIPTIONS.REQUIREMENT_CONFIRMATION,
        trigger: FOLLOW_UP_TASK_TRIGGERS.CUSTOMER_REPLIED,
        dueAt: addHoursFromNow(24)
      }
    });

    if (orgId) {
      const overdueCount = await this.countOverdue(orgId);
      this.eventEmitter.emit(SSE_EVENTS.FOLLOW_UP_TASK_CREATED, {
        orgId,
        targetUserIds,
        taskId: "",
        customerId,
        type: "REQUIREMENT_CONFIRMATION",
        overdueCount
      } satisfies FollowUpTaskChangedPayload);
    }
  }

  async syncExpiredFollowUps(customerId?: string) {
    const expiredSecondTasks = await this.prisma.followUpTask.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        type: "SECOND_FOLLOW_UP" as never,
        status: FollowUpTaskStatus.OPEN as never,
        dueAt: { lt: new Date() }
      },
      include: {
        customer: {
          select: {
            ownerId: true,
            stage: true
          }
        }
      },
      orderBy: { dueAt: "asc" }
    });

    for (const task of expiredSecondTasks) {
      if (hasCustomerProgressed(task.customer.stage)) {
        await this.prisma.followUpTask.update({
          where: { id: task.id },
          data: { status: FollowUpTaskStatus.CANCELLED as never }
        });
        continue;
      }

      const existingThirdTask = await this.prisma.followUpTask.findFirst({
        where: {
          customerId: task.customerId,
          type: "THIRD_FOLLOW_UP" as never,
          status: {
            in: [
              FollowUpTaskStatus.OPEN,
              FollowUpTaskStatus.OVERDUE,
              FollowUpTaskStatus.COMPLETED
            ] as never
          }
        },
        select: { id: true }
      });

      if (existingThirdTask) {
        await this.prisma.followUpTask.update({
          where: { id: task.id },
          data: { status: FollowUpTaskStatus.OVERDUE as never }
        });
        continue;
      }

      const thirdRule = this.getRulesForPurpose("SECOND_FOLLOW_UP_EXPIRED")[0];
      if (!thirdRule) {
        await this.prisma.followUpTask.update({
          where: { id: task.id },
          data: { status: FollowUpTaskStatus.OVERDUE as never }
        });
        continue;
      }

      const thirdDueAt = new Date(task.dueAt);
      thirdDueAt.setDate(thirdDueAt.getDate() + thirdRule.delayDays);

      await this.prisma.$transaction([
        this.prisma.followUpTask.update({
          where: { id: task.id },
          data: { status: FollowUpTaskStatus.OVERDUE as never }
        }),
        this.prisma.followUpTask.create({
          data: {
            customerId: task.customerId,
            ownerId: task.customer.ownerId ?? task.ownerId,
            type: thirdRule.taskType as never,
            title: thirdRule.title,
            description: thirdRule.description,
            trigger: thirdRule.trigger,
            dueAt: thirdDueAt
          }
        })
      ]);
    }
  }

  private getRulesForPurpose(purpose?: string): FollowUpTaskRule[] {
    if (!purpose) return [];
    return FOLLOW_UP_EMAIL_RULES[purpose] ?? [];
  }

  private resolveOwnerId(customerOwnerId: string | null, actorUserId: string) {
    return customerOwnerId ?? actorUserId;
  }


  private async getOrgIdByCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { organizationId: true }
    });
    return customer?.organizationId ?? null;
  }

  private async countOverdue(orgId: string) {
    return this.prisma.followUpTask.count({
      where: {
        status: "OPEN" as never,
        customer: { organizationId: orgId }
      }
    });
  }

  private async createTaskFromRule(customerId: string, ownerId: string, rule: FollowUpTaskRule) {
    await this.prisma.followUpTask.create({
      data: {
        customerId,
        ownerId,
        type: rule.taskType as never,
        title: rule.title,
        description: rule.description,
        trigger: rule.trigger,
        dueAt: addDaysFromNow(rule.delayDays)
      }
    });
  }
}

function addDaysFromNow(days: number) {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);
  return dueAt;
}

function addHoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function hasCustomerProgressed(stage: CustomerStage) {
  const progressedStages: CustomerStage[] = [
    CustomerStage.REPLIED,
    CustomerStage.REQUIREMENT_CONFIRMING,
    CustomerStage.QUOTING,
    CustomerStage.SAMPLING,
    CustomerStage.NEGOTIATING,
    CustomerStage.WON
  ];
  return progressedStages.includes(stage);
}
