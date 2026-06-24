import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { TaskSubmissionLockService } from "../../background-tasks/background-tasks.public";

@Injectable()
export class EmailDraftSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskLocks: TaskSubmissionLockService
  ) {}

  async checkAndLock(params: {
    customerId: string;
    organizationId: string;
    purpose: string;
    toEmail: string;
    userId: string;
  }) {
    const existing = await this.findActiveDraftGeneration({
      customerId: params.customerId,
      organizationId: params.organizationId,
      purpose: params.purpose,
      toEmail: params.toEmail
    });
    if (existing) {
      return { accepted: false as const, reason: "ACTIVE_EMAIL_DRAFT_GENERATION_EXISTS" as const, existing };
    }

    const emailScope = [params.customerId, params.purpose, params.toEmail.toLowerCase()].join(":");
    const lockKey = this.taskLocks.buildKey({
      organizationId: params.organizationId,
      type: "email-draft",
      scope: emailScope
    });
    const locked = await this.taskLocks.acquire(lockKey, 300, {
      userId: params.userId,
      customerId: params.customerId,
      purpose: params.purpose,
      toEmail: params.toEmail,
      createdAt: new Date().toISOString()
    });
    if (!locked) {
      const lockedExisting = await this.findActiveDraftGeneration({
        customerId: params.customerId,
        organizationId: params.organizationId,
        purpose: params.purpose,
        toEmail: params.toEmail
      });
      return { accepted: false as const, reason: "EMAIL_DRAFT_SUBMISSION_LOCKED" as const, existing: lockedExisting };
    }

    return { accepted: true as const, lockKey };
  }

  release(lockKey: string) {
    return this.taskLocks.release(lockKey);
  }

  private findActiveDraftGeneration(input: {
    customerId: string;
    organizationId: string;
    purpose: string;
    toEmail: string;
  }) {
    return this.prisma.emailDraft.findFirst({
      where: {
        customerId: input.customerId,
        customer: { organizationId: input.organizationId },
        purpose: input.purpose,
        toEmail: input.toEmail,
        aiGenerationRun: { status: { in: ["QUEUED", "RUNNING"] } }
      },
      orderBy: { createdAt: "desc" },
      include: { aiGenerationRun: true }
    });
  }
}
