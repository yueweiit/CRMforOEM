import { Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CustomerStage, FollowUpTaskStatus } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerStageService } from "../customers/customer-stage.service";
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { FollowUpRulesService } from "./follow-up-rules.service";
import { FOLLOW_UP_STAGE_RULES } from "./follow-up-stage-rules";
import { UpdateFollowUpTaskDto } from "./dto/update-follow-up-task.dto";
import { SSE_EVENTS, FollowUpTaskChangedPayload } from "../../common/events/event-types";

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUpRules: FollowUpRulesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly customerStageService: CustomerStageService
  ) {}

  async list(user: RequestUser, status?: string) {
    await this.followUpRules.syncExpiredFollowUps();
    return this.prisma.followUpTask.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        customer: buildCustomerDataScopeWhere(user)
      },
      include: {
        customer: { select: { id: true, name: true, stage: true, websiteDomain: true } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: [{ dueAt: "asc" }]
    });
  }

  async countDueSoonOpen(user: RequestUser) {
    await this.followUpRules.syncExpiredFollowUps();
    const count = await this.prisma.followUpTask.count({
      where: {
        status: FollowUpTaskStatus.Open as never,
        customer: buildCustomerDataScopeWhere(user)
      }
    });
    return { count };
  }

  async create(user: RequestUser, dto: CreateFollowUpTaskDto) {
    const customer = await this.ensureCustomerVisible(user, dto.customerId);
    return this.prisma.followUpTask.create({
      data: {
        customerId: dto.customerId,
        ownerId: dto.ownerId ?? customer.ownerId ?? user.id,
        type: dto.type as never,
        title: dto.title,
        description: dto.description,
        trigger: dto.trigger,
        dueAt: new Date(dto.dueAt)
      }
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateFollowUpTaskDto) {
    await this.ensureVisibleTask(user, id);
    return this.prisma.followUpTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: dto.status as never
      }
    });
  }

  async complete(user: RequestUser, id: string) {
    const task = await this.ensureVisibleTask(user, id);

    const completedTask = await this.prisma.followUpTask.update({
      where: { id },
      data: {
        status: FollowUpTaskStatus.Completed as never,
        completedAt: new Date()
      }
    });

    const nextStage = this.getNextStageForCompletedTask(task.type);
    if (nextStage) {
      await this.customerStageService.advanceCustomerStage({
        customerId: task.customerId,
        toStage: nextStage as CustomerStage,
        changedById: user.id,
        reason: `Task completed: ${task.type}`
      });
    }

    const overdueCount = await this.prisma.followUpTask.count({
      where: {
        status: "OPEN" as never,
        customer: { organizationId: user.organizationId }
      }
    });
    this.eventEmitter.emit(SSE_EVENTS.FOLLOW_UP_TASK_COMPLETED, {
      orgId: user.organizationId,
      targetUserIds: [user.id],
      taskId: id,
      customerId: task.customerId,
      type: task.type,
      overdueCount
    } satisfies FollowUpTaskChangedPayload);

    return completedTask;
  }

  async createByRule(input: {
    customerId: string;
    ownerId: string;
    type: string;
    title: string;
    trigger: string;
    dueAt: Date;
    description?: string;
  }) {
    return this.prisma.followUpTask.create({
      data: {
        customerId: input.customerId,
        ownerId: input.ownerId,
        type: input.type as never,
        title: input.title,
        description: input.description,
        trigger: input.trigger,
        dueAt: input.dueAt
      }
    });
  }

  private async ensureVisibleTask(user: RequestUser, id: string) {
    const task = await this.prisma.followUpTask.findFirst({
      where: { id, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!task) {
      throw new NotFoundException("Follow-up task not found");
    }
    return task;
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private getNextStageForCompletedTask(taskType: string) {
    return FOLLOW_UP_STAGE_RULES[taskType]?.nextStage ?? null;
  }
}
